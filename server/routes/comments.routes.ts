import { Router } from 'express';
import { CommentModel } from '../models/Comment';
import { PostModel } from '../models/Post';
import { createNotification } from '../createNotification';
import { requireAuth } from '../jwtAuth';
import { validate, createCommentSchema } from '../validation';
import { commentToJson, getId, Doc } from '../formatResponse';
import { emitToUser } from '../socketServer';
import { getFriendAndBlockedIds, canView, canViewContent, emitToAllowedViewers } from '../privacyRules';

// API bình luận (/api/comments): xem, thêm (hoặc trả lời), xoá, thích bình luận.
// Chỉ ai xem được bài viết mới được xem / bình luận / thích bình luận trong bài đó.

export const commentsRouter = Router();
commentsRouter.use(requireAuth);

const canViewPost = (post: Doc, userId: string) => canView(post.author.toString(), userId, post.privacy);

/** GET /api/comments?postId=... — bình luận của một bài; không có postId thì lấy của mọi bài mình được xem. */
commentsRouter.get('/', async (req, res) => {
  const { postId } = req.query;
  if (typeof postId === 'string') {
    const post = await PostModel.findById(postId).select('author privacy'); //Tìm bài viết theo id
    if (!post) return res.json({ comments: [] });
    if (!(await canViewPost(post, req.userId))) return res.status(403).json({ error: 'Bạn không có quyền xem bình luận của bài viết này.' });
    const comments = await CommentModel.find({ post: postId }).sort({ createdAt: 1 }).limit(500).populate('author');
    return res.json({ comments: comments.map(commentToJson) });
  }

  const [posts, { friendIds, blockedIds }] = await Promise.all([PostModel.find().select('author privacy'), getFriendAndBlockedIds(req.userId)]);
  const visiblePostIds = posts
    .filter((p: Doc) => canViewContent(getId(p.author), req.userId, p.privacy, friendIds, blockedIds))
    .map((p: Doc) => p._id);
  const comments = await CommentModel.find({ post: { $in: visiblePostIds } }).sort({ createdAt: 1 }).limit(20000).populate('author');
  res.json({ comments: comments.map(commentToJson) });
});

/**
 * POST /api/comments — thêm bình luận (có parentId = trả lời một bình luận khác).
 * Báo cho tác giả bài viết và những người được gắn thẻ, đồng thời đẩy bình luận mới tới họ qua realtime.
 */
commentsRouter.post('/', validate(createCommentSchema), async (req, res) => {
  const { postId, content, image, parentId, taggedUserIds = [] } = req.body;
  const me = req.userId;
  const post = await PostModel.findById(postId);
  if (!post || !(await canViewPost(post, me))) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });

  const tagged: string[] = [...new Set<string>(taggedUserIds)].filter((id) => id !== me);
  const comment = await CommentModel.create({ post: postId, author: me, content, image, parent: parentId, taggedUsers: tagged });
  await comment.populate(['author', 'taggedUsers']);

  post.commentsCount = (post.commentsCount || 0) + 1;
  await post.save();

  const authorId = post.author.toString();
  const target = { targetId: postId, targetType: 'post' as const };
  if (authorId !== me) {
    await createNotification({ user: authorId, actor: me, type: 'comment', content: `đã bình luận về bài viết của bạn: "${content.slice(0, 30)}..."`, ...target });
  }
  const taggedOthers = tagged.filter((id) => id !== authorId);
  await Promise.all(taggedOthers.map((id) => createNotification({ user: id, actor: me, type: 'system', content: 'đã gắn thẻ bạn trong một bình luận.', ...target })));

  const json = commentToJson(comment);
  const receivers = new Set([...(authorId !== me ? [authorId] : []), ...tagged]);
  receivers.forEach((id) => emitToUser(id, 'comment:new', { postId, comment: json }));
  res.json({ comment: json });
});

/** DELETE /api/comments/:id — người viết bình luận hoặc chủ bài viết được xoá. */
commentsRouter.delete('/:id', async (req, res) => {
  const comment = await CommentModel.findById(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Không tìm thấy bình luận.' });
  const post = await PostModel.findById(comment.post);
  const isAuthor = comment.author.toString() === req.userId;
  const isPostOwner = post?.author.toString() === req.userId;
  if (!isAuthor && !isPostOwner) return res.status(403).json({ error: 'Bạn không có quyền xóa bình luận này.' });

  // Chủ bài xoá bình luận của người khác → báo cho người viết bình luận
  if (!isAuthor) {
    await createNotification({ user: comment.author.toString(), actor: req.userId, type: 'system', content: 'đã xóa bình luận của bạn khỏi bài viết của họ.', targetId: post.id, targetType: 'post' });
  }
  await comment.deleteOne();
  if (post) {
    post.commentsCount = Math.max(0, (post.commentsCount || 0) - 1);
    await post.save();
  }
  res.json({ ok: true });
  if (post) emitToAllowedViewers(post.privacy, post.author.toString(), 'comment:delete', { postId: post.id, commentId: comment.id }, req.userId);
});

/** POST /api/comments/:id/like — thích / bỏ thích (đã thích thì gỡ ra, chưa thích thì thêm vào). */
commentsRouter.post('/:id/like', async (req, res) => {
  const comment = await CommentModel.findById(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Không tìm thấy bình luận.' });
  const post = await PostModel.findById(comment.post).select('author privacy');
  if (post && !(await canViewPost(post, req.userId))) return res.status(403).json({ error: 'Bạn không có quyền tương tác với bình luận này.' });

  const liked = comment.likes.some((id: Doc) => id.toString() === req.userId);
  await CommentModel.updateOne({ _id: comment._id }, liked ? { $pull: { likes: req.userId } } : { $addToSet: { likes: req.userId } });
  const fresh = await CommentModel.findById(comment._id).populate('author');
  res.json({ comment: commentToJson(fresh) });
});

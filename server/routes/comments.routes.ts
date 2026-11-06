import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { CommentModel } from '../models/Comment';
import { PostModel } from '../models/Post';
import { createNotification } from '../createNotification';
import { requireAuth } from '../jwtAuth';
import { validate, createCommentSchema, updateCommentSchema, reactPostSchema } from '../validation';
import { commentToJson, getId } from '../formatResponse';
import { emitToUser } from '../socketServer';
import { emitToAllowedViewers } from '../privacyRules';
import { canViewPost, canInteractPost, emitToGroupMembers, getMembership, getMemberIds, isGroupAdmin } from '../groupRules';

// API bình luận (/api/comments): xem, thêm (hoặc trả lời), sửa, xoá, thả cảm xúc (like / love / haha / wow / sad / angry).
// Chỉ ai xem được bài viết mới được xem / bình luận / thích bình luận trong bài đó.

export const commentsRouter = Router();
commentsRouter.use(requireAuth);

/** Lấy bình luận của MỘT bài (bắt buộc ?postId=; tối đa 500, cũ nhất trước). Bài không tồn tại → danh sách rỗng. */
commentsRouter.get('/', async (req, res) => {
  const { postId } = req.query;
  if (typeof postId !== 'string') return res.status(400).json({ error: 'Thiếu postId.' });
  const post = await PostModel.findById(postId).select('author privacy group groupStatus');
  if (!post) return res.json({ comments: [] });
  if (!(await canViewPost(post, req.userId))) return res.status(403).json({ error: 'Bạn không có quyền xem bình luận của bài viết này.' });
  const comments = await CommentModel.find({ post: postId }).sort({ createdAt: 1 }).limit(500).populate('author');
  res.json({ comments: comments.map(commentToJson) });
});

/** Thêm bình luận / trả lời bình luận */
commentsRouter.post('/', validate(createCommentSchema), async (req, res) => {
  const { postId, content, image, parentId, taggedUserIds = [] } = req.body;
  const me = req.userId;
  const post = await PostModel.findById(postId);
  if (!post || !(await canInteractPost(post, me))) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  if (post.commentsDisabled) return res.status(403).json({ error: 'Chủ bài viết đã tắt bình luận.' });

  if (parentId) {
    const parent = await CommentModel.findById(parentId).select('post');
    if (!parent || parent.post.toString() !== postId) return res.status(400).json({ error: 'Bình luận được trả lời không thuộc bài viết này.' });
  }
  if (!content && !image) return res.status(400).json({ error: 'Bình luận không được để trống.' });

  let tagged: string[] = [...new Set<string>(taggedUserIds)].filter((id) => id !== me);
  // Bài trong nhóm: chỉ gắn thẻ được thành viên của nhóm (người ngoài không được nhận nội dung bình luận)
  if (post.group) {
    const memberIds = new Set(await getMemberIds(post.group.toString()));
    tagged = tagged.filter((id) => memberIds.has(id));
  }
  const comment = await CommentModel.create({ post: postId, author: me, content, image, parent: parentId, taggedUsers: tagged });
  await comment.populate(['author', 'taggedUsers']);

  // Cập nhật nguyên tử ($inc) để nhiều người bình luận cùng lúc không làm mất lượt đếm
  await PostModel.updateOne({ _id: post._id }, { $inc: { commentsCount: 1 } });

  const authorId = post.author.toString();
  const target = { targetId: postId, targetType: 'post' as const };
  if (authorId !== me) {
    await createNotification({ user: authorId, actor: me, type: 'comment', content: `đã bình luận về bài viết của bạn: "${content.slice(0, 30)}..."`, commentId: comment.id, ...target });
  }
  const taggedOthers = tagged.filter((id) => id !== authorId);
  await Promise.all(taggedOthers.map((id) => createNotification({ user: id, actor: me, type: 'system', content: 'đã gắn thẻ bạn trong một bình luận.', commentId: comment.id, ...target })));

  const json = commentToJson(comment);
  const receivers = new Set([...(authorId !== me ? [authorId] : []), ...tagged]);
  receivers.forEach((id) => emitToUser(id, 'comment:new', { postId, comment: json }));
  res.json({ comment: json });
});

/** Xoá bình luận */
commentsRouter.delete('/:id', async (req, res) => {
  const comment = await CommentModel.findById(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Không tìm thấy bình luận.' });
  const post = await PostModel.findById(comment.post);
  const isAuthor = comment.author.toString() === req.userId;
  // Chủ bài viết được xoá bình luận trong bài; bài trong nhóm thì quản trị viên nhóm cũng được
  const isPostOwner = post?.author.toString() === req.userId || (!!post?.group && isGroupAdmin(await getMembership(post.group.toString(), req.userId)));
  if (!isAuthor && !isPostOwner) return res.status(403).json({ error: 'Bạn không có quyền xóa bình luận này.' });

  // Chủ bài xoá bình luận của người khác → báo cho người viết bình luận
  if (!isAuthor) {
    await createNotification({ user: comment.author.toString(), actor: req.userId, type: 'system', content: 'đã xóa bình luận của bạn khỏi bài viết của họ.', targetId: post.id, targetType: 'post' });
  }
  await comment.deleteOne();
  if (post) await PostModel.updateOne({ _id: post._id }, [{ $set: { commentsCount: { $max: [0, { $subtract: [{ $ifNull: ['$commentsCount', 0] }, 1] }] } } }], { updatePipeline: true });
  res.json({ ok: true });
  if (post?.group) emitToGroupMembers(post.group.toString(), 'comment:delete', { postId: post.id, commentId: comment.id }, { exclude: req.userId });
  else if (post) emitToAllowedViewers(post.privacy, post.author.toString(), 'comment:delete', { postId: post.id, commentId: comment.id }, req.userId);
});

/** Sửa nội dung bình luận (chỉ tác giả). Bình luận chỉ có ảnh thì được để trống chữ. */
commentsRouter.patch('/:id', validate(updateCommentSchema), async (req, res) => {
  const comment = await CommentModel.findById(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Không tìm thấy bình luận.' });
  if (comment.author.toString() !== req.userId) return res.status(403).json({ error: 'Bạn không có quyền sửa bình luận này.' });
  if (!req.body.content && !comment.image) return res.status(400).json({ error: 'Bình luận không được để trống.' });

  comment.content = req.body.content;
  comment.editedAt = new Date();
  await comment.save();
  await comment.populate(['author', 'taggedUsers']);
  const json = commentToJson(comment);
  res.json({ comment: json });

  // Báo realtime cho những người nhận bình luận gốc (chủ bài + người được gắn thẻ) để họ thấy nội dung mới ngay
  const post = await PostModel.findById(comment.post).select('author');
  const receivers = new Set<string>([...(post ? [post.author.toString()] : []), ...comment.taggedUsers.map(getId)]);
  receivers.delete(req.userId);
  receivers.forEach((id) => emitToUser(id, 'comment:update', { postId: comment.post.toString(), comment: json }));
});

/** Áp dụng cảm xúc lên bình luận: cùng loại với cảm xúc hiện tại thì bỏ, khác loại thì đổi, chưa có thì thêm. */
async function reactToComment(req: Request, res: Response, type: string) {
  const comment = await CommentModel.findById(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Không tìm thấy bình luận.' });
  const post = await PostModel.findById(comment.post).select('author privacy group groupStatus');
  if (post && !(await canInteractPost(post, req.userId))) return res.status(403).json({ error: 'Bạn không có quyền tương tác với bình luận này.' });

  // MỘT cập nhật nguyên tử (pipeline) trên cả likes và reactions: cùng loại với cảm xúc hiện tại thì bỏ, khác loại thì đổi, chưa có thì thêm.
  const me = new mongoose.Types.ObjectId(req.userId);
  const likes = { $ifNull: ['$likes', []] };
  const reactions = { $ifNull: ['$reactions', []] };
  const myOtherTypes = { $map: { input: { $filter: { input: reactions, cond: { $eq: ['$$this.userId', me] } } }, as: 'r', in: '$$r.type' } };
  const isSame = type === 'like' ? { $in: [me, likes] } : { $in: [type, myOtherTypes] };
  const otherLikes = { $filter: { input: likes, cond: { $ne: ['$$this', me] } } };
  const otherReactions = { $filter: { input: reactions, cond: { $ne: ['$$this.userId', me] } } };
  await CommentModel.updateOne(
    { _id: comment._id },
    [
      {
        $set: {
          likes: { $cond: [{ $or: [isSame, { $ne: [type, 'like'] }] }, otherLikes, { $concatArrays: [otherLikes, [me]] }] },
          reactions: { $cond: [{ $or: [isSame, { $eq: [type, 'like'] }] }, otherReactions, { $concatArrays: [otherReactions, [{ type, userId: me }]] }] },
        },
      },
    ],
    { updatePipeline: true }
  );
  const fresh = await CommentModel.findById(comment._id).populate('author');
  res.json({ comment: commentToJson(fresh) });
}

/** Thích / bỏ thích bình luận */
commentsRouter.post('/:id/like', (req, res) => reactToComment(req, res, 'like'));

/** Thả / đổi / bỏ cảm xúc bình luận */
commentsRouter.post('/:id/react', validate(reactPostSchema), (req, res) => reactToComment(req, res, req.body.type));

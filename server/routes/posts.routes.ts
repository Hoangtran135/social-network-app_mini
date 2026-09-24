import { Router } from 'express';
import { PostModel } from '../models/Post';
import { createNotification } from '../createNotification';
import { requireAuth } from '../jwtAuth';
import { validate, createPostSchema, updatePostSchema, reactPostSchema, sharePostSchema } from '../validation';
import { postToJson, getId, Doc } from '../formatResponse';
import { getFriendAndBlockedIds, canView, canViewContent, emitToAllowedViewers } from '../privacyRules';

// API bài viết (/api/posts): bảng tin, kỷ niệm, đăng / sửa / xoá bài, thả cảm xúc, ghim, lưu, chia sẻ.
// Mọi thay đổi đều được đẩy realtime tới những người được xem bài (post:new / post:update / post:delete).

export const postsRouter = Router();
postsRouter.use(requireAuth);

// Các trường cần "populate" (thay id bằng thông tin đầy đủ) mỗi khi trả bài viết về client
const POPULATE = ['author', 'wallOwner', 'reactions.userId', 'savedBy', 'taggedUsers'];

/** Gửi bài viết realtime tới người được xem */
const emitPostToViewers = (post: Doc, event: 'post:new' | 'post:update') =>
  emitToAllowedViewers(post.privacy, getId(post.author), event, { post: postToJson(post) });

/** Lấy bài viết nếu được xem */
async function findPostIfVisible(id: string, userId: string) {
  const post = await PostModel.findById(id).populate(POPULATE);
  return post && (await canView(getId(post.author), userId, post.privacy)) ? post : null;
}

/** Lấy bảng tin */
postsRouter.get('/', async (req, res) => {
  const posts = await PostModel.find()
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 30, 100))
    .skip(Number(req.query.skip) || 0)
    .populate(POPULATE);
  const { friendIds, blockedIds } = await getFriendAndBlockedIds(req.userId);
  const visible = posts.filter((p: Doc) => canViewContent(getId(p.author), req.userId, p.privacy, friendIds, blockedIds));
  res.json({ posts: visible.map((p: Doc) => postToJson(p, req.userId)) });
});

/** Lấy kỷ niệm (phải đặt trước '/:id') */
postsRouter.get('/memories', async (req, res) => {
  const now = new Date();
  const posts = await PostModel.find({ author: req.userId, createdAt: { $lt: new Date(now.getFullYear(), 0, 1) } })
    .sort({ createdAt: -1 })
    .populate(POPULATE);
  const memories = posts.filter((p: Doc) => p.createdAt.getDate() === now.getDate() && p.createdAt.getMonth() === now.getMonth());
  res.json({ posts: memories.map((p: Doc) => postToJson(p, req.userId)) });
});

/** Lấy chi tiết bài viết */
postsRouter.get('/:id', async (req, res) => {
  const post = await findPostIfVisible(req.params.id, req.userId);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  res.json({ post: postToJson(post, req.userId) });
});

/** Đăng bài viết */
postsRouter.post('/', validate(createPostSchema), async (req, res) => {
  const { wallOwnerId, taggedUserIds = [], ...fields } = req.body;
  const me = req.userId;
  const wallOwner = wallOwnerId && wallOwnerId !== me ? wallOwnerId : undefined;
  const tagged: string[] = [...new Set<string>(taggedUserIds)].filter((id) => id !== me);

  const post = await PostModel.create({ ...fields, author: me, wallOwner, taggedUsers: tagged });
  await post.populate(POPULATE);

  const target = { targetId: post.id, targetType: 'post' as const };
  if (wallOwner) await createNotification({ user: wallOwner, actor: me, type: 'system', content: 'đã đăng một bài viết lên tường nhà bạn.', ...target });
  await Promise.all(tagged.map((id) => createNotification({ user: id, actor: me, type: 'system', content: 'đã gắn thẻ bạn trong một bài viết.', ...target })));

  res.json({ post: postToJson(post, me) });
  emitPostToViewers(post, 'post:new');
});

/** Sửa bài viết */
postsRouter.patch('/:id', validate(updatePostSchema), async (req, res) => {
  const post = await PostModel.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  if (post.author.toString() !== req.userId) return res.status(403).json({ error: 'Bạn không có quyền sửa bài viết này.' });

  Object.assign(post, req.body, { editedAt: new Date() });
  await post.save();
  await post.populate(POPULATE);
  res.json({ post: postToJson(post, req.userId) });
  emitPostToViewers(post, 'post:update'); 
});

/** Xoá bài viết */
postsRouter.delete('/:id', async (req, res) => {
  const post = await PostModel.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  if (post.author.toString() !== req.userId) return res.status(403).json({ error: 'Bạn không có quyền xóa bài viết này.' });

  await post.deleteOne();
  res.json({ ok: true });
  emitToAllowedViewers(post.privacy, req.userId, 'post:delete', { postId: post.id });
});

/** Thả / đổi / bỏ cảm xúc bài viết */
  postsRouter.post('/:id/react', validate(reactPostSchema), async (req, res) => {
    const { type } = req.body;
    const me = req.userId;
    const post = await findPostIfVisible(req.params.id, me);
    if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });

    const _id = post._id;
    const removed = await PostModel.findOneAndUpdate(
      { _id, reactions: { $elemMatch: { userId: me, type } } },
      { $pull: { reactions: { userId: me } } }
    );
    const changed = !removed && (await PostModel.findOneAndUpdate({ _id, 'reactions.userId': me }, { $set: { 'reactions.$.type': type } }));
    if (!removed && !changed) {
      await PostModel.updateOne({ _id }, { $push: { reactions: { type, userId: me } } });
      const authorId = getId(post.author);
      if (authorId !== me) {
        await createNotification({ user: authorId, actor: me, type: 'like', content: `đã thả cảm xúc (${type}) về bài viết của bạn`, targetId: post.id, targetType: 'post' });
      }
    }

    const fresh = await PostModel.findById(_id).populate(POPULATE);
    res.json({ post: postToJson(fresh, me) });
    emitPostToViewers(fresh, 'post:update');
  });

/** Ghim / bỏ ghim bài viết */
postsRouter.post('/:id/pin', async (req, res) => {
  const post = await PostModel.findById(req.params.id).populate(POPULATE);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  if (getId(post.author) !== req.userId) return res.status(403).json({ error: 'Bạn không có quyền ghim bài viết này.' });

  post.pinned = !post.pinned;
  await post.save();
  res.json({ post: postToJson(post, req.userId) });
  emitPostToViewers(post, 'post:update');
});

/** Lưu / bỏ lưu bài viết */
postsRouter.post('/:id/save', async (req, res) => {
  const post = await findPostIfVisible(req.params.id, req.userId);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });

  const alreadySaved = post.savedBy.some((u: Doc) => getId(u) === req.userId);
  await PostModel.updateOne({ _id: post._id }, alreadySaved ? { $pull: { savedBy: req.userId } } : { $addToSet: { savedBy: req.userId } });
  const fresh = await PostModel.findById(post._id).populate(POPULATE);
  res.json({ post: postToJson(fresh, req.userId) });
});

/** Chia sẻ bài viết */
postsRouter.post('/:id/share', validate(sharePostSchema), async (req, res) => {
  const original = await findPostIfVisible(req.params.id, req.userId);
  if (!original) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });

  original.sharesCount = (original.sharesCount || 0) + 1;
  await original.save();

  const quote = `[Chia sẻ từ @${original.author.name}]:\n${original.content}`;
  const shared = await PostModel.create({
    author: req.userId,
    content: req.body.message ? `${req.body.message}\n\n${quote}` : quote,
    images: original.images,
    privacy: 'public',
  });
  await shared.populate(POPULATE);
  res.json({ post: postToJson(shared, req.userId) });
  emitPostToViewers(shared, 'post:new');
  emitPostToViewers(original, 'post:update');
});

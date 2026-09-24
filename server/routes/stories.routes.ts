import { Router } from 'express';
import { StoryModel } from '../models/Story';
import { requireAuth } from '../jwtAuth';
import { validate, createStorySchema } from '../validation';
import { storyToJson, getId, Doc } from '../formatResponse';
import { getFriendAndBlockedIds, canViewContent, emitToAllowedViewers } from '../privacyRules';

// API story (/api/stories): xem các story còn hạn, đăng story (hết hạn sau 24 giờ), xoá, ghi nhận người đã xem.

export const storiesRouter = Router();
storiesRouter.use(requireAuth);

const DAY = 24 * 60 * 60 * 1000;

/** GET /api/stories — story chưa hết hạn mà mình được xem. */
storiesRouter.get('/', async (req, res) => {
  const stories = await StoryModel.find({ expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .populate(['user', 'viewers.user']);
  const { friendIds, blockedIds } = await getFriendAndBlockedIds(req.userId);
  const visible = stories.filter((s: Doc) => canViewContent(getId(s.user), req.userId, s.privacy, friendIds, blockedIds));
  res.json({ stories: visible.map(storyToJson) });
});

/** POST /api/stories */
storiesRouter.post('/', validate(createStorySchema), async (req, res) => {
  const story = await StoryModel.create({ ...req.body, user: req.userId, expiresAt: new Date(Date.now() + DAY) });
  await story.populate('user');
  const json = storyToJson(story);
  res.json({ story: json });
  emitToAllowedViewers(story.privacy, req.userId, 'story:new', { story: json });
});

/** DELETE /api/stories/:id — chỉ người đăng được xoá. */
storiesRouter.delete('/:id', async (req, res) => {
  const story = await StoryModel.findById(req.params.id);
  if (!story) return res.status(404).json({ error: 'Không tìm thấy story.' });
  if (story.user.toString() !== req.userId) return res.status(403).json({ error: 'Bạn không có quyền xóa story này.' });
  await story.deleteOne();
  res.json({ ok: true });
  emitToAllowedViewers(story.privacy, req.userId, 'story:delete', { storyId: story.id });
});

/** POST /api/stories/:id/view — thêm mình vào danh sách người đã xem (chỉ thêm 1 lần). */
storiesRouter.post('/:id/view', async (req, res) => {
  const story = await StoryModel.findById(req.params.id);
  const { friendIds, blockedIds } = await getFriendAndBlockedIds(req.userId);
  if (!story || !canViewContent(story.user.toString(), req.userId, story.privacy, friendIds, blockedIds)) {
    return res.status(404).json({ error: 'Không tìm thấy story.' });
  }
  await StoryModel.updateOne(
    { _id: story._id, 'viewers.user': { $ne: req.userId } },
    { $push: { viewers: { user: req.userId, viewedAt: new Date() } } }
  );
  const fresh = await StoryModel.findById(story._id).populate(['user', 'viewers.user']);
  res.json({ story: storyToJson(fresh) });
});

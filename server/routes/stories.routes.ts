import { Router } from 'express';
import mongoose from 'mongoose';
import { StoryModel } from '../models/Story';
import { requireAuth } from '../jwtAuth';
import { validate, createStorySchema, reactStorySchema } from '../validation';
import { createNotification } from '../createNotification';
import { storyToJson, getId, Doc } from '../formatResponse';
import { getFriendAndBlockedIds, canViewContent, emitToAllowedViewers } from '../privacyRules';

// API story (/api/stories): xem các story còn hạn, đăng story (hết hạn sau 24 giờ), xoá, ghi nhận người đã xem, thả cảm xúc nhanh.

export const storiesRouter = Router();
storiesRouter.use(requireAuth);

const DAY = 24 * 60 * 60 * 1000;

/** Lấy danh sách story */
storiesRouter.get('/', async (req, res) => {
  const stories = await StoryModel.find({ expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .populate(['user', 'viewers.user', 'reactions.user']);
  const { friendIds, blockedIds } = await getFriendAndBlockedIds(req.userId);
  const visible = stories.filter((s: Doc) => canViewContent(getId(s.user), req.userId, s.privacy, friendIds, blockedIds));
  res.json({ stories: visible.map(storyToJson) });
});

/** Đăng story */
storiesRouter.post('/', validate(createStorySchema), async (req, res) => {
  const story = await StoryModel.create({ ...req.body, user: req.userId, expiresAt: new Date(Date.now() + DAY) });
  await story.populate('user');
  const json = storyToJson(story);
  res.json({ story: json });
  emitToAllowedViewers(story.privacy, req.userId, 'story:new', { story: json });
});

/** Xoá story */
storiesRouter.delete('/:id', async (req, res) => {
  const story = await StoryModel.findById(req.params.id);
  if (!story) return res.status(404).json({ error: 'Không tìm thấy story.' });
  if (story.user.toString() !== req.userId) return res.status(403).json({ error: 'Bạn không có quyền xóa story này.' });
  await story.deleteOne();
  res.json({ ok: true });
  emitToAllowedViewers(story.privacy, req.userId, 'story:delete', { storyId: story.id });
});

/** Đánh dấu đã xem story */
storiesRouter.post('/:id/view', async (req, res) => {
  const story = await StoryModel.findById(req.params.id);
  const { friendIds, blockedIds } = await getFriendAndBlockedIds(req.userId);
  if (!story || !canViewContent(story.user.toString(), req.userId, story.privacy, friendIds, blockedIds)) {
    return res.status(404).json({ error: 'Không tìm thấy story.' });
  }
  // Chủ story xem tin của chính mình thì không tính là "người đã xem"
  if (story.user.toString() !== req.userId) {
    await StoryModel.updateOne(
      { _id: story._id, 'viewers.user': { $ne: req.userId } },
      { $push: { viewers: { user: req.userId, viewedAt: new Date() } } }
    );
  }
  const fresh = await StoryModel.findById(story._id).populate(['user', 'viewers.user', 'reactions.user']);
  res.json({ story: storyToJson(fresh) });
});

/** Thả cảm xúc nhanh lên story của người khác: cùng emoji thì bỏ, khác emoji thì đổi. Chủ story nhận thông báo lần đầu. */
storiesRouter.post('/:id/react', validate(reactStorySchema), async (req, res) => {
  const me = req.userId;
  const story = await StoryModel.findById(req.params.id);
  const { friendIds, blockedIds } = await getFriendAndBlockedIds(me);
  if (!story || !canViewContent(story.user.toString(), me, story.privacy, friendIds, blockedIds)) {
    return res.status(404).json({ error: 'Không tìm thấy story.' });
  }
  if (story.user.toString() === me) return res.status(400).json({ error: 'Bạn không thể thả cảm xúc lên story của chính mình.' });

  // Cập nhật nguyên tử (pipeline) để bấm liên tục / song song không tạo ra nhiều cảm xúc của cùng một người
  const { emoji } = req.body;
  const meId = new mongoose.Types.ObjectId(me);
  const all = { $ifNull: ['$reactions', []] };
  const others = { $filter: { input: all, cond: { $ne: ['$$this.user', meId] } } };
  const myEmojis = { $map: { input: { $filter: { input: all, cond: { $eq: ['$$this.user', meId] } } }, as: 'r', in: '$$r.emoji' } };
  const before = await StoryModel.findOneAndUpdate(
    { _id: story._id },
    [{ $set: { reactions: { $cond: [{ $in: [emoji, myEmojis] }, others, { $concatArrays: [others, [{ user: meId, emoji, reactedAt: '$$NOW' }]] }] } } }],
    { updatePipeline: true, returnDocument: 'before' }
  );
  const hadReaction = (before?.reactions || []).some((r: Doc) => r.user.toString() === me);
  if (!hadReaction) {
    await createNotification({ user: story.user.toString(), actor: me, type: 'like', content: `đã bày tỏ cảm xúc ${emoji} về tin của bạn`, targetId: me, targetType: 'profile' });
  }
  const fresh = await StoryModel.findById(story._id).populate(['user', 'viewers.user', 'reactions.user']);
  res.json({ story: storyToJson(fresh) });
});

import { Router } from 'express';
import { PostModel } from '../models/Post';
import { requireAuth } from '../jwtAuth';
import { validate, createReelSchema } from '../validation';
import { postToJson, getId, Doc } from '../formatResponse';
import { canViewContent, getFriendAndBlockedIds, visibleToViewerFilter } from '../privacyRules';
import { FollowModel } from '../models/Follow';
import { pageParams } from '../pagination';
import { extractHashtags } from '../hashtags';
import { POPULATE } from './posts.routes';

// API Reels (/api/reels): video ngắn dọc. Reel thực chất là một Post có kind = 'reel' (nên thả cảm xúc, bình luận, quyền riêng tư
// dùng lại đúng API bài viết). Reel KHÔNG hiện ở bảng tin / trang cá nhân, chỉ hiện ở mục Reels.
// Danh sách được xếp theo "độ phù hợp": reel của bạn bè và người mình theo dõi lên trước, rồi theo tương tác và độ mới.

export const reelsRouter = Router();
reelsRouter.use(requireAuth);

const CANDIDATES = 200; // chỉ xếp hạng trong số reel mới nhất, để chi phí không tăng theo tổng số reel

/** Điểm hiển thị của một reel với người xem (càng cao càng lên trước). */
function reelScore(reel: Doc, friendIds: Set<string>, followingIds: Set<string>, viewerId: string, now: number) {
  const author = getId(reel.author);
  const ageHours = (now - new Date(reel.createdAt).getTime()) / 3_600_000;
  const freshness = Math.max(0, 30 - ageHours / 24); // mới trong ngày ≈ 30 điểm, giảm dần, hết sau ~30 ngày
  const relation = author === viewerId ? 10 : friendIds.has(author) ? 50 : followingIds.has(author) ? 35 : 0;
  return relation + freshness + (reel.reactions?.length || 0) * 2 + (reel.commentsCount || 0) * 3 + Math.log1p(reel.viewsCount || 0);
}

/** Danh sách reel xếp theo độ phù hợp (?limit, ?skip). */
reelsRouter.get('/', async (req, res) => {
  const me = req.userId;
  const { limit, skip } = pageParams(req.query, 10);
  const [{ friendIds, blockedIds }, following] = await Promise.all([getFriendAndBlockedIds(me), FollowModel.find({ follower: me }).select('following')]);
  // Lọc quyền xem ngay trong truy vấn → 200 ứng viên đều xem được (reel riêng tư / của người bị chặn không chiếm chỗ)
  const candidates = await PostModel.find({ kind: 'reel', hiddenBy: { $ne: me }, ...visibleToViewerFilter(me, friendIds, blockedIds) })
    .sort({ createdAt: -1 })
    .limit(CANDIDATES)
    .populate(POPULATE);
  const followingIds = new Set<string>(following.map((f: Doc) => getId(f.following)));
  const now = Date.now();
  const ranked = candidates
    .map((reel: Doc) => ({ reel, score: reelScore(reel, friendIds, followingIds, me, now) }))
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
  res.json({ reels: ranked.slice(skip, skip + limit).map(({ reel }: { reel: Doc }) => postToJson(reel, me)) });
});

/** Một reel (để mở thẳng từ kết quả tìm kiếm / liên kết). */
reelsRouter.get('/:id', async (req, res) => {
  const reel = await PostModel.findOne({ _id: req.params.id, kind: 'reel' }).populate(POPULATE);
  const { friendIds, blockedIds } = await getFriendAndBlockedIds(req.userId);
  if (!reel || !canViewContent(getId(reel.author), req.userId, reel.privacy, friendIds, blockedIds)) return res.status(404).json({ error: 'Không tìm thấy reel.' });
  res.json({ reel: postToJson(reel, req.userId) });
});

/** Đăng reel: bắt buộc có video; chú thích tối đa 300 ký tự; quyền riêng tư công khai hoặc bạn bè. */
reelsRouter.post('/', validate(createReelSchema), async (req, res) => {
  const { video, caption, privacy } = req.body;
  const reel = await PostModel.create({ author: req.userId, kind: 'reel', video, content: caption, privacy, hashtags: extractHashtags(caption) });
  await reel.populate(POPULATE);
  res.json({ reel: postToJson(reel, req.userId) });
});

/** Ghi nhận một lượt xem (người xem phải xem được reel đó). */
reelsRouter.post('/:id/view', async (req, res) => {
  const reel = await PostModel.findOne({ _id: req.params.id, kind: 'reel' }).select('author privacy');
  const { friendIds, blockedIds } = await getFriendAndBlockedIds(req.userId);
  if (!reel || !canViewContent(getId(reel.author), req.userId, reel.privacy, friendIds, blockedIds)) return res.status(404).json({ error: 'Không tìm thấy reel.' });
  const updated = await PostModel.findByIdAndUpdate(reel._id, { $inc: { viewsCount: 1 } }, { returnDocument: 'after' }).select('viewsCount');
  res.json({ viewsCount: updated?.viewsCount ?? 0 });
});

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/User';
import { FriendRequestModel } from '../models/FriendRequest';
import { FriendshipModel } from '../models/Friendship';
import { FollowModel } from '../models/Follow';
import { createNotification } from '../createNotification';
import { requireAuth } from '../jwtAuth';
import { validate, updateProfileSchema, changePasswordSchema } from '../validation';
import { userToJson, meToJson } from '../formatResponse';
import { isBlockedBetween, getBlockedIds } from '../privacyRules';
import { pageParams } from '../pagination';

// API người dùng (/api/users): tìm kiếm, xem hồ sơ, sửa hồ sơ, đổi mật khẩu, chặn / bỏ chặn, theo dõi / bỏ theo dõi.

export const usersRouter = Router();
usersRouter.use(requireAuth);

/** Tìm kiếm người dùng */
usersRouter.get('/', async (req, res) => {
  const filter: Record<string, unknown> = {};
  const q = String(req.query.q || '').trim();
  if (q) {
    // Thoát ký tự đặc biệt của regex để người dùng gõ gì thì tìm đúng chữ đó
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { username: regex }, { email: regex }];
  }
  if (req.query.online === 'true') filter.isOnline = true;
  filter._id = { $nin: [...(await getBlockedIds(req.userId))] };

  const { limit, skip } = pageParams(req.query, 60);
  const [users, total] = await Promise.all([
    UserModel.find(filter).sort({ joinDate: -1 }).skip(skip).limit(limit),
    UserModel.countDocuments(filter),
  ]);
  res.json({ users: users.map(userToJson), total });
});

/** Lấy danh sách người đã chặn */
usersRouter.get('/me/blocked', async (req, res) => {
  const me = await UserModel.findById(req.userId).populate('blockedUsers');
  res.json({ users: (me?.blockedUsers || []).map(userToJson) });
});

/** Danh sách người mình đang theo dõi (bỏ qua người có quan hệ chặn) */
usersRouter.get('/me/following', async (req, res) => {
  const [follows, blocked] = await Promise.all([FollowModel.find({ follower: req.userId }).sort({ createdAt: -1 }).populate('following'), getBlockedIds(req.userId)]);
  const users = follows.map((f: { following: { id: string } | null }) => f.following).filter((u: { id: string } | null) => u && !blocked.has(u.id));
  res.json({ users: users.map(userToJson) });
});

/** Xem hồ sơ người dùng */
usersRouter.get('/:id', async (req, res) => {
  const user = await UserModel.findById(req.params.id);
  if (!user || (await isBlockedBetween(req.userId, req.params.id))) {
    return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  }
  res.json({ user: userToJson(user) });
});

/** Sửa hồ sơ */
usersRouter.patch('/me', validate(updateProfileSchema), async (req, res) => {
  // socialLinks gửi lên từng phần thì gộp vào (socialLinks.facebook = ...) chứ không ghi đè cả nhóm
  const { socialLinks, ...rest } = req.body;
  const update: Record<string, unknown> = { ...rest };
  for (const [platform, link] of Object.entries(socialLinks || {})) update[`socialLinks.${platform}`] = link;
  const user = await UserModel.findByIdAndUpdate(req.userId, update, { returnDocument: 'after' });
  res.json({ user: meToJson(user) });
});

/** Đổi mật khẩu */
usersRouter.patch('/me/password', validate(changePasswordSchema), async (req, res) => {
  const user = await UserModel.findById(req.userId);
  if (!user || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    return res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác.' });
  }
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  await user.save();
  res.json({ ok: true });
});

/** Chặn người dùng */
usersRouter.post('/:id/block', async (req, res) => {
  const me = req.userId;
  const target = req.params.id;
  if (target === me) return res.status(400).json({ error: 'Không thể tự chặn chính mình.' });
  if (!(await UserModel.exists({ _id: target }))) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

  const [user] = await Promise.all([
    UserModel.findByIdAndUpdate(me, { $addToSet: { blockedUsers: target } }, { returnDocument: 'after' }),
    FriendshipModel.deleteOne({ $or: [{ userA: me, userB: target }, { userA: target, userB: me }] }),
    FriendRequestModel.deleteMany({ $or: [{ sender: me, receiver: target }, { sender: target, receiver: me }] }),
    FollowModel.deleteMany({ $or: [{ follower: me, following: target }, { follower: target, following: me }] }), // chặn thì huỷ theo dõi cả hai chiều
  ]);
  res.json({ user: meToJson(user) });
});

/** Số người theo dõi / đang theo dõi của một người + mình có đang theo dõi họ không */
usersRouter.get('/:id/follow-stats', async (req, res) => {
  const target = req.params.id;
  if (!(await UserModel.exists({ _id: target })) || (await isBlockedBetween(req.userId, target))) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  const [followersCount, followingCount, isFollowing] = await Promise.all([
    FollowModel.countDocuments({ following: target }),
    FollowModel.countDocuments({ follower: target }),
    FollowModel.exists({ follower: req.userId, following: target }),
  ]);
  res.json({ followersCount, followingCount, isFollowing: !!isFollowing });
});

/** Theo dõi một người (không cần kết bạn). Theo dõi lại thì không có gì thay đổi. */
usersRouter.post('/:id/follow', async (req, res) => {
  const me = req.userId;
  const target = req.params.id;
  if (target === me) return res.status(400).json({ error: 'Không thể tự theo dõi chính mình.' });
  if (!(await UserModel.exists({ _id: target }))) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  if (await isBlockedBetween(me, target)) return res.status(403).json({ error: 'Không thể theo dõi người dùng này.' });

  const result = await FollowModel.updateOne({ follower: me, following: target }, { $setOnInsert: { follower: me, following: target } }, { upsert: true });
  if (result.upsertedCount === 1) {
    await createNotification({ user: target, actor: me, type: 'system', content: 'đã bắt đầu theo dõi bạn.', targetId: me, targetType: 'profile' });
  }
  res.json({ ok: true, isFollowing: true, followersCount: await FollowModel.countDocuments({ following: target }) });
});

/** Bỏ theo dõi */
usersRouter.delete('/:id/follow', async (req, res) => {
  await FollowModel.deleteOne({ follower: req.userId, following: req.params.id });
  res.json({ ok: true, isFollowing: false, followersCount: await FollowModel.countDocuments({ following: req.params.id }) });
});

/** Bỏ chặn người dùng */
usersRouter.delete('/:id/block', async (req, res) => {
  const user = await UserModel.findByIdAndUpdate(req.userId, { $pull: { blockedUsers: req.params.id } }, { returnDocument: 'after' });
  res.json({ user: meToJson(user) });
});

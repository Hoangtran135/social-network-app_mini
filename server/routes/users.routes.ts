import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/User';
import { FriendRequestModel } from '../models/FriendRequest';
import { FriendshipModel } from '../models/Friendship';
import { requireAuth } from '../jwtAuth';
import { validate, updateProfileSchema, changePasswordSchema } from '../validation';
import { userToJson, meToJson } from '../formatResponse';
import { isBlockedBetween, getBlockedIds } from '../privacyRules';

// API người dùng (/api/users): tìm kiếm, xem hồ sơ, sửa hồ sơ, đổi mật khẩu, chặn / bỏ chặn.

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

  const limit = Math.min(Number(req.query.limit) || 60, 100);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
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
  const user = await UserModel.findByIdAndUpdate(req.userId, req.body, { new: true });
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

  const [user] = await Promise.all([
    UserModel.findByIdAndUpdate(me, { $addToSet: { blockedUsers: target } }, { new: true }),
    FriendshipModel.deleteOne({ $or: [{ userA: me, userB: target }, { userA: target, userB: me }] }),
    FriendRequestModel.deleteMany({ $or: [{ sender: me, receiver: target }, { sender: target, receiver: me }] }),
  ]);
  res.json({ user: meToJson(user) });
});

/** Bỏ chặn người dùng */
usersRouter.delete('/:id/block', async (req, res) => {
  const user = await UserModel.findByIdAndUpdate(req.userId, { $pull: { blockedUsers: req.params.id } }, { new: true });
  res.json({ user: meToJson(user) });
});

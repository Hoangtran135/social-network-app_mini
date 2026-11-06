import { Router } from 'express';
import { UserModel } from '../../models/User';
import { validate, banUserSchema, setUserRoleSchema } from '../../validation';
import { pageParams } from '../../pagination';
import { escapeRegex } from '../../regex';
import { logAdminAction } from '../../auditLog';
import { emitToUser, disconnectUser } from '../../socketServer';
import { adminUserToJson } from './format';

// Quản trị người dùng: danh sách (lọc / tìm / phân trang), khoá / mở khoá tài khoản, cấp / thu hồi quyền quản trị.

export const adminUsersRouter = Router();

const ROLE_FILTERS: Record<string, Record<string, unknown>> = {
  admin: { role: 'admin' },
  user: { role: { $ne: 'admin' } },
  banned: { banned: true },
  online: { isOnline: true },
};

adminUsersRouter.get('/', async (req, res) => {
  const filter: Record<string, unknown> = { ...ROLE_FILTERS[String(req.query.filter)] };
  const q = String(req.query.q || '').trim();
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: regex }, { username: regex }, { email: regex }];
  }
  const { limit, skip } = pageParams(req.query, 30);
  const [users, total] = await Promise.all([UserModel.find(filter).sort({ joinDate: -1 }).skip(skip).limit(limit), UserModel.countDocuments(filter)]);
  res.json({ users: users.map(adminUserToJson), total });
});

/** Khoá / mở khoá. Không tự khoá mình, không khoá quản trị viên khác (phải thu hồi quyền trước). Bị khoá → ngắt kết nối realtime ngay. */
adminUsersRouter.patch('/:id/ban', validate(banUserSchema), async (req, res) => {
  const { banned, reason } = req.body;
  const user = await UserModel.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  if (banned && user.id === req.userId) return res.status(400).json({ error: 'Bạn không thể tự khoá tài khoản của mình.' });
  if (banned && user.role === 'admin') return res.status(400).json({ error: 'Hãy thu hồi quyền quản trị trước khi khoá tài khoản này.' });

  user.banned = banned;
  user.banReason = banned ? reason || undefined : undefined;
  user.bannedAt = banned ? new Date() : undefined;
  if (banned) user.isOnline = false;
  await user.save();
  await logAdminAction(req.userId, banned ? 'user.ban' : 'user.unban', 'user', user.id, banned ? { reason } : undefined);
  if (banned) {
    emitToUser(user.id, 'account:banned', { reason: reason || undefined });
    disconnectUser(user.id);
  }
  res.json({ user: adminUserToJson(user) });
});

/** Cấp / thu hồi quyền quản trị. Không tự đổi quyền của mình (tránh hệ thống không còn quản trị viên); không cấp cho tài khoản đang bị khoá. */
adminUsersRouter.patch('/:id/role', validate(setUserRoleSchema), async (req, res) => {
  const { role } = req.body;
  const user = await UserModel.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  if (user.id === req.userId) return res.status(400).json({ error: 'Bạn không thể tự đổi quyền của mình.' });
  if (role === 'admin' && user.banned) return res.status(400).json({ error: 'Không thể cấp quyền quản trị cho tài khoản đang bị khoá.' });

  user.role = role;
  await user.save();
  await logAdminAction(req.userId, 'user.role', 'user', user.id, { role });
  emitToUser(user.id, 'account:role', { role });
  res.json({ user: adminUserToJson(user) });
});

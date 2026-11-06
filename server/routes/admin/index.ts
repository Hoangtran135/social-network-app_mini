import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../jwtAuth';
import { UserModel } from '../../models/User';
import { PostModel } from '../../models/Post';
import { CommentModel } from '../../models/Comment';
import { GroupModel } from '../../models/Group';
import { PageModel } from '../../models/Page';
import { ReportModel } from '../../models/Report';
import { AuditLogModel } from '../../models/AuditLog';
import { pageParams } from '../../pagination';
import { adminUsersRouter } from './users';
import { adminContentRouter } from './content';
import { adminReportsRouter } from './reports';
import { adminAnnouncementsRouter } from './announcements';
import { auditLogToJson } from './format';

// API quản trị hệ thống (/api/admin) — chỉ tài khoản có role = admin:
//   GET /stats, GET /audit-logs
//   users.ts         — /users: danh sách, khoá / mở khoá, đổi quyền
//   content.ts       — /posts, /comments, /groups, /pages: danh sách + gỡ nội dung vi phạm
//   reports.ts       — /reports: báo cáo vi phạm của người dùng
//   announcements.ts — /announcements: thông báo hệ thống tới mọi người

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/stats', async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [users, online, banned, admins, newToday, posts, reels, comments, groups, pages, pendingReports] = await Promise.all([
    UserModel.estimatedDocumentCount(),
    UserModel.countDocuments({ isOnline: true }),
    UserModel.countDocuments({ banned: true }),
    UserModel.countDocuments({ role: 'admin' }),
    UserModel.countDocuments({ joinDate: { $gte: startOfDay } }),
    PostModel.countDocuments({ kind: { $ne: 'reel' } }),
    PostModel.countDocuments({ kind: 'reel' }),
    CommentModel.estimatedDocumentCount(),
    GroupModel.estimatedDocumentCount(),
    PageModel.estimatedDocumentCount(),
    ReportModel.countDocuments({ status: 'pending' }),
  ]);
  res.json({ stats: { users, online, banned, admins, newToday, posts, reels, comments, groups, pages, pendingReports } });
});

adminRouter.get('/audit-logs', async (req, res) => {
  const { limit, skip } = pageParams(req.query, 30);
  const [logs, total] = await Promise.all([
    AuditLogModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('admin', 'name username avatar'),
    AuditLogModel.estimatedDocumentCount(),
  ]);
  res.json({ logs: logs.map(auditLogToJson), total });
});

adminRouter.use('/users', adminUsersRouter);
adminRouter.use(adminContentRouter);
adminRouter.use('/reports', adminReportsRouter);
adminRouter.use('/announcements', adminAnnouncementsRouter);

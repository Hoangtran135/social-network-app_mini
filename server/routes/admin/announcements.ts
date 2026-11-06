import { Router } from 'express';
import { AnnouncementModel } from '../../models/Announcement';
import { NotificationModel } from '../../models/Notification';
import { UserModel } from '../../models/User';
import { validate, announcementSchema } from '../../validation';
import { pageParams } from '../../pagination';
import { logAdminAction } from '../../auditLog';
import { notificationToJson } from '../../formatResponse';
import { emitToUser } from '../../socketServer';
import { announcementToJson } from './format';

// Thông báo hệ thống: quản trị viên soạn → gửi cho mọi tài khoản đang hoạt động dưới dạng thông báo (và đẩy realtime).

export const adminAnnouncementsRouter = Router();

const BATCH = 500;

adminAnnouncementsRouter.get('/', async (req, res) => {
  const { limit, skip } = pageParams(req.query, 30);
  const announcements = await AnnouncementModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('createdBy', 'name username avatar');
  res.json({ announcements: announcements.map(announcementToJson) });
});

adminAnnouncementsRouter.post('/', validate(announcementSchema), async (req, res) => {
  const { title, message, type } = req.body;
  const announcement = await AnnouncementModel.create({ title, message, type, createdBy: req.userId });
  await announcement.populate('createdBy', 'name username avatar');

  // Gửi theo lô để không tải toàn bộ người dùng vào bộ nhớ một lúc
  const content = `${title}: ${message}`;
  const cursor = UserModel.find({ banned: { $ne: true } }).select('_id').lean().cursor({ batchSize: BATCH });
  let batch: string[] = [];
  const flush = async () => {
    const docs = await NotificationModel.insertMany(batch.map((user) => ({ user, actor: req.userId, type: 'system', content, targetType: 'system' })));
    await NotificationModel.populate(docs, { path: 'actor' });
    docs.forEach((d: { user: unknown }) => emitToUser(String(d.user), 'notification:new', notificationToJson(d)));
    batch = [];
  };
  for await (const user of cursor) {
    batch.push(String((user as { _id: unknown })._id));
    if (batch.length >= BATCH) await flush();
  }
  if (batch.length) await flush();

  await logAdminAction(req.userId, 'announcement.create', 'announcement', announcement.id, { title, type });
  res.status(201).json({ announcement: announcementToJson(announcement) });
});

/** Xoá bản ghi thông báo hệ thống (các thông báo đã gửi tới người dùng vẫn giữ nguyên). */
adminAnnouncementsRouter.delete('/:id', async (req, res) => {
  const deleted = await AnnouncementModel.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Không tìm thấy thông báo.' });
  await logAdminAction(req.userId, 'announcement.delete', 'announcement', req.params.id, { title: deleted.title });
  res.json({ ok: true });
});

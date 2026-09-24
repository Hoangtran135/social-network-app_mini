import { Router } from 'express';
import { NotificationModel } from '../models/Notification';
import { requireAuth } from '../jwtAuth';
import { notificationToJson } from '../formatResponse';

// API thông báo (/api/notifications): lấy danh sách (có phân trang), đánh dấu đã đọc.
// (Thông báo được TẠO ở file createNotification.ts, gọi từ các route khác.)

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

/** GET /api/notifications?limit=&skip= — mới nhất trước. */
notificationsRouter.get('/', async (req, res) => {
  const notifications = await NotificationModel.find({ user: req.userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 30, 100))
    .skip(Number(req.query.skip) || 0)
    .populate('actor');
  res.json({ notifications: notifications.map(notificationToJson) });
});

/** PATCH /api/notifications/read-all */
notificationsRouter.patch('/read-all', async (req, res) => {
  await NotificationModel.updateMany({ user: req.userId }, { isRead: true });
  res.json({ ok: true });
});

/** PATCH /api/notifications/:id/read — điều kiện có user để không ai đánh dấu được thông báo của người khác. */
notificationsRouter.patch('/:id/read', async (req, res) => {
  await NotificationModel.updateOne({ _id: req.params.id, user: req.userId }, { isRead: true });
  res.json({ ok: true });
});

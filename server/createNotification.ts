import { NotificationModel } from './models/Notification';
import { notificationToJson } from './formatResponse';
import { emitToUser } from './socketServer';

// Tạo thông báo (vd "A đã bình luận về bài viết của bạn"): lưu vào database rồi đẩy ngay tới người nhận qua Socket.io.

export async function createNotification(data: {
  user: string; // người nhận
  actor: string; // người gây ra (người thích, bình luận...)
  type: 'like' | 'comment' | 'friend_request' | 'friend_accept' | 'system';
  content: string;
  targetId?: string; // bấm vào thông báo thì mở bài viết / trang cá nhân này
  targetType?: 'post' | 'profile';
}) {
  const notification = await NotificationModel.create(data);
  await notification.populate('actor');
  emitToUser(data.user, 'notification:new', notificationToJson(notification));
}

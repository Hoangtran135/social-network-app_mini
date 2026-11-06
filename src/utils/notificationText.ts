import { NotificationItem } from '../types';

// Thông báo từ quản trị hệ thống (targetType = 'system') không lộ tên quản trị viên: giao diện hiện "Hệ thống" thay cho tên người.

export const isSystemNotification = (n: NotificationItem) => n.targetType === 'system';

/** Câu thông báo dạng chữ thuần (cho toast). */
export const notificationPlain = (n: NotificationItem) => (isSystemNotification(n) ? `Hệ thống: ${n.content}` : `${n.actor.name} ${n.content}`);

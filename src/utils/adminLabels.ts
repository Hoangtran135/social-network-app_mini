import { Announcement, ReportReason, ReportTarget } from '../types';

// Nhãn tiếng Việt cho các giá trị server trả về ở khu quản trị.

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam / quảng cáo',
  harassment: 'Quấy rối, bắt nạt',
  hate: 'Ngôn từ thù ghét',
  violence: 'Bạo lực, nguy hiểm',
  nudity: 'Nội dung nhạy cảm',
  fake: 'Giả mạo, lừa đảo',
  other: 'Lý do khác',
};

export const REPORT_TARGET_LABELS: Record<ReportTarget, string> = { post: 'Bài viết', comment: 'Bình luận', user: 'Người dùng', group: 'Nhóm', page: 'Trang' };

export const ANNOUNCEMENT_TYPE_LABELS: Record<Announcement['type'], string> = { info: 'Thông tin', warning: 'Cảnh báo', alert: 'Khẩn cấp' };

export const POST_KIND_LABELS = { post: 'Bài viết', reel: 'Reel', group: 'Bài trong nhóm', page: 'Bài của trang' } as const;

/** Mô tả một dòng nhật ký quản trị: mã hành động → câu tiếng Việt. */
const ACTION_LABELS: Record<string, string> = {
  'user.ban': 'Khoá tài khoản',
  'user.unban': 'Mở khoá tài khoản',
  'user.role': 'Đổi quyền người dùng',
  'post.delete': 'Gỡ bài viết / reel',
  'comment.delete': 'Gỡ bình luận',
  'group.delete': 'Gỡ nhóm',
  'page.delete': 'Gỡ trang',
  'report.resolve': 'Xác nhận báo cáo',
  'report.dismiss': 'Bỏ qua báo cáo',
  'announcement.create': 'Gửi thông báo hệ thống',
  'announcement.delete': 'Xoá thông báo hệ thống',
};
export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action;

/** Chi tiết của một dòng nhật ký, rút gọn thành một câu ngắn (rỗng nếu không có gì đáng nói). */
export function auditDetails(details?: Record<string, unknown>) {
  if (!details) return '';
  const parts: string[] = [];
  if (typeof details.reason === 'string' && details.reason) parts.push(`Lý do: ${details.reason}`);
  if (typeof details.role === 'string') parts.push(details.role === 'admin' ? 'Cấp quyền quản trị' : 'Thu hồi quyền quản trị');
  if (typeof details.title === 'string') parts.push(`"${details.title}"`);
  if (details.removed === true) parts.push('Đã gỡ nội dung');
  if (typeof details.note === 'string' && details.note) parts.push(`Ghi chú: ${details.note}`);
  return parts.join(' · ');
}

/** Ngày giờ đầy đủ cho bảng quản trị, vd "05/11/2026 14:30". */
export const formatDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

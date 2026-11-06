// Các hàm nhỏ định dạng dữ liệu để hiển thị: thời gian tương đối, câu cảm xúc, dung lượng tệp.

/** "5 phút trước", "3 ngày trước"... */
export function timeAgo(iso: string | undefined) {
  if (!iso) return '';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return iso;
  if (seconds < 10) return 'Vừa xong';
  if (seconds < 60) return `${seconds} giây trước`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;

  // Từ đây tính theo số ngày (không cộng dồn hệ số làm tròn, tránh lệch kiểu "đúng 1 năm" lại ra "11 tháng")
  const days = seconds / 86400;
  if (days < 7) return `${Math.floor(days)} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  if (days < 365) return `${Math.max(1, Math.floor(days / 30.44))} tháng trước`;
  return `${Math.floor(days / 365)} năm trước`;
}

/** "hạnh phúc 😊" → "đang cảm thấy hạnh phúc 😊"; "đang du lịch ✈️" giữ nguyên. */
export function feelingText(feeling: string) {
  return feeling.startsWith('đang ') ? feeling : `đang cảm thấy ${feeling}`;
}

/** 1536 → "1.5 KB" */
export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Rút gọn số đếm: 999 → "999", 1200 → "1.2K", 15000 → "15K". */
export const formatCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}K` : String(n));

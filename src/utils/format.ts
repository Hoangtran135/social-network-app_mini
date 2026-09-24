// Các hàm nhỏ định dạng dữ liệu để hiển thị: thời gian tương đối, câu cảm xúc, dung lượng tệp.

/** "5 phút trước", "3 ngày trước"... */
export function timeAgo(iso: string | undefined) {
  if (!iso) return '';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return iso;
  if (seconds < 10) return 'Vừa xong';

  const steps: [number, string][] = [
    [60, 'giây'],
    [60, 'phút'],
    [24, 'giờ'],
    [7, 'ngày'],
    [4.35, 'tuần'],
    [12, 'tháng'],
  ];
  let value = seconds;
  for (const [size, unit] of steps) {
    if (value < size) return `${Math.floor(value)} ${unit} trước`;
    value /= size;
  }
  return `${Math.floor(value)} năm trước`;
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

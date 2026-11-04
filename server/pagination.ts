// Đọc tham số phân trang ?limit= & ?skip= từ URL một cách an toàn:
// limit nằm trong [1, 100] (không có / không hợp lệ / âm / bằng 0 thì dùng mặc định), skip không âm; giá trị rác (chữ, NaN) rơi về mặc định.

export function pageParams(query: Record<string, unknown>, defaultLimit: number) {
  const wanted = Math.floor(Number(query.limit));
  const limit = wanted >= 1 ? Math.min(wanted, 100) : defaultLimit;
  const skip = Math.max(Math.floor(Number(query.skip)) || 0, 0);
  return { limit, skip };
}

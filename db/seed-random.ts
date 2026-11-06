// Bộ sinh số ngẫu nhiên CÓ SEED CỐ ĐỊNH cho các script dữ liệu mẫu: chạy lại vẫn ra cùng một bộ dữ liệu.

let state = 20261105;

/** Số thực ngẫu nhiên trong [0, 1). */
export const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
/** Số nguyên ngẫu nhiên trong [min, max]. */
export const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
/** Một phần tử ngẫu nhiên của danh sách. */
export const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
/** `true` với xác suất p. */
export const chance = (p: number) => rand() < p;

/** Lấy `count` phần tử khác nhau từ danh sách (xáo bằng Fisher–Yates một phần). */
export function sample<T>(list: readonly T[], count: number): T[] {
  const copy = [...list];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** Chọn theo trọng số: weighted([['a', 3], ['b', 1]]) ra 'a' gấp 3 lần 'b'. */
export function weighted<T>(options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [value, w] of options) {
    roll -= w;
    if (roll < 0) return value;
  }
  return options[options.length - 1][0];
}

const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** Thời điểm ngẫu nhiên trong `maxDays` ngày gần đây. */
export const daysAgo = (maxDays: number) => new Date(Date.now() - rand() * maxDays * DAY);
/** Thời điểm ngẫu nhiên trong `maxHours` giờ gần đây. */
export const hoursAgo = (maxHours: number) => new Date(Date.now() - rand() * maxHours * HOUR);

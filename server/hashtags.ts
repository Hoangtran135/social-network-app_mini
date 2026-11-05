// Tách #hashtag ra khỏi nội dung bài viết. Quy tắc (phải GIỐNG HỆT src/utils/hashtag.ts ở frontend):
// - hashtag = "#" + 1–50 ký tự chữ (mọi ngôn ngữ, kể cả tiếng Việt có dấu), số hoặc gạch dưới
// - "#" phải đứng đầu chuỗi hoặc sau một ký tự KHÔNG phải chữ/số/_/& (nên "abc#def" và địa chỉ "a.com/#top" không tính)
// - không phân biệt hoa thường (lưu chữ thường), mỗi tag chỉ tính một lần, tối đa 30 tag mỗi bài

export const HASHTAG_PATTERN = '(^|[^\\p{L}\\p{N}_&/#])#([\\p{L}\\p{N}_]{1,50})';
export const MAX_HASHTAGS = 30;

export function extractHashtags(text: string | undefined): string[] {
  if (!text) return [];
  const tags = new Set<string>();
  for (const match of text.matchAll(new RegExp(HASHTAG_PATTERN, 'gu'))) {
    tags.add(match[2].toLowerCase());
    if (tags.size >= MAX_HASHTAGS) break;
  }
  return [...tags];
}

/** Chuẩn hoá tham số ?tag= trên URL: bỏ "#" đầu, chữ thường; trả về '' nếu không hợp lệ. */
export function normalizeTag(raw: unknown): string {
  const tag = String(raw ?? '').trim().replace(/^#/, '').toLowerCase();
  return /^[\p{L}\p{N}_]{1,50}$/u.test(tag) ? tag : '';
}

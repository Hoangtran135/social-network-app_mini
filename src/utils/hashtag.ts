// Nhận diện #hashtag trong nội dung bài viết. Quy tắc phải GIỐNG HỆT server/hashtags.ts:
// "#" + 1–50 ký tự chữ / số / gạch dưới; "#" phải đứng đầu chuỗi hoặc sau ký tự không phải chữ, số, _, &, / hay #.

const PATTERN = '(^|[^\\p{L}\\p{N}_&/#])#([\\p{L}\\p{N}_]{1,50})';

export type TextPart = { type: 'text'; text: string } | { type: 'tag'; label: string; tag: string };

/** Cắt nội dung thành các đoạn chữ thường và đoạn hashtag (để hiển thị hashtag thành liên kết). */
export function splitHashtags(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(new RegExp(PATTERN, 'gu'))) {
    const start = (match.index ?? 0) + match[1].length; // vị trí dấu "#"
    if (start > cursor) parts.push({ type: 'text', text: text.slice(cursor, start) });
    parts.push({ type: 'tag', label: `#${match[2]}`, tag: match[2].toLowerCase() });
    cursor = start + 1 + match[2].length;
  }
  if (cursor < text.length) parts.push({ type: 'text', text: text.slice(cursor) });
  return parts;
}

/** Chuẩn hoá chuỗi người dùng gõ vào ô tìm kiếm ("#Vui") thành tag ("vui"); không phải hashtag hợp lệ thì trả về ''. */
export function parseTagQuery(query: string): string {
  const match = query.trim().match(/^#([\p{L}\p{N}_]{1,50})$/u);
  return match ? match[1].toLowerCase() : '';
}

// Xử lý chữ khi gõ "@tên" để gắn thẻ bạn bè (được dùng trong hooks/useMention.ts).

/** Nếu ngay trước con trỏ đang là "@chữ" thì trả về vị trí dấu @ và chữ đang gõ; không thì trả null. */
export function detectMention(text: string, cursor: number) {
  const match = text.slice(0, cursor).match(/(?:^|\s)@([\p{L}0-9]*)$/u);
  if (!match) return null;
  return { atIndex: cursor - match[1].length - 1, query: match[1] };
}

/** Thay "@chữ đang gõ" bằng "@Tên đầy đủ " và trả về nội dung mới + vị trí con trỏ mới. */
export function insertMention(text: string, atIndex: number, cursor: number, name: string) {
  const before = text.slice(0, atIndex) + `@${name} `;
  return { text: before + text.slice(cursor), cursor: before.length };
}

import { Post } from '../types';

// Hàm nhỏ phục vụ hiển thị kết quả tìm kiếm.

/** Đường dẫn để mở một bài viết trong kết quả: bài nhóm → trang nhóm; reel → mục Reels; bài của trang → trang đó; còn lại → trang bài viết. */
export function postHref(post: Post) {
  if (post.groupId) return `/groups/${post.groupId}`;
  if (post.kind === 'reel') return `/reels?reel=${post.id}`;
  if (post.pageId) return `/pages/${post.pageId}`;
  return `/post/${post.id}`;
}

/** Cắt đoạn nội dung quanh từ khoá để hiện làm tóm tắt (tối đa `max` ký tự, thêm "…" ở phần bị cắt). */
export function snippet(text: string, query: string, max = 120) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const at = flat.toLowerCase().indexOf(query.toLowerCase().replace(/^#/, ''));
  const start = Math.max(0, Math.min(at < 0 ? 0 : at - 30, flat.length - max));
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + max)}${start + max < flat.length ? '…' : ''}`;
}

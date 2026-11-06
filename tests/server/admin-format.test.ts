import { describe, it, expect } from 'vitest';
import { adminPostToJson, adminCommentToJson, adminUserToJson, personToJson, auditLogToJson } from '../../server/routes/admin/format';

// Hàm định dạng dữ liệu cho trang quản trị với dữ liệu thiếu trường / dài / tác giả đã bị xoá.

const author = { _id: 'u1', name: 'A', username: 'a' };

describe('personToJson', () => {
  it('chưa populate hoặc đã bị xoá → null', () => {
    expect(personToJson(null)).toBeNull();
    expect(personToJson({ _id: 'x' })).toBeNull();
    expect(personToJson(author)).toMatchObject({ id: 'u1', name: 'A' });
  });
});

describe('adminPostToJson', () => {
  const base = { _id: 'p', author, images: [], reactions: [], commentsCount: 0, privacy: 'public' };
  it('phân loại reel / nhóm / trang / bài thường và đếm tệp', () => {
    expect(adminPostToJson({ ...base, kind: 'reel', video: 'v.mp4', content: 'x' })).toMatchObject({ kind: 'reel', mediaCount: 1 });
    expect(adminPostToJson({ ...base, group: { _id: 'g', name: 'G' }, groupStatus: 'pending' })).toMatchObject({ kind: 'group', groupName: 'G', groupStatus: 'pending' });
    expect(adminPostToJson({ ...base, page: { _id: 'pg', name: 'P' } })).toMatchObject({ kind: 'page', pageName: 'P', groupStatus: undefined });
    expect(adminPostToJson({ ...base, images: ['a', 'b'] })).toMatchObject({ kind: 'post', mediaCount: 2, content: '' });
  });
  it('nội dung dài bị cắt', () => {
    expect(adminPostToJson({ ...base, content: 'x'.repeat(400) }).content).toHaveLength(301);
  });
});

describe('adminCommentToJson', () => {
  it('bình luận chỉ có ảnh, bài đã bị xoá, là câu trả lời', () => {
    const json = adminCommentToJson({ _id: 'c', author: null, post: 'p1', image: 'a.png', likes: ['u'], parent: 'c0' });
    expect(json).toMatchObject({ content: '[Ảnh]', author: null, postId: 'p1', postExcerpt: '', isReply: true, likesCount: 1 });
    expect(adminCommentToJson({ _id: 'c', author, post: { _id: 'p', content: 'y'.repeat(100) }, content: 'ok', likes: [] }).postExcerpt).toHaveLength(81);
    expect(adminCommentToJson({ _id: 'c', author, post: 'p', likes: [] }).content).toBe('');
  });
});

describe('adminUserToJson / auditLogToJson', () => {
  it('vai trò lạ → user; chưa có ngày → undefined; email chưa xác minh', () => {
    expect(adminUserToJson({ _id: 'u', name: 'A', role: 'x', emailVerified: false })).toMatchObject({ role: 'user', banned: false, isOnline: false, emailVerified: false, joinDate: undefined });
    expect(adminUserToJson({ _id: 'u', name: 'A', role: 'admin', banned: true, bannedAt: new Date(0), joinDate: new Date(0) })).toMatchObject({ role: 'admin', banned: true, emailVerified: true });
  });
  it('nhật ký của quản trị viên đã bị xoá → admin null', () => {
    expect(auditLogToJson({ _id: 'l', admin: null, action: 'user.ban', targetType: 'user' }).admin).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { pageParams } from '../../server/pagination';
import { canViewContent } from '../../server/privacyRules';
import { createToken, getUserIdFromToken } from '../../server/jwtAuth';
import { getId, userToJson, meToJson, postToJson, messageToJson } from '../../server/formatResponse';
import { registerSchema, createPostSchema, createCommentSchema, sendMessageSchema } from '../../server/validation';

// Test đơn vị cho các hàm thuần (không cần database): phân trang, luật xem nội dung, JWT, định dạng JSON, kiểm tra dữ liệu.

describe('pageParams (phân trang)', () => {
  it('mặc định khi không có tham số', () => {
    expect(pageParams({}, 30)).toEqual({ limit: 30, skip: 0 });
  });
  it('giữ nguyên giá trị hợp lệ', () => {
    expect(pageParams({ limit: '10', skip: '20' }, 30)).toEqual({ limit: 10, skip: 20 });
  });
  it.each([
    [{ limit: '999999' }, 100],
    [{ limit: '-5' }, 30],
    [{ limit: '0' }, 30],
    [{ limit: 'abc' }, 30],
    [{ limit: '7.9' }, 7],
    [{ limit: ['1', '2'] }, 30],
    [{ limit: '1' }, 1],
  ])('limit %j → %i', (query, expected) => {
    expect(pageParams(query, 30).limit).toBe(expected);
  });
  it.each([[{ skip: '-5' }, 0], [{ skip: 'abc' }, 0], [{ skip: '3.7' }, 3], [{ skip: '' }, 0]])('skip %j → %i', (query, expected) => {
    expect(pageParams(query, 30).skip).toBe(expected);
  });
});

describe('canViewContent (ai được xem gì)', () => {
  const friends = new Set(['f1']);
  const blocked = new Set(['b1']);
  it('tác giả luôn thấy bài của mình (kể cả chỉ mình tôi / bị chặn)', () => {
    expect(canViewContent('me', 'me', 'only_me', friends, new Set(['me']))).toBe(true);
  });
  it('công khai → ai cũng thấy', () => expect(canViewContent('x', 'me', 'public', friends, blocked)).toBe(true));
  it('không chỉ định quyền → coi là công khai', () => expect(canViewContent('x', 'me', undefined, friends, blocked)).toBe(true));
  it('bạn bè → chỉ bạn thấy', () => {
    expect(canViewContent('f1', 'me', 'friends', friends, blocked)).toBe(true);
    expect(canViewContent('stranger', 'me', 'friends', friends, blocked)).toBe(false);
  });
  it('chỉ mình tôi → người khác không thấy, kể cả bạn bè', () => expect(canViewContent('f1', 'me', 'only_me', friends, blocked)).toBe(false));
  it('bị chặn → luôn ẩn, kể cả bài công khai', () => expect(canViewContent('b1', 'me', 'public', friends, blocked)).toBe(false));
});

describe('JWT', () => {
  it('tạo rồi đọc lại đúng id', () => expect(getUserIdFromToken(createToken('abc123'))).toBe('abc123'));
  it.each([[undefined], [''], ['rac'], ['a.b.c'], [createToken('x').slice(0, -3) + 'abc']])('token xấu %s → null', (token) => {
    expect(getUserIdFromToken(token as string | undefined)).toBeNull();
  });
});

describe('formatResponse', () => {
  const user = { _id: { toString: () => 'u1' }, name: 'A', username: 'a', email: 'a@b.vn', passwordHash: 'SECRET', resetTokenHash: 'SECRET2', blockedUsers: [{ toString: () => 'x' }], joinDate: new Date('2024-01-02') };
  it('getId xử lý ObjectId, document đã populate và chuỗi', () => {
    expect(getId({ _id: { toString: () => 'abc' } })).toBe('abc');
    expect(getId('xyz')).toBe('xyz');
    expect(getId(undefined)).toBe('');
  });
  it('userToJson không bao giờ chứa trường bí mật', () => {
    const json = JSON.stringify(userToJson(user));
    expect(json).not.toMatch(/SECRET|passwordHash|resetToken|blockedUsers/);
    expect(userToJson(null)).toBeNull();
  });
  it('userToJson KHÔNG chứa email (riêng tư); meToJson thì có email của chính chủ', () => {
    expect(userToJson(user)).not.toHaveProperty('email');
    expect(meToJson(user)!.email).toBe('a@b.vn');
  });
  it('meToJson có thêm blockedUserIds nhưng vẫn không lộ bí mật', () => {
    const json = meToJson(user)!;
    expect(json.blockedUserIds).toEqual(['x']);
    expect(JSON.stringify(json)).not.toMatch(/SECRET/);
  });
  it('postToJson: isSaved theo người xem, mảng rỗng → undefined cho images', () => {
    const post = { _id: 'p1', author: user, content: 'c', images: [], savedBy: ['u1'], reactions: [], createdAt: new Date(), editedAt: undefined };
    expect(postToJson(post, 'u1').isSaved).toBe(true);
    expect(postToJson(post, 'other').isSaved).toBe(false);
    expect(postToJson(post).isSaved).toBe(false);
    expect(postToJson(post, 'u1').images).toBeUndefined();
  });
  it('messageToJson: isRead chỉ true khi MỌI thành viên khác đã đọc', () => {
    const base = { _id: 'm1', conversation: 'c1', sender: { _id: 's' }, content: 'x', readBy: ['s', 'a'] };
    expect(messageToJson(base, ['s', 'a', 'b']).isRead).toBe(false);
    expect(messageToJson({ ...base, readBy: ['s', 'a', 'b'] }, ['s', 'a', 'b']).isRead).toBe(true);
    expect(messageToJson({ ...base, readBy: ['s'] }, ['s']).isRead).toBe(true); // chat chỉ có mình
  });
});

describe('Schema kiểm tra dữ liệu', () => {
  it('registerSchema chuẩn hoá (cắt khoảng trắng) và từ chối rác', () => {
    expect(registerSchema.safeParse({ name: ' A ', username: 'abc', email: ' a@b.vn ', password: '123456' }).data).toMatchObject({ name: 'A', email: 'a@b.vn' });
    expect(registerSchema.safeParse({ name: 'A', username: 'a b', email: 'a@b.vn', password: '123456' }).success).toBe(false);
    expect(registerSchema.safeParse(null).success).toBe(false);
  });
  it('createPostSchema có giá trị mặc định', () => {
    expect(createPostSchema.parse({})).toMatchObject({ content: '', privacy: 'public' });
  });
  it('createCommentSchema cần postId hợp lệ', () => {
    expect(createCommentSchema.safeParse({ postId: 'abc' }).success).toBe(false);
    expect(createCommentSchema.safeParse({ postId: '64b0f0f0f0f0f0f0f0f0f0f0' }).success).toBe(true);
  });
  it('sendMessageSchema giới hạn số tệp đính kèm', () => {
    const file = { type: 'file', url: '/u', name: 'a' };
    expect(sendMessageSchema.safeParse({ attachments: Array(10).fill(file) }).success).toBe(true);
    expect(sendMessageSchema.safeParse({ attachments: Array(11).fill(file) }).success).toBe(false);
  });
});

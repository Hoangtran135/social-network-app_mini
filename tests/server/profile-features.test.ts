import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as } from './helpers';
import { updateProfileSchema, AVATAR_FRAMES, SOCIAL_PLATFORMS } from '../../server/validation';

// Hồ sơ: khung ảnh đại diện và liên kết mạng xã hội.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const patch = (u: { token: string }, body: unknown) => as(app, u).patch('/api/users/me').send(body as object);

describe('Khung ảnh đại diện', () => {
  it('mặc định "none"', async () => {
    const a = await signUp(app);
    expect((await as(app, a).get('/api/auth/me')).body.user.avatarFrame).toBe('none');
  });

  it.each(AVATAR_FRAMES)('đặt khung "%s" → lưu và hiện ở hồ sơ người khác', async (frame) => {
    const a = await signUp(app);
    const b = await signUp(app);
    const res = await patch(a, { avatarFrame: frame });
    expect(res.status).toBe(200);
    expect(res.body.user.avatarFrame).toBe(frame);
    expect((await as(app, b).get(`/api/users/${a.id}`)).body.user.avatarFrame).toBe(frame);
  });

  it('khung hiện cả trong bài viết của người đó', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await patch(a, { avatarFrame: 'gold' });
    await as(app, a).post('/api/posts').send({ content: 'bài có khung' });
    const feed = (await as(app, b).get('/api/posts')).body.posts;
    expect(feed.find((p: { author: { id: string } }) => p.author.id === a.id).author.avatarFrame).toBe('gold');
  });

  it('khung không có trong danh sách / sai kiểu → 400', async () => {
    const a = await signUp(app);
    for (const frame of ['neon', '', 'GOLD', 5, null, ['gold'], {}]) expect((await patch(a, { avatarFrame: frame })).status, JSON.stringify(frame)).toBe(400);
    expect((await as(app, a).get('/api/auth/me')).body.user.avatarFrame).toBe('none');
  });

  it('đổi khung không ảnh hưởng các trường khác', async () => {
    const a = await signUp(app);
    await patch(a, { bio: 'giữ nguyên', workplace: 'FPT' });
    await patch(a, { avatarFrame: 'rose' });
    expect((await as(app, a).get('/api/auth/me')).body.user).toMatchObject({ bio: 'giữ nguyên', workplace: 'FPT', avatarFrame: 'rose' });
  });
});

describe('Liên kết mạng xã hội', () => {
  it('chưa đặt → object rỗng', async () => {
    const a = await signUp(app);
    expect((await as(app, a).get('/api/auth/me')).body.user.socialLinks).toEqual({});
  });

  it('đặt đủ 7 nền tảng → lưu và trả về đúng', async () => {
    const a = await signUp(app);
    const links = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, `https://${p}.com/nguoidung`]));
    const res = await patch(a, { socialLinks: links });
    expect(res.status).toBe(200);
    expect(res.body.user.socialLinks).toEqual(links);
  });

  it('hiện ở hồ sơ người khác', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await patch(a, { socialLinks: { github: 'https://github.com/abc' } });
    expect((await as(app, b).get(`/api/users/${a.id}`)).body.user.socialLinks).toEqual({ github: 'https://github.com/abc' });
  });

  it('gửi từng phần thì GỘP với liên kết đã có (không ghi đè cả nhóm)', async () => {
    const a = await signUp(app);
    await patch(a, { socialLinks: { facebook: 'https://facebook.com/a', github: 'https://github.com/a' } });
    const res = await patch(a, { socialLinks: { github: 'https://github.com/moi' } });
    expect(res.body.user.socialLinks).toEqual({ facebook: 'https://facebook.com/a', github: 'https://github.com/moi' });
  });

  it('gửi chuỗi rỗng → xoá liên kết đó (khỏi kết quả), giữ các liên kết khác', async () => {
    const a = await signUp(app);
    await patch(a, { socialLinks: { facebook: 'https://facebook.com/a', github: 'https://github.com/a' } });
    const res = await patch(a, { socialLinks: { facebook: '' } });
    expect(res.body.user.socialLinks).toEqual({ github: 'https://github.com/a' });
  });

  it('cắt khoảng trắng 2 đầu; http và https đều được; không phân biệt hoa thường', async () => {
    const a = await signUp(app);
    const res = await patch(a, { socialLinks: { facebook: '  https://facebook.com/a  ', github: 'http://github.com/a', twitter: 'HTTPS://X.COM/a' } });
    expect(res.body.user.socialLinks).toEqual({ facebook: 'https://facebook.com/a', github: 'http://github.com/a', twitter: 'HTTPS://X.COM/a' });
  });

  it.each([
    ['javascript:alert(1)'], ['JAVASCRIPT:alert(1)'], ['data:text/html,<script>alert(1)</script>'], ['vbscript:msgbox'], ['file:///etc/passwd'], ['ftp://x.com'],
    ['//facebook.com/a'], ['facebook.com/a'], ['www.facebook.com'], ['https://'], ['https://a b.com'], ['https://a.com/<script>'], ['https://a.com/"onmouseover="x'], ["https://a.com/'x"],
    [' javascript:alert(1)'], ['https://a.com\nhttps://b.com'], ['x'.repeat(10)], ['https://' + 'a'.repeat(300)],
  ])('liên kết nguy hiểm / sai định dạng bị từ chối: %s', async (link) => {
    const a = await signUp(app);
    const res = await patch(a, { socialLinks: { facebook: link } });
    expect(res.status).toBe(400);
    expect((await as(app, a).get('/api/auth/me')).body.user.socialLinks).toEqual({});
  });

  it('nền tảng lạ / sai kiểu → bỏ qua hoặc từ chối, không lưu', async () => {
    const a = await signUp(app);
    const unknown = await patch(a, { socialLinks: { myspace: 'https://myspace.com/a' } });
    expect(unknown.status).toBe(200);
    expect(unknown.body.user.socialLinks).toEqual({});
    for (const socialLinks of ['x', 5, null, [], { facebook: 5 }, { facebook: null }, { facebook: ['https://a.com'] }]) {
      expect((await patch(a, { socialLinks })).status, JSON.stringify(socialLinks)).toBe(400);
    }
  });

  it('chống NoSQL injection: socialLinks.$where / khoá bắt đầu bằng $ không lọt vào database', async () => {
    const a = await signUp(app);
    const res = await patch(a, { socialLinks: { facebook: 'https://facebook.com/a', $set: { isOnline: false } } });
    expect(res.status).toBe(200);
    expect(res.body.user.socialLinks).toEqual({ facebook: 'https://facebook.com/a' });
  });

  it('không đổi được liên kết của người khác (chỉ sửa hồ sơ của mình)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await patch(a, { socialLinks: { github: 'https://github.com/a' } });
    await patch(b, { socialLinks: { github: 'https://github.com/b' } });
    expect((await as(app, a).get('/api/auth/me')).body.user.socialLinks.github).toBe('https://github.com/a');
  });

  it('chưa đăng nhập → 401', async () => {
    const { default: request } = await import('supertest');
    expect((await request(app).patch('/api/users/me').send({ avatarFrame: 'gold' })).status).toBe(401);
  });
});

describe('updateProfileSchema (hàm thuần)', () => {
  const ok = (data: unknown) => updateProfileSchema.safeParse(data).success;
  it.each(SOCIAL_PLATFORMS)('nền tảng %s nhận http(s) và chuỗi rỗng', (p) => {
    expect(ok({ socialLinks: { [p]: 'https://x.com/a' } })).toBe(true);
    expect(ok({ socialLinks: { [p]: '' } })).toBe(true);
    expect(ok({ socialLinks: { [p]: 'javascript:1' } })).toBe(false);
  });
  it('socialLinks rỗng và không có socialLinks đều hợp lệ', () => {
    expect(ok({ socialLinks: {} })).toBe(true);
    expect(ok({})).toBe(true);
  });
  it('giới hạn độ dài 300 ký tự', () => {
    expect(ok({ socialLinks: { facebook: 'https://a.com/' + 'x'.repeat(280) } })).toBe(true);
    expect(ok({ socialLinks: { facebook: 'https://a.com/' + 'x'.repeat(300) } })).toBe(false);
  });
});

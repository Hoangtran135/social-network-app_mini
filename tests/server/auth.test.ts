import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { UserModel } from '../../server/models/User';
import { createToken } from '../../server/jwtAuth';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, bogusId } from './helpers';

// Test tài khoản: đăng ký, đăng nhập, đăng xuất, /me, quên + đặt lại mật khẩu, đổi mật khẩu.

// Chặn gửi email thật; lấy ra link đặt lại mật khẩu để test
const sentEmails: { to: string; url: string }[] = [];
vi.mock('../../server/email', () => ({
  sendPasswordResetEmail: async (to: string, url: string) => void sentEmails.push({ to, url }),
  sendVerificationEmail: async () => {},
}));

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const valid = (extra: Record<string, unknown> = {}) => ({ name: 'Nguyễn Văn A', username: `user_${Math.random().toString(36).slice(2, 8)}`, email: `${Math.random().toString(36).slice(2, 8)}@test.vn`, password: 'secret123', ...extra });

describe('Đăng ký', () => {
  it('đăng ký thành công → trả token + hồ sơ, không lộ mật khẩu', async () => {
    const body = valid();
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: body.name, username: body.username, email: body.email });
    expect(res.body.user.blockedUserIds).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|secret123/);
  });

  it('token nhận được dùng được ngay cho /auth/me', async () => {
    const reg = await request(app).post('/api/auth/register').send(valid());
    const me = await as(app, reg.body).get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(reg.body.user.id);
  });

  it('trùng email (kể cả khác hoa/thường) → 409', async () => {
    const body = valid({ email: 'Dup.Email@Test.vn' });
    expect((await request(app).post('/api/auth/register').send(body)).status).toBe(200);
    const again = await request(app).post('/api/auth/register').send(valid({ email: 'dup.email@test.vn' }));
    expect(again.status).toBe(409);
  });

  it('trùng username → 409', async () => {
    const body = valid();
    await request(app).post('/api/auth/register').send(body);
    const again = await request(app).post('/api/auth/register').send(valid({ username: body.username }));
    expect(again.status).toBe(409);
  });

  it('email được lưu chữ thường, đăng nhập bằng chữ hoa vẫn được', async () => {
    const body = valid({ email: 'MixedCase@Test.vn' });
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/login').send({ email: 'MIXEDCASE@TEST.VN', password: body.password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('mixedcase@test.vn');
  });

  it.each([
    ['thiếu tên', { name: '' }],
    ['tên chỉ có khoảng trắng', { name: '    ' }],
    ['username quá ngắn', { username: 'ab' }],
    ['username có khoảng trắng', { username: 'a b c' }],
    ['username có ký tự đặc biệt', { username: 'user@name' }],
    ['username quá dài', { username: 'a'.repeat(31) }],
    ['email sai định dạng', { email: 'khong-phai-email' }],
    ['mật khẩu dưới 6 ký tự', { password: '12345' }],
    ['mật khẩu quá dài', { password: 'x'.repeat(201) }],
  ])('từ chối dữ liệu không hợp lệ: %s → 400', async (_label, override) => {
    const res = await request(app).post('/api/auth/register').send(valid(override));
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('thiếu hẳn body → 400', async () => {
    expect((await request(app).post('/api/auth/register').send({})).status).toBe(400);
  });

  it('tên có tiếng Việt, emoji và ký tự lạ được chấp nhận', async () => {
    const res = await request(app).post('/api/auth/register').send(valid({ name: 'Trần Thị Bích 🌸 Ngọc' }));
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Trần Thị Bích 🌸 Ngọc');
  });

  it('tên được cắt khoảng trắng 2 đầu', async () => {
    const res = await request(app).post('/api/auth/register').send(valid({ name: '   Lan   ' }));
    expect(res.body.user.name).toBe('Lan');
  });
});

describe('Đăng nhập', () => {
  it('đúng email + mật khẩu → token, đặt trạng thái online', async () => {
    const u = await signUp(app);
    await as(app, u).post('/api/auth/logout');
    const res = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
    expect(res.status).toBe(200);
    expect(res.body.user.isOnline).toBe(true);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('sai mật khẩu → 401', async () => {
    const u = await signUp(app);
    const res = await request(app).post('/api/auth/login').send({ email: u.email, password: 'sai-mat-khau' });
    expect(res.status).toBe(401);
  });

  it('email không tồn tại → 401 và cùng câu báo lỗi với sai mật khẩu (không lộ email có tồn tại hay không)', async () => {
    const u = await signUp(app);
    const wrongPass = await request(app).post('/api/auth/login').send({ email: u.email, password: 'x' });
    const noUser = await request(app).post('/api/auth/login').send({ email: 'khong.ton.tai@test.vn', password: 'x' });
    expect(noUser.status).toBe(401);
    expect(noUser.body.error).toBe(wrongPass.body.error);
  });

  it('thiếu mật khẩu / email → 400', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'a@b.vn' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ password: 'x' })).status).toBe(400);
  });

  it('chống NoSQL injection: gửi {"$ne": null} thay vì chuỗi → bị từ chối, không đăng nhập được', async () => {
    await signUp(app);
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  it('gửi JSON hỏng → 400 (không sập server)', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
    expect((await request(app).get('/api/health')).body.status).toBe('ok');
  });
});

describe('Token / phiên đăng nhập', () => {
  it('không có token → 401', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('token rác → 401', async () => {
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
  });

  it('header sai định dạng (thiếu "Bearer ") → 401', async () => {
    const u = await signUp(app);
    expect((await request(app).get('/api/auth/me').set('Authorization', u.token)).status).toBe(401);
  });

  it('token hợp lệ nhưng người dùng đã bị xoá → 404', async () => {
    const res = await as(app, { token: createToken(bogusId) }).get('/api/auth/me');
    expect(res.status).toBe(404);
  });

  it('đăng xuất → chuyển offline và có lastActive', async () => {
    const u = await signUp(app);
    expect((await as(app, u).post('/api/auth/logout')).status).toBe(200);
    const doc = await UserModel.findById(u.id);
    expect(doc.isOnline).toBe(false);
    expect(doc.lastActive).toBeInstanceOf(Date);
  });
});

describe('Quên / đặt lại mật khẩu', () => {
  const tokenFromUrl = (url: string) => new URL(url).searchParams.get('token')!;

  it('luôn trả ok kể cả email không tồn tại (không lộ email), và không gửi mail cho email lạ', async () => {
    sentEmails.length = 0;
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'khong.co@test.vn' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(sentEmails).toHaveLength(0);
  });

  it('email sai định dạng → 400', async () => {
    expect((await request(app).post('/api/auth/forgot-password').send({ email: 'abc' })).status).toBe(400);
  });

  it('luồng đầy đủ: nhận link → đặt mật khẩu mới → đăng nhập bằng mật khẩu mới, mật khẩu cũ hết hiệu lực', async () => {
    const u = await signUp(app);
    sentEmails.length = 0;
    await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe(u.email);
    const token = tokenFromUrl(sentEmails[0].url);

    const reset = await request(app).post('/api/auth/reset-password').send({ email: u.email, token, password: 'matkhaumoi1' });
    expect(reset.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: 'matkhaumoi1' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(401);
  });

  it('token chỉ dùng được 1 lần', async () => {
    const u = await signUp(app);
    sentEmails.length = 0;
    await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    const token = tokenFromUrl(sentEmails[0].url);
    await request(app).post('/api/auth/reset-password').send({ email: u.email, token, password: 'matkhaumoi1' });
    const again = await request(app).post('/api/auth/reset-password').send({ email: u.email, token, password: 'matkhaumoi2' });
    expect(again.status).toBe(400);
  });

  it('token sai → 400, mật khẩu không bị đổi', async () => {
    const u = await signUp(app);
    await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    const res = await request(app).post('/api/auth/reset-password').send({ email: u.email, token: 'sai-token', password: 'matkhaumoi1' });
    expect(res.status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(200);
  });

  it('token của người này không dùng được cho email người khác', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    sentEmails.length = 0;
    await request(app).post('/api/auth/forgot-password').send({ email: a.email });
    const token = tokenFromUrl(sentEmails[0].url);
    const res = await request(app).post('/api/auth/reset-password').send({ email: b.email, token, password: 'matkhaumoi1' });
    expect(res.status).toBe(400);
  });

  it('token hết hạn (quá 1 giờ) → 400', async () => {
    const u = await signUp(app);
    sentEmails.length = 0;
    await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    const token = tokenFromUrl(sentEmails[0].url);
    await UserModel.updateOne({ _id: u.id }, { resetTokenExpires: new Date(Date.now() - 1000) });
    const res = await request(app).post('/api/auth/reset-password').send({ email: u.email, token, password: 'matkhaumoi1' });
    expect(res.status).toBe(400);
  });

  it('mật khẩu mới quá ngắn → 400', async () => {
    const u = await signUp(app);
    const res = await request(app).post('/api/auth/reset-password').send({ email: u.email, token: 'x', password: '123' });
    expect(res.status).toBe(400);
  });

  it('token trong DB được lưu dạng băm, không lưu nguyên văn', async () => {
    const u = await signUp(app);
    sentEmails.length = 0;
    await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    const token = tokenFromUrl(sentEmails[0].url);
    const doc = await UserModel.findById(u.id);
    expect(doc.resetTokenHash).toBeTruthy();
    expect(doc.resetTokenHash).not.toBe(token);
  });
});

describe('Đổi mật khẩu', () => {
  it('đổi thành công → đăng nhập bằng mật khẩu mới', async () => {
    const u = await signUp(app);
    const res = await as(app, u).patch('/api/users/me/password').send({ currentPassword: u.password, newPassword: 'mat-khau-moi' });
    expect(res.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: 'mat-khau-moi' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(401);
  });

  it('sai mật khẩu hiện tại → 400 và mật khẩu giữ nguyên', async () => {
    const u = await signUp(app);
    const res = await as(app, u).patch('/api/users/me/password').send({ currentPassword: 'sai', newPassword: 'mat-khau-moi' });
    expect(res.status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(200);
  });

  it('mật khẩu mới dưới 6 ký tự → 400', async () => {
    const u = await signUp(app);
    expect((await as(app, u).patch('/api/users/me/password').send({ currentPassword: u.password, newPassword: '12345' })).status).toBe(400);
  });

  it('chưa đăng nhập → 401', async () => {
    expect((await request(app).patch('/api/users/me/password').send({ currentPassword: 'a', newPassword: 'bbbbbb' })).status).toBe(401);
  });
});

describe('Giới hạn số lần thử (chống dò mật khẩu)', () => {
  it('quá 20 lần đăng nhập trong 15 phút → 429', async () => {
    const limited = buildApp({ rateLimits: true });
    let last = 0;
    for (let i = 0; i < 22; i++) {
      last = (await request(limited).post('/api/auth/login').send({ email: 'ai.do@test.vn', password: 'x' })).status;
    }
    expect(last).toBe(429);
  });
});

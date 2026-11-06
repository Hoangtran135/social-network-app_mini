import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { UserModel } from '../../server/models/User';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as } from './helpers';

// Xác minh email khi đăng ký: gửi link, xác minh, gửi lại, hết hạn, tài khoản cũ.

const sent: { to: string; url: string }[] = [];
let failSending = false;
vi.mock('../../server/email', () => ({
  sendPasswordResetEmail: async () => {},
  sendVerificationEmail: async (to: string, url: string) => {
    if (failSending) throw new Error('SMTP hỏng');
    sent.push({ to, url });
  },
}));

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);
beforeEach(() => {
  sent.length = 0;
  failSending = false;
});

const register = (n = Math.random().toString(36).slice(2, 8)) => request(app).post('/api/auth/register').send({ name: 'Người Mới', username: `u${n}`, email: `${n}@test.vn`, password: 'secret123' });
const tokenOf = (url: string) => new URL(url).searchParams.get('token')!;
const verify = (email: string, token: string) => request(app).post('/api/auth/verify-email').send({ email, token });

describe('Đăng ký gửi email xác minh', () => {
  it('đăng ký → tài khoản chưa xác minh + email có link đúng định dạng', async () => {
    const res = await register('abc123');
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('abc123@test.vn');
    const url = new URL(sent[0].url);
    expect(url.pathname).toBe('/verify-email');
    expect(url.searchParams.get('email')).toBe('abc123@test.vn');
    expect(tokenOf(sent[0].url)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mã trong DB chỉ lưu dạng băm, hạn 24 giờ', async () => {
    const res = await register('hash01');
    const doc = await UserModel.findById(res.body.user.id);
    expect(doc!.verifyTokenHash).toBeTruthy();
    expect(doc!.verifyTokenHash).not.toBe(tokenOf(sent[0].url));
    const hours = (doc!.verifyTokenExpires.getTime() - Date.now()) / 3600000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it('gửi email lỗi → đăng ký VẪN thành công (không mất tài khoản)', async () => {
    failSending = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await register('fail01');
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('chưa xác minh vẫn đăng nhập và dùng được ứng dụng (xác minh mềm, không chặn)', async () => {
    const reg = await register('soft01');
    const me = await as(app, reg.body).get('/api/auth/me');
    expect(me.body.user.emailVerified).toBe(false);
    expect((await as(app, reg.body).post('/api/posts').send({ content: 'vẫn đăng được' })).status).toBe(200);
    const login = await request(app).post('/api/auth/login').send({ email: 'soft01@test.vn', password: 'secret123' });
    expect(login.status).toBe(200);
    expect(login.body.user.emailVerified).toBe(false);
  });

  it('mỗi lần đăng ký có mã khác nhau', async () => {
    await register('diff01');
    await register('diff02');
    expect(tokenOf(sent[0].url)).not.toBe(tokenOf(sent[1].url));
  });

  it('trường emailVerified chỉ có ở hồ sơ của MÌNH, không lộ ở hồ sơ người khác', async () => {
    const reg = await register('priv01');
    const other = await signUp(app);
    const seen = await as(app, other).get(`/api/users/${reg.body.user.id}`);
    expect(seen.body.user.emailVerified).toBeUndefined();
    expect(JSON.stringify(seen.body)).not.toMatch(/verifyToken/);
  });
});

describe('Xác minh bằng link', () => {
  it('đúng mã → emailVerified = true, mã bị xoá', async () => {
    const reg = await register('ok0001');
    const res = await verify('ok0001@test.vn', tokenOf(sent[0].url));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const doc = await UserModel.findById(reg.body.user.id);
    expect(doc!.emailVerified).toBe(true);
    expect(doc!.verifyTokenHash).toBeUndefined();
    expect((await as(app, reg.body).get('/api/auth/me')).body.user.emailVerified).toBe(true);
  });

  it('bấm link lần 2 (đã xác minh) → vẫn ok', async () => {
    await register('twice1');
    const token = tokenOf(sent[0].url);
    await verify('twice1@test.vn', token);
    expect((await verify('twice1@test.vn', token)).status).toBe(200);
  });

  it('sai mã → 400, vẫn chưa xác minh', async () => {
    const reg = await register('bad001');
    const res = await verify('bad001@test.vn', 'ma-sai');
    expect(res.status).toBe(400);
    expect((await UserModel.findById(reg.body.user.id))!.emailVerified).toBe(false);
  });

  it('mã của người này không dùng cho email người khác', async () => {
    await register('who001');
    await register('who002');
    expect((await verify('who002@test.vn', tokenOf(sent[0].url))).status).toBe(400);
  });

  it('mã hết hạn (quá 24 giờ) → 400', async () => {
    const reg = await register('old001');
    await UserModel.updateOne({ _id: reg.body.user.id }, { verifyTokenExpires: new Date(Date.now() - 1000) });
    expect((await verify('old001@test.vn', tokenOf(sent[0].url))).status).toBe(400);
  });

  it('email không tồn tại → 400 (không lộ email có tồn tại hay không)', async () => {
    const res = await verify('khong.co@test.vn', 'x');
    expect(res.status).toBe(400);
  });

  it('email sai định dạng / thiếu mã / thiếu email → 400', async () => {
    for (const body of [{ email: 'abc', token: 'x' }, { email: 'a@b.vn' }, { token: 'x' }, {}, { email: 'a@b.vn', token: '' }, { email: 'a@b.vn', token: 'x'.repeat(501) }]) {
      expect((await request(app).post('/api/auth/verify-email').send(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('email viết hoa vẫn xác minh được', async () => {
    await register('case01');
    expect((await verify('CASE01@TEST.VN', tokenOf(sent[0].url))).status).toBe(200);
  });

  it('chống NoSQL injection ở trường email / token', async () => {
    const res = await request(app).post('/api/auth/verify-email').send({ email: { $ne: null }, token: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it('không cần đăng nhập để xác minh (mở link từ email trên máy khác)', async () => {
    await register('anon01');
    expect((await verify('anon01@test.vn', tokenOf(sent[0].url))).status).toBe(200);
  });
});

describe('Gửi lại email xác minh', () => {
  it('chưa xác minh → gửi email mới, mã cũ hết tác dụng, mã mới dùng được', async () => {
    const reg = await register('resend');
    const oldToken = tokenOf(sent[0].url);
    const res = await as(app, reg.body).post('/api/auth/resend-verification');
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(2);
    const newToken = tokenOf(sent[1].url);
    expect(newToken).not.toBe(oldToken);
    expect((await verify('resend@test.vn', oldToken)).status).toBe(400);
    expect((await verify('resend@test.vn', newToken)).status).toBe(200);
  });

  it('đã xác minh → 400 và không gửi thêm', async () => {
    const reg = await register('done01');
    await verify('done01@test.vn', tokenOf(sent[0].url));
    sent.length = 0;
    expect((await as(app, reg.body).post('/api/auth/resend-verification')).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('tài khoản cũ (chưa có trường emailVerified) coi như đã xác minh → 400', async () => {
    const legacy = await signUp(app);
    await UserModel.collection.updateOne({ email: legacy.email }, { $unset: { emailVerified: '' } });
    expect((await as(app, legacy).get('/api/auth/me')).body.user.emailVerified).toBe(true);
    expect((await as(app, legacy).post('/api/auth/resend-verification')).status).toBe(400);
  });

  it('chưa đăng nhập → 401; token của người đã bị xoá → 401', async () => {
    expect((await request(app).post('/api/auth/resend-verification')).status).toBe(401);
    const { createToken } = await import('../../server/jwtAuth');
    expect((await as(app, { token: createToken('64b0f0f0f0f0f0f0f0f0f0f0') }).post('/api/auth/resend-verification')).status).toBe(401);
  });

  it('gửi lại bị lỗi SMTP → vẫn trả ok (đã ghi log), không 500', async () => {
    const reg = await register('smtp01');
    failSending = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await as(app, reg.body).post('/api/auth/resend-verification')).status).toBe(200);
  });
});

describe('Giới hạn số lần thử', () => {
  it('quá 20 lần xác minh trong 15 phút → 429', async () => {
    const limited = buildApp({ rateLimits: true });
    let last = 0;
    for (let i = 0; i < 22; i++) last = (await request(limited).post('/api/auth/verify-email').send({ email: 'a@b.vn', token: 'x' })).status;
    expect(last).toBe(429);
  });
});

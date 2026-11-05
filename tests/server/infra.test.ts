import { describe, it, expect, vi, afterEach } from 'vitest';
import mongoose from 'mongoose';

// Test hạ tầng: gửi email (có / không cấu hình SMTP) và kết nối database.

const sendMail = vi.fn().mockResolvedValue(undefined);
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock('nodemailer', () => ({ default: { createTransport: (...args: unknown[]) => (createTransport as (...a: unknown[]) => unknown)(...args) } }));

const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
const original = { ...process.env };
afterEach(() => {
  for (const key of [...SMTP_KEYS, 'NODE_ENV']) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  vi.resetModules();
  sendMail.mockClear();
  createTransport.mockClear();
});

const loadEmail = async () => (await import('../../server/email')).sendPasswordResetEmail;

describe('sendPasswordResetEmail', () => {
  it('chưa cấu hình SMTP (môi trường phát triển) → in link ra console, không gửi mail', async () => {
    SMTP_KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'development'; // trong môi trường test email giả im lặng; ở môi trường phát triển thì in link ra terminal
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const send = await loadEmail();
    await expect(send('a@b.vn', 'https://x/reset?token=abc')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('https://x/reset?token=abc'));
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('chưa cấu hình SMTP ở môi trường production → báo lỗi (không âm thầm nuốt)', async () => {
    SMTP_KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'production';
    const send = await loadEmail();
    await expect(send('a@b.vn', 'https://x')).rejects.toThrow('SMTP is not configured');
  });

  it('có SMTP → gửi mail tới đúng người, chứa link, tiêu đề tiếng Việt', async () => {
    Object.assign(process.env, { SMTP_HOST: 'smtp.test', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM: 'App <no-reply@test.vn>' });
    const send = await loadEmail();
    await send('nguoi@nhan.vn', 'https://app/reset?token=t1');
    expect(createTransport).toHaveBeenCalledWith({ host: 'smtp.test', port: 587, secure: false, auth: { user: 'u', pass: 'p' } });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: 'nguoi@nhan.vn', from: 'App <no-reply@test.vn>', subject: 'Đặt lại mật khẩu SocialNet' });
    expect(mail.html).toContain('https://app/reset?token=t1');
    expect(mail.html).toContain('1 giờ');
  });

  it('cổng 465 → kết nối bảo mật (secure)', async () => {
    Object.assign(process.env, { SMTP_HOST: 'smtp.test', SMTP_PORT: '465' });
    await loadEmail();
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));
  });

  it('không có SMTP_PORT → mặc định 587; không có user → không gửi auth', async () => {
    Object.assign(process.env, { SMTP_HOST: 'smtp.test' });
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    await loadEmail();
    expect(createTransport).toHaveBeenCalledWith({ host: 'smtp.test', port: 587, secure: false, auth: undefined });
  });

  it('không có SMTP_FROM → dùng người gửi mặc định', async () => {
    Object.assign(process.env, { SMTP_HOST: 'smtp.test' });
    delete process.env.SMTP_FROM;
    const send = await loadEmail();
    await send('a@b.vn', 'https://x');
    expect(sendMail.mock.calls[0][0].from).toContain('SocialNet');
  });

  it('SMTP lỗi → lỗi được ném ra để nơi gọi ghi log (route quên mật khẩu đã bắt lỗi này)', async () => {
    Object.assign(process.env, { SMTP_HOST: 'smtp.test' });
    sendMail.mockRejectedValueOnce(new Error('kết nối bị từ chối'));
    const send = await loadEmail();
    await expect(send('a@b.vn', 'https://x')).rejects.toThrow('kết nối bị từ chối');
  });
});

describe('sendVerificationEmail', () => {
  const loadVerify = async () => (await import('../../server/email')).sendVerificationEmail;

  it('chưa cấu hình SMTP (phát triển) → in link ra console', async () => {
    SMTP_KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'development';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await (await loadVerify())('a@b.vn', 'https://x/verify-email?token=t');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('link xác minh email cho a@b.vn: https://x/verify-email?token=t'));
  });

  it('môi trường test → im lặng (không in link)', async () => {
    SMTP_KEYS.forEach((k) => delete process.env[k]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await (await loadVerify())('a@b.vn', 'https://x');
    expect(log).not.toHaveBeenCalled();
  });

  it('production chưa có SMTP → báo lỗi', async () => {
    SMTP_KEYS.forEach((k) => delete process.env[k]);
    process.env.NODE_ENV = 'production';
    await expect((await loadVerify())('a@b.vn', 'https://x')).rejects.toThrow('SMTP is not configured');
  });

  it('có SMTP → gửi mail xác minh có link và hạn 24 giờ', async () => {
    Object.assign(process.env, { SMTP_HOST: 'smtp.test', SMTP_FROM: 'App <no-reply@test.vn>' });
    await (await loadVerify())('moi@test.vn', 'https://app/verify-email?token=abc');
    const mail = sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: 'moi@test.vn', from: 'App <no-reply@test.vn>', subject: 'Xác minh email SocialNet' });
    expect(mail.html).toContain('https://app/verify-email?token=abc');
    expect(mail.html).toContain('24 giờ');
  });
});

describe('connectDatabase', () => {
  it('kết nối tới MONGODB_URI và ghi log', async () => {
    const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.MONGODB_URI = 'mongodb://example.test:27017/xyz-test';
    process.env.MONGO_POOL_SIZE = '7';
    const { connectDatabase } = await import('../../server/database');
    await connectDatabase();
    expect(connect).toHaveBeenCalledWith('mongodb://example.test:27017/xyz-test', { maxPoolSize: 7 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('xyz-test'));
    delete process.env.MONGODB_URI;
    delete process.env.MONGO_POOL_SIZE;
  });

  it('không có biến môi trường → dùng địa chỉ mặc định và pool 100', async () => {
    const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.MONGODB_URI;
    delete process.env.MONGO_POOL_SIZE;
    const { connectDatabase } = await import('../../server/database');
    await connectDatabase();
    expect(connect).toHaveBeenCalledWith('mongodb://127.0.0.1:27017/social-network-app-mini', { maxPoolSize: 100 });
  });

  it('kết nối thất bại → lỗi lan ra cho server.ts xử lý (thoát với mã lỗi)', async () => {
    vi.spyOn(mongoose, 'connect').mockRejectedValue(new Error('ECONNREFUSED'));
    const { connectDatabase } = await import('../../server/database');
    await expect(connectDatabase()).rejects.toThrow('ECONNREFUSED');
  });
});

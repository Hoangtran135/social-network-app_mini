// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, screen, waitFor } from './harness';
import { db, calls, apiModule } from './fakeServer';

// Xác minh email: banner nhắc, gửi lại, kiểm tra lại, và trang /verify-email.

beforeEach(() => installBrowserStubs());
const unverified = () => void (db.me.emailVerified = false);

describe('Banner nhắc xác minh', () => {
  it('tài khoản chưa xác minh → hiện banner kèm email', async () => {
    renderApp('/', { seed: unverified });
    await feedLoaded();
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('u1@test.vn');
    expect(banner.textContent).toContain('chưa được xác minh');
  });

  it('đã xác minh (hoặc tài khoản cũ chưa có trường này) → không có banner', async () => {
    renderApp('/');
    await feedLoaded();
    expect(screen.queryByText(/chưa được xác minh/)).toBeNull();
  });

  it('chỉ có ở khu vực đã đăng nhập, không có ở trang đăng nhập', async () => {
    renderApp('/login', { loggedIn: false });
    expect(screen.queryByText(/chưa được xác minh/)).toBeNull();
  });

  it('banner vẫn cho dùng bình thường (không chặn đăng bài / điều hướng)', async () => {
    const { user, location } = renderApp('/', { seed: unverified });
    await feedLoaded();
    await user.click(screen.getAllByRole('link', { name: /Bạn bè/ })[0]);
    expect(location()).toBe('/friends');
    expect(screen.getByText(/chưa được xác minh/)).toBeTruthy(); // banner theo sang trang khác
  });

  it('"Gửi lại email" → gọi API + toast thành công', async () => {
    const { user } = renderApp('/', { seed: unverified });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Gửi lại email' }));
    expect(await screen.findByText(/Đã gửi lại email xác minh/)).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/auth/resend-verification')).toBe(true);
  });

  it('gửi lại lỗi → toast lỗi với câu của server', async () => {
    const { user } = renderApp('/', { seed: unverified });
    await feedLoaded();
    db.failNext.add('POST /auth/resend-verification');
    await user.click(screen.getByRole('button', { name: 'Gửi lại email' }));
    expect(await screen.findByText('Lỗi máy chủ giả lập')).toBeTruthy();
  });

  it('gửi lại lỗi mạng (không phải ApiError) → câu mặc định', async () => {
    const { user } = renderApp('/', { seed: unverified });
    await feedLoaded();
    const original = apiModule.api.post;
    apiModule.api.post = () => Promise.reject(new Error('mạng'));
    await user.click(screen.getByRole('button', { name: 'Gửi lại email' }));
    expect(await screen.findByText('Không thể gửi lại email lúc này.')).toBeTruthy();
    apiModule.api.post = original;
  });

  it('"Tôi đã xác minh" khi vẫn chưa xác minh → toast nhắc, banner còn', async () => {
    const { user } = renderApp('/', { seed: unverified });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tôi đã xác minh' }));
    expect(await screen.findByText(/vẫn chưa được xác minh/)).toBeTruthy();
    expect(screen.getByText(/Hãy mở email chúng tôi đã gửi/)).toBeTruthy();
  });

  it('"Tôi đã xác minh" khi đã xác minh ở nơi khác → banner biến mất + lời cảm ơn', async () => {
    const { user } = renderApp('/', { seed: unverified });
    await feedLoaded();
    db.me = { ...db.me, emailVerified: true }; // người dùng bấm link trong email ở tab / máy khác
    await user.click(screen.getByRole('button', { name: 'Tôi đã xác minh' }));
    expect(await screen.findByText(/email đã được xác minh!/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Hãy mở email chúng tôi đã gửi/)).toBeNull());
  });

  it('đăng ký xong → vào bảng tin và thấy banner nhắc xác minh', async () => {
    const { user, location } = renderApp('/register', { loggedIn: false });
    await user.type(screen.getByLabelText('Họ và tên'), 'Người Mới');
    await user.type(screen.getByLabelText('Tên người dùng (@username)'), 'nguoimoi');
    await user.type(screen.getByLabelText('Email'), 'moi@test.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'matkhau1');
    await user.click(screen.getByRole('button', { name: /^Đăng ký tài khoản/ }));
    await waitFor(() => expect(location()).toBe('/'));
    expect(await screen.findByText(/chưa được xác minh/)).toBeTruthy();
    expect(screen.getByText('moi@test.vn', { selector: 'b' })).toBeTruthy();
  });
});

describe('Trang /verify-email', () => {
  it('thiếu token hoặc email → "Liên kết không hợp lệ", không gọi server', async () => {
    renderApp('/verify-email', { loggedIn: false });
    expect(screen.getByText('Liên kết không hợp lệ')).toBeTruthy();
    renderApp('/verify-email?token=abc', { loggedIn: false });
    expect(calls.some((c) => c.path === '/auth/verify-email')).toBe(false);
  });

  it('mã đúng → "Đã xác minh email!" kèm địa chỉ; chưa đăng nhập thì nút dẫn tới đăng nhập', async () => {
    renderApp('/verify-email?token=good-token&email=u1%40test.vn', { loggedIn: false });
    expect(screen.getByRole('status').textContent).toContain('Đang xác minh');
    expect(await screen.findByText('Đã xác minh email!')).toBeTruthy();
    expect(screen.getByText('u1@test.vn')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Đăng nhập' }).getAttribute('href')).toBe('/login');
    expect(calls.find((c) => c.path === '/auth/verify-email')?.body).toEqual({ email: 'u1@test.vn', token: 'good-token' });
  });

  it('đang đăng nhập → nút "Vào SocialNet", banner biến mất sau khi xác minh', async () => {
    const { user, location } = renderApp('/verify-email?token=good-token&email=u1%40test.vn', { seed: unverified });
    expect(await screen.findByText('Đã xác minh email!')).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.method === 'GET' && c.path === '/auth/me')).toBe(true));
    await user.click(screen.getByRole('link', { name: 'Vào SocialNet' }));
    await waitFor(() => expect(location()).toBe('/'));
    await feedLoaded();
    expect(screen.queryByText(/Hãy mở email chúng tôi đã gửi/)).toBeNull();
  });

  it('mã sai / hết hạn → hiện câu báo lỗi của server và hướng dẫn gửi lại', async () => {
    const { user, location } = renderApp('/verify-email?token=sai&email=u1%40test.vn', { loggedIn: false });
    expect((await screen.findByRole('alert')).textContent).toContain('không hợp lệ hoặc đã hết hạn');
    expect(screen.getByText(/Gửi lại email/)).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Về trang đăng nhập' }));
    expect(location()).toBe('/login');
  });

  it('lỗi mạng (không phải ApiError) → câu báo lỗi mặc định', async () => {
    const original = apiModule.api.post;
    apiModule.api.post = () => Promise.reject(new Error('mạng'));
    renderApp('/verify-email?token=x&email=a%40b.vn', { loggedIn: false });
    expect((await screen.findByRole('alert')).textContent).toContain('Đã có lỗi xảy ra, vui lòng thử lại.');
    apiModule.api.post = original;
  });
});

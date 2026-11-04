// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, screen, waitFor, fireEvent } from './harness';
import { apiModule, calls } from './fakeServer';

// Các trang chưa đăng nhập: đăng nhập, đăng ký, quên mật khẩu, đặt lại mật khẩu.

beforeEach(() => installBrowserStubs());

describe('Đăng nhập', () => {
  const open = () => renderApp('/login', { loggedIn: false });

  it('hiện form và tiêu đề', () => {
    open();
    expect(screen.getByText('Đăng nhập tài khoản')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Mật khẩu')).toBeTruthy();
  });

  it('đúng tài khoản → vào bảng tin', async () => {
    const { user, location } = open();
    await user.type(screen.getByLabelText('Email'), 'u1@test.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'secret123');
    await user.click(screen.getByRole('button', { name: /^Đăng nhập/ }));
    await feedLoaded();
    expect(location()).toBe('/');
  });

  it('sai mật khẩu → hiện lỗi, vẫn ở trang đăng nhập', async () => {
    const { user, location } = open();
    await user.type(screen.getByLabelText('Email'), 'u1@test.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'sai-mat-khau');
    await user.click(screen.getByRole('button', { name: /^Đăng nhập/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Email hoặc mật khẩu không chính xác.');
    expect(location()).toBe('/login');
  });

  it('gõ lại thì lỗi biến mất', async () => {
    const { user } = open();
    await user.type(screen.getByLabelText('Email'), 'u1@test.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'x');
    await user.click(screen.getByRole('button', { name: /^Đăng nhập/ }));
    await screen.findByRole('alert');
    await user.type(screen.getByLabelText('Mật khẩu'), 'y');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('nút hiện / ẩn mật khẩu', async () => {
    const { user } = open();
    const input = screen.getByLabelText('Mật khẩu') as HTMLInputElement;
    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(input.type).toBe('text');
  });

  it('có liên kết Quên mật khẩu và Đăng ký', async () => {
    const { user, location } = open();
    await user.click(screen.getByText('Quên mật khẩu?'));
    expect(location()).toBe('/forgot-password');
  });

  it('liên kết Đăng ký ngay', async () => {
    const { user, location } = open();
    await user.click(screen.getByText('Đăng ký ngay'));
    expect(location()).toBe('/register');
  });

  it('đang đăng nhập thì nút bị khoá (không gửi 2 lần)', async () => {
    const { user } = open();
    await user.type(screen.getByLabelText('Email'), 'u1@test.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'secret123');
    await user.click(screen.getByRole('button', { name: /^Đăng nhập/ }));
    await feedLoaded();
    expect(calls.filter((c) => c.path === '/auth/login')).toHaveLength(1);
  });
});

describe('Đăng ký', () => {
  const open = () => renderApp('/register', { loggedIn: false });
  const fill = async (user: ReturnType<typeof open>['user'], v: { name?: string; username?: string; email?: string; password?: string }) => {
    if (v.name) await user.type(screen.getByLabelText('Họ và tên'), v.name);
    if (v.username) await user.type(screen.getByLabelText('Tên người dùng (@username)'), v.username);
    if (v.email) await user.type(screen.getByLabelText('Email'), v.email);
    if (v.password) await user.type(screen.getByLabelText('Mật khẩu'), v.password);
  };

  it('đăng ký thành công → vào bảng tin luôn', async () => {
    const { user, location } = open();
    await fill(user, { name: 'Lê Văn Mới', username: 'levanmoi', email: 'moi@test.vn', password: 'matkhau1' });
    await user.click(screen.getByRole('button', { name: /^Đăng ký tài khoản/ }));
    await waitFor(() => expect(location()).toBe('/'));
    expect(calls.find((c) => c.path === '/auth/register')?.body).toEqual({ name: 'Lê Văn Mới', username: 'levanmoi', email: 'moi@test.vn', password: 'matkhau1' });
  });

  it('username tự chuyển chữ thường và bỏ khoảng trắng khi gõ', async () => {
    const { user } = open();
    await user.type(screen.getByLabelText('Tên người dùng (@username)'), 'Nguyen Van A');
    expect((screen.getByLabelText('Tên người dùng (@username)') as HTMLInputElement).value).toBe('nguyenvana');
  });

  it('email đã tồn tại → báo lỗi, không chuyển trang', async () => {
    const { user, location } = open();
    await fill(user, { name: 'A', username: 'abc', email: 'u1@test.vn', password: 'matkhau1' });
    await user.click(screen.getByRole('button', { name: /^Đăng ký tài khoản/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Email hoặc tên người dùng đã tồn tại.');
    expect(location()).toBe('/register');
  });

  it('ô mật khẩu có gợi ý và yêu cầu tối thiểu 6 ký tự', () => {
    open();
    const input = screen.getByLabelText('Mật khẩu') as HTMLInputElement;
    expect(input.placeholder).toBe('Tối thiểu 6 ký tự');
    expect(input.minLength).toBe(6);
    expect(input.autocomplete).toBe('new-password');
  });

  it('liên kết quay lại Đăng nhập', async () => {
    const { user, location } = open();
    await user.click(screen.getByText('Đăng nhập ngay'));
    expect(location()).toBe('/login');
  });
});

describe('Quên mật khẩu', () => {
  const open = () => renderApp('/forgot-password', { loggedIn: false });

  it('gửi email → hiện thông báo đã gửi kèm địa chỉ', async () => {
    const { user } = open();
    await user.type(screen.getByLabelText('Email tài khoản'), 'u1@test.vn');
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu khôi phục' }));
    expect(await screen.findByText('Đã gửi hướng dẫn!')).toBeTruthy();
    expect(screen.getByText('u1@test.vn')).toBeTruthy();
  });

  it('vẫn báo "đã gửi" khi server lỗi (không lộ thông tin)', async () => {
    const { user } = open();
    const original = apiModule.api.post;
    apiModule.api.post = () => Promise.reject(new Error('mạng lỗi'));
    await user.type(screen.getByLabelText('Email tài khoản'), 'ai.do@test.vn');
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu khôi phục' }));
    expect(await screen.findByText('Đã gửi hướng dẫn!')).toBeTruthy();
    apiModule.api.post = original;
  });

  it('nút quay lại đăng nhập', async () => {
    const { user, location } = open();
    await user.click(screen.getByText('Quay lại trang đăng nhập'));
    expect(location()).toBe('/login');
  });
});

describe('Đặt lại mật khẩu', () => {
  it('thiếu token / email → "Liên kết không hợp lệ" và đường dẫn xin liên kết mới', async () => {
    const { user, location } = renderApp('/reset-password', { loggedIn: false });
    expect(screen.getByText('Liên kết không hợp lệ')).toBeTruthy();
    await user.click(screen.getByText('Yêu cầu liên kết mới'));
    expect(location()).toBe('/forgot-password');
  });

  const open = (token = 'good-token') => renderApp(`/reset-password?token=${token}&email=u1%40test.vn`, { loggedIn: false });

  it('hiện email đang đặt lại', () => {
    open();
    expect(screen.getByText('u1@test.vn')).toBeTruthy();
  });

  it('thành công → "Đã đặt lại mật khẩu!"', async () => {
    const { user } = open();
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'matkhaumoi');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'matkhaumoi');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
    expect(await screen.findByText('Đã đặt lại mật khẩu!')).toBeTruthy();
  });

  it('xác nhận không khớp → lỗi, không gọi server', async () => {
    const { user } = open();
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'matkhaumoi');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'khac-nhau');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Mật khẩu xác nhận không khớp.');
    expect(calls.some((c) => c.path === '/auth/reset-password')).toBe(false);
  });

  it('mật khẩu quá ngắn (bỏ qua kiểm tra của trình duyệt) → lỗi từ giao diện', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: 'abc' } });
    fireEvent.submit(screen.getByLabelText('Mật khẩu mới').closest('form')!);
    expect((await screen.findByRole('alert')).textContent).toContain('ít nhất 6 ký tự');
  });

  it('token sai / hết hạn → hiện câu báo lỗi của server', async () => {
    const { user } = open('token-sai');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'matkhaumoi');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'matkhaumoi');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
    expect((await screen.findByRole('alert')).textContent).toContain('không hợp lệ hoặc đã hết hạn');
  });
});

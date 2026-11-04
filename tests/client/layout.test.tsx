// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Test layout: LeftSidebar (đánh dấu mục đang mở), MobileNav (huy hiệu + nút đăng bài), Toast, ConfirmDialog.
// Các context được thay bằng dữ liệu giả để test từng component độc lập.

const state = vi.hoisted(() => ({
  currentUser: { id: 'u1', name: 'Trần Xuân Hoàng', username: 'xuanhoang', avatar: '/me.png' },
  notifications: [] as { id: string; isRead: boolean }[],
  friendRequests: [] as { id: string }[],
  toast: null as { message: string; type: 'success' | 'error' | 'info' } | null,
}));

vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ currentUser: state.currentUser }) }));
vi.mock('../../src/context/SocialContext', () => ({
  useSocial: () => ({ notifications: state.notifications, friendRequests: state.friendRequests, toast: state.toast }),
}));

import { LeftSidebar } from '../../src/layout/LeftSidebar';
import { MobileNav } from '../../src/layout/MobileNav';
import { Toast } from '../../src/components/Toast';
import { ConfirmDialogProvider, useConfirm } from '../../src/context/ConfirmDialogContext';

beforeEach(() => {
  state.notifications = [];
  state.friendRequests = [];
  state.toast = null;
});

const at = (path: string, ui: React.ReactElement) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
/** Tên các mục menu đang được đánh dấu "trang hiện tại". */
const currentItems = () => screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent!.replace(/\d+$/, '').trim());

describe('LeftSidebar — mục đang mở', () => {
  it.each([
    ['/', ['Bảng tin']],
    ['/profile/u1', ['Trang cá nhân']],
    ['/profile/u1?tab=photos', ['Ảnh của tôi']], // KHÔNG được sáng cả "Trang cá nhân"
    ['/friends', ['Bạn bè & Lời mời']],
    ['/notifications', ['Thông báo']],
    ['/memories', ['Kỷ niệm']],
    ['/saved', ['Đã lưu']],
    ['/settings', ['Cài đặt tài khoản']],
    ['/settings/profile', ['Cài đặt tài khoản']], // trang con của cài đặt
    ['/settings/blocked', ['Cài đặt tài khoản']],
  ])('%s → %j', (path, expected) => {
    at(path, <LeftSidebar />);
    expect(currentItems()).toEqual(expected);
  });

  it('xem trang cá nhân của NGƯỜI KHÁC → không mục nào sáng (không nhầm với "Trang cá nhân" của mình)', () => {
    at('/profile/other', <LeftSidebar />);
    expect(currentItems()).toEqual([]);
  });

  it('chỉ có đúng một mục sáng ở mọi trang', () => {
    for (const path of ['/', '/profile/u1', '/profile/u1?tab=photos', '/friends', '/settings/blocked']) {
      const { unmount } = at(path, <LeftSidebar />);
      expect(currentItems(), path).toHaveLength(1);
      unmount();
    }
  });

  it('hiện tên + @username của mình, link thẻ cá nhân tới trang cá nhân', () => {
    at('/', <LeftSidebar />);
    expect(screen.getByText('Trần Xuân Hoàng')).toBeTruthy();
    expect(screen.getByText('@xuanhoang')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Trần Xuân Hoàng/ }).getAttribute('href')).toBe('/profile/u1');
  });

  it('huy hiệu số thông báo chưa đọc và số lời mời kết bạn', () => {
    state.notifications = [{ id: 'a', isRead: false }, { id: 'b', isRead: false }, { id: 'c', isRead: true }];
    state.friendRequests = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];
    at('/', <LeftSidebar />);
    expect(within(screen.getByRole('link', { name: /Thông báo/ })).getByText('2')).toBeTruthy();
    expect(within(screen.getByRole('link', { name: /Bạn bè & Lời mời/ })).getByText('3')).toBeTruthy();
  });

  it('không có gì chưa đọc → không hiện huy hiệu', () => {
    at('/', <LeftSidebar />);
    expect(within(screen.getByRole('link', { name: /Thông báo/ })).queryByText('0')).toBeNull();
  });

  it('huy hiệu quá 99 hiện "99+"', () => {
    state.notifications = Array.from({ length: 150 }, (_, i) => ({ id: String(i), isRead: false }));
    at('/', <LeftSidebar />);
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('đủ 8 lối tắt: bảng tin, cá nhân, bạn bè, thông báo, kỷ niệm, ảnh, đã lưu, cài đặt', () => {
    at('/', <LeftSidebar />);
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/', '/profile/u1', '/friends', '/notifications', '/memories', '/profile/u1?tab=photos', '/saved', '/settings']));
  });
});

describe('MobileNav', () => {
  it('có 4 mục điều hướng + nút Đăng bài ở giữa', () => {
    at('/', <MobileNav onOpenCreatePost={() => {}} />);
    for (const name of ['Trang chủ', 'Bạn bè', 'Thông báo', 'Cá nhân', 'Đăng bài']) expect(screen.getByRole(name === 'Đăng bài' ? 'button' : 'link', { name })).toBeTruthy();
  });

  it('bấm nút Đăng bài gọi onOpenCreatePost', () => {
    const open = vi.fn();
    at('/', <MobileNav onOpenCreatePost={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'Đăng bài' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['/', 'Trang chủ'],
    ['/friends', 'Bạn bè'],
    ['/notifications', 'Thông báo'],
    ['/profile/u1', 'Cá nhân'],
  ])('%s → mục "%s" đang mở', (path, active) => {
    at(path, <MobileNav onOpenCreatePost={() => {}} />);
    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current.map((l) => l.getAttribute('aria-label'))).toEqual([active]);
  });

  it('trang cá nhân của người khác → "Cá nhân" không sáng', () => {
    at('/profile/other', <MobileNav onOpenCreatePost={() => {}} />);
    expect(screen.getAllByRole('link').some((l) => l.getAttribute('aria-current') === 'page')).toBe(false);
  });

  it('huy hiệu: thông báo chưa đọc và lời mời kết bạn', () => {
    state.notifications = [{ id: 'a', isRead: false }, { id: 'b', isRead: true }];
    state.friendRequests = [{ id: 'r1' }, { id: 'r2' }];
    at('/', <MobileNav onOpenCreatePost={() => {}} />);
    expect(within(screen.getByRole('link', { name: 'Thông báo' })).getByText('1')).toBeTruthy();
    expect(within(screen.getByRole('link', { name: 'Bạn bè' })).getByText('2')).toBeTruthy();
  });
});

describe('Toast', () => {
  it('không có toast → không hiện gì', () => {
    const { container } = render(<Toast />);
    expect(container.firstChild).toBeNull();
  });

  it('thành công / thông tin → role="status"', () => {
    state.toast = { message: 'Đã đăng bài viết!', type: 'success' };
    render(<Toast />);
    expect(screen.getByRole('status').textContent).toBe('Đã đăng bài viết!');
  });

  it('lỗi → role="alert" để trình đọc màn hình đọc ngay', () => {
    state.toast = { message: 'Không thể đăng bài', type: 'error' };
    render(<Toast />);
    expect(screen.getByRole('alert').textContent).toBe('Không thể đăng bài');
  });

  it('nội dung rất dài không làm vỡ bố cục (có break-words)', () => {
    state.toast = { message: 'x'.repeat(500), type: 'info' };
    render(<Toast />);
    expect(screen.getByText('x'.repeat(500)).className).toContain('break-words');
  });

  it('toast không chặn chuột vào nội dung bên dưới', () => {
    state.toast = { message: 'hi', type: 'info' };
    render(<Toast />);
    expect(screen.getByRole('status').className).toContain('pointer-events-none');
  });
});

describe('ConfirmDialog', () => {
  const results: boolean[] = [];
  function Asker({ message = 'Xoá bài viết này?' }: { message?: string }) {
    const confirm = useConfirm();
    return <button onClick={async () => results.push(await confirm(message))}>hỏi</button>;
  }
  const open = (message?: string) => {
    results.length = 0;
    render(<ConfirmDialogProvider><Asker message={message} /></ConfirmDialogProvider>);
    fireEvent.click(screen.getByText('hỏi'));
  };

  it('chưa gọi confirm → không có hộp thoại', () => {
    render(<ConfirmDialogProvider><Asker /></ConfirmDialogProvider>);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('hiện đúng câu hỏi', () => {
    open('Bạn có chắc muốn xoá?');
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Bạn có chắc muốn xoá?')).toBeTruthy();
  });

  it('bấm "Đồng ý" → trả true và đóng hộp thoại', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý' }));
    await waitFor(() => expect(results).toEqual([true]));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('bấm "Hủy" → trả false', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(results).toEqual([false]));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('nhấn Esc → hủy (false)', async () => {
    open();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Đồng ý' }), { key: 'Escape' });
    await waitFor(() => expect(results).toEqual([false]));
  });

  it('bấm ra ngoài hộp thoại (nền mờ) → hủy; bấm bên trong hộp thì KHÔNG đóng', async () => {
    open();
    fireEvent.click(screen.getByText('Xoá bài viết này?'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(results).toEqual([]);
    fireEvent.click(screen.getByRole('alertdialog').parentElement!);
    await waitFor(() => expect(results).toEqual([false]));
  });

  it('nút "Đồng ý" được focus sẵn (nhấn Enter là xác nhận)', () => {
    open();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Đồng ý' }));
  });

  it('hỏi lần 2 sau khi đã đóng vẫn hoạt động', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(results).toEqual([false]));
    fireEvent.click(screen.getByText('hỏi'));
    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý' }));
    await waitFor(() => expect(results).toEqual([false, true]));
  });
});

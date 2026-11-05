// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { render, fireEvent } from '@testing-library/react';
import { installBrowserStubs, renderApp, feedLoaded, screen, waitFor, within } from './harness';
import { db, apiModule } from './fakeServer';
import { Skeleton, PostSkeleton, ListSkeleton, ErrorState } from '../../src/components/ui';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';

// Khung xương khi tải, màn hình lỗi có "Thử lại", và ErrorBoundary chặn lỗi không lường trước.

beforeEach(() => installBrowserStubs());
afterEach(() => vi.restoreAllMocks());

/** Làm một request GET treo cho tới khi gọi release(). */
const holdGet = (match: (path: string) => boolean) => {
  const original = apiModule.api.get;
  let release!: () => void;
  apiModule.api.get = (p: string) => (match(p) ? new Promise((resolve) => (release = () => resolve(original(p)))) : original(p));
  return { release: () => release(), restore: () => void (apiModule.api.get = original) };
};

describe('Skeleton / PostSkeleton / ListSkeleton', () => {
  it('Skeleton ẩn với trình đọc màn hình và nhận className', () => {
    const { container } = render(<Skeleton className="h-3 w-20" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toContain('animate-pulse');
    expect(el.className).toContain('h-3 w-20');
  });

  it.each([1, 3, 5])('PostSkeleton count=%i → %i thẻ giả', (n) => {
    const { container } = render(<PostSkeleton count={n} />);
    expect(container.querySelectorAll('.card')).toHaveLength(n);
    expect(screen.getByRole('status', { name: 'Đang tải bài viết' })).toBeTruthy();
  });

  it('PostSkeleton mặc định 3 thẻ', () => {
    const { container } = render(<PostSkeleton />);
    expect(container.querySelectorAll('.card')).toHaveLength(3);
  });

  it.each([2, 5, 8])('ListSkeleton count=%i → %i dòng giả', (n) => {
    const { container } = render(<ListSkeleton count={n} />);
    expect(container.querySelectorAll('.p-4')).toHaveLength(n);
  });

  it('ListSkeleton mặc định 5 dòng, có role="status"', () => {
    const { container } = render(<ListSkeleton />);
    expect(container.querySelectorAll('.p-4')).toHaveLength(5);
    expect(screen.getByRole('status', { name: 'Đang tải danh sách' })).toBeTruthy();
  });
});

describe('ErrorState', () => {
  it('mặc định có tiêu đề + mô tả; không có nút nếu không truyền onRetry', () => {
    render(<ErrorState />);
    expect(screen.getByRole('alert').textContent).toContain('Không tải được dữ liệu');
    expect(screen.getByText(/Có thể mạng đang chập chờn/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('tuỳ biến tiêu đề / mô tả; "Thử lại" gọi onRetry', () => {
    const retry = vi.fn();
    render(<ErrorState title="Hỏng rồi" description="Chi tiết lỗi" onRetry={retry} />);
    expect(screen.getByText('Hỏng rồi')).toBeTruthy();
    expect(screen.getByText('Chi tiết lỗi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('Trang Thông báo', () => {
  it('đang tải → khung xương, chưa hiện "Chưa có thông báo"; xong thì hiện danh sách', async () => {
    const hold = holdGet((p) => p.startsWith('/notifications'));
    renderApp('/notifications', { seed: () => void (db.notifications = []) });
    expect(await screen.findByRole('status', { name: 'Đang tải danh sách' })).toBeTruthy();
    expect(screen.queryByText('Chưa có thông báo nào')).toBeNull();
    hold.release();
    expect(await screen.findByText('Chưa có thông báo nào')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Đang tải danh sách' })).toBeNull();
    hold.restore();
  });

  it('tải lỗi → màn hình lỗi; "Thử lại" tải được', async () => {
    const { user } = renderApp('/notifications', { seed: () => void db.failNext.add('GET /notifications') });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không tải được thông báo');
    expect(screen.queryByText('Chưa có thông báo nào')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText(/đã thả cảm xúc về bài viết của bạn/)).toBeTruthy();
    expect(screen.queryByText('Không tải được thông báo')).toBeNull();
  });

  it('thử lại vẫn lỗi → ở lại màn hình lỗi', async () => {
    const { user } = renderApp('/notifications', { seed: () => void db.failNext.add('GET /notifications') });
    await screen.findByRole('alert');
    db.failNext.add('GET /notifications');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Không tải được thông báo'));
  });
});

describe('Trang Bạn bè', () => {
  it('đang tải → khung xương và chưa hiện nội dung tab', async () => {
    const hold = holdGet((p) => p === '/friends');
    renderApp('/friends');
    expect(await screen.findByRole('status', { name: 'Đang tải danh sách' })).toBeTruthy();
    expect(screen.queryByText('Chưa có bạn bè nào')).toBeNull();
    expect(screen.queryByText('Bạn Một', { selector: 'b' })).toBeNull();
    hold.release();
    expect(await screen.findByText('Bạn Một', { selector: 'b' })).toBeTruthy();
    hold.restore();
  });

  it('tải lỗi → màn hình lỗi, "Thử lại" tải lại cả bạn bè lẫn lời mời', async () => {
    const { user } = renderApp('/friends', { seed: () => void db.failNext.add('GET /friends') });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không tải được danh sách bạn bè');
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('2 bạn bè · 1 lời mời')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lời mời tải lỗi (dù danh sách bạn ổn) cũng coi là lỗi để người dùng thử lại', async () => {
    renderApp('/friends', { seed: () => void db.failNext.add('GET /friends/requests') });
    expect((await screen.findByRole('alert')).textContent).toContain('Không tải được danh sách bạn bè');
  });

  it('tab Gợi ý không phụ thuộc trạng thái tải bạn bè', async () => {
    const hold = holdGet((p) => p === '/friends');
    const { user } = renderApp('/friends');
    await screen.findByRole('status', { name: 'Đang tải danh sách' });
    await user.click(screen.getByRole('button', { name: /Gợi ý/ }));
    expect(await screen.findByText('Người Lạ')).toBeTruthy();
    hold.release();
    hold.restore();
  });
});

describe('ErrorBoundary', () => {
  const Bomb: React.FC<{ explode: boolean }> = ({ explode }) => {
    if (explode) throw new Error('nổ rồi');
    return <p>nội dung bình thường</p>;
  };

  it('không lỗi → hiển thị con bình thường', () => {
    render(<ErrorBoundary><Bomb explode={false} /></ErrorBoundary>);
    expect(screen.getByText('nội dung bình thường')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('con ném lỗi → màn hình xin lỗi thân thiện + ghi log, không trắng màn hình', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Bomb explode /></ErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toContain('Rất tiếc, đã có lỗi xảy ra');
    expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về trang chủ' }).getAttribute('href')).toBe('/');
    expect(log).toHaveBeenCalledWith('Lỗi giao diện:', expect.any(Error));
  });

  it('"Tải lại trang" gọi window.location.reload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<ErrorBoundary><Bomb explode /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại trang' }));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('đổi resetKey (sang trang khác) thì tự thoát khỏi trạng thái lỗi', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Harness: React.FC = () => {
      const [page, setPage] = useState('a');
      return (
        <>
          <button onClick={() => setPage('b')}>sang trang b</button>
          <ErrorBoundary resetKey={page}><Bomb explode={page === 'a'} /></ErrorBoundary>
        </>
      );
    };
    render(<Harness />);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByText('sang trang b'));
    expect(screen.getByText('nội dung bình thường')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('đổi resetKey khi KHÔNG lỗi thì không ảnh hưởng', () => {
    const { rerender } = render(<ErrorBoundary resetKey="a"><Bomb explode={false} /></ErrorBoundary>);
    rerender(<ErrorBoundary resetKey="b"><Bomb explode={false} /></ErrorBoundary>);
    expect(screen.getByText('nội dung bình thường')).toBeTruthy();
  });

  it('trong ứng dụng: một trang lỗi → thanh điều hướng vẫn còn, bấm sang trang khác hết lỗi', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Dữ liệu hỏng (reactions = null) làm PostCard ném lỗi khi vẽ bảng tin
    const { user, location } = renderApp('/', { seed: () => void ((db.posts[0] as { reactions: unknown }).reactions = null) });
    expect((await screen.findByRole('alert')).textContent).toContain('Rất tiếc, đã có lỗi xảy ra');
    expect(screen.getByRole('banner')).toBeTruthy(); // Navbar vẫn hiển thị
    await user.click(screen.getAllByRole('link', { name: /Bạn bè/ })[0]);
    expect(location()).toBe('/friends');
    expect(await screen.findByText('2 bạn bè · 1 lời mời')).toBeTruthy();
    expect(screen.queryByText('Rất tiếc, đã có lỗi xảy ra')).toBeNull();
    void feedLoaded;
  });
});

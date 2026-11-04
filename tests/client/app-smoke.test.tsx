// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, screen, waitFor } from './harness';

beforeEach(() => installBrowserStubs());

describe('Khởi động ứng dụng', () => {
  it('đã đăng nhập → vào bảng tin và thấy bài viết', async () => {
    renderApp('/');
    expect(await feedLoaded()).toBeTruthy();
    expect(screen.getByText('Bài của tôi')).toBeTruthy();
  });

  it('chưa đăng nhập → bị chuyển về /login', async () => {
    const { location } = renderApp('/', { loggedIn: false });
    await waitFor(() => expect(location()).toBe('/login'));
    expect(screen.getByText('Đăng nhập tài khoản')).toBeTruthy();
  });

  it('đường dẫn lạ → chuyển về bảng tin', async () => {
    const { location } = renderApp('/khong-ton-tai');
    await feedLoaded();
    expect(location()).toBe('/');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, screen, waitFor, within, act } from './harness';
import { db, calls, serverEmit } from './fakeServer';
import type { AdminUser } from '../../src/types';

// Khu quản trị hệ thống (/admin): quyền vào, bố cục, tổng quan, người dùng, bài viết, bình luận, nhóm & trang, báo cáo, thông báo hệ thống, nhật ký.
// Dữ liệu mặc định xem tests/client/fakeAdmin.ts (u1 = tôi, quản trị viên).

beforeEach(() => installBrowserStubs());

type Ctx = ReturnType<typeof renderApp>['user'];
const asAdmin = () => void (db.me = { ...db.me, role: 'admin' });
const openAdmin = (path = '/admin', extraSeed?: () => void) =>
  renderApp(path, {
    seed: () => {
      asAdmin();
      extraSeed?.();
    },
  });
const confirmDialog = async (user: Ctx, button = 'Đồng ý') => user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: button }));
const rowOf = async (text: string) => within((await screen.findByText(text)).closest('tr') as HTMLElement);
const apiCalls = (method: string, prefix: string) => calls.filter((c) => c.method === method && c.path.startsWith(prefix));

describe('Quyền vào khu quản trị', () => {
  it('người dùng thường vào /admin → bị đưa về bảng tin', async () => {
    const { location } = renderApp('/admin');
    await waitFor(() => expect(location()).toBe('/'));
  });

  it('chưa đăng nhập → về trang đăng nhập', async () => {
    const { location } = renderApp('/admin/users', { loggedIn: false });
    await waitFor(() => expect(location()).toBe('/login'));
  });

  it('quản trị viên vào được; menu tài khoản và sidebar có lối vào, người thường thì không', async () => {
    const { user } = renderApp('/', { seed: asAdmin });
    await user.click(await screen.findByRole('button', { name: 'Tài khoản' }));
    expect(screen.getAllByRole('link', { name: /Quản trị hệ thống/ }).length).toBe(2); // menu tài khoản + sidebar trái
  });

  it('người thường không thấy lối vào quản trị', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Tài khoản' }));
    expect(screen.queryByRole('link', { name: /Quản trị hệ thống/ })).toBeNull();
  });

  it('quyền bị thu hồi lúc đang xem → bị đưa ra khỏi /admin ngay', async () => {
    const { location } = openAdmin('/admin');
    await screen.findByRole('heading', { name: 'Tổng quan hệ thống' });
    db.me = { ...db.me, role: 'user' };
    await act(async () => serverEmit('account:role', { role: 'user' }));
    await waitFor(() => expect(location()).toBe('/'));
  });
});

describe('Bố cục khu quản trị', () => {
  it('có đủ mục menu; mục đang xem được đánh dấu; "Về mạng xã hội" quay lại bảng tin', async () => {
    const { user, location } = openAdmin('/admin/users');
    const nav = await screen.findByRole('navigation', { name: 'Menu quản trị' });
    for (const name of ['Tổng quan', 'Người dùng', 'Bài viết & Reels', 'Bình luận', 'Nhóm & Trang', /Báo cáo vi phạm/, 'Thông báo hệ thống', 'Nhật ký quản trị']) {
      expect(within(nav).getByRole('link', { name })).toBeTruthy();
    }
    expect(within(nav).getByRole('link', { name: 'Người dùng' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Tổng quan' }).getAttribute('aria-current')).toBeNull();
    await user.click(screen.getByRole('link', { name: /Về mạng xã hội/ }));
    await waitFor(() => expect(location()).toBe('/'));
  });

  it('chuyển trang bằng menu', async () => {
    const { user, location } = openAdmin('/admin');
    await user.click(await screen.findByRole('link', { name: 'Nhật ký quản trị' }));
    await waitFor(() => expect(location()).toBe('/admin/audit'));
  });

  it('huy hiệu báo cáo chờ xử lý: đúng số, cập nhật realtime khi có báo cáo mới / báo cáo được xử lý', async () => {
    openAdmin('/admin/users');
    const link = await screen.findByRole('link', { name: /Báo cáo vi phạm/ });
    await waitFor(() => expect(link.textContent).toContain('2'));
    db.admin.reports.forEach((r) => (r.status = 'resolved'));
    await act(async () => serverEmit('report:update', {}));
    await waitFor(() => expect(screen.getByRole('link', { name: /Báo cáo vi phạm/ }).textContent).not.toMatch(/\d/));
    db.admin.reports[0].status = 'pending';
    await act(async () => serverEmit('report:new', {}));
    await waitFor(() => expect(screen.getByRole('link', { name: /Báo cáo vi phạm/ }).textContent).toContain('1'));
  });

  it('nút đổi giao diện sáng / tối', async () => {
    const { user } = openAdmin('/admin');
    await user.click(await screen.findByRole('button', { name: /Chế độ (tối|sáng)/ }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Chế độ sáng' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('Tổng quan', () => {
  it('hiện số liệu, báo cáo chờ xử lý và nhật ký gần đây', async () => {
    openAdmin('/admin');
    expect((await screen.findByTestId('stat-users')).textContent).toBe('5');
    const expected = { online: '2', newToday: '1', banned: '1', admins: '2', posts: '3', reels: '1', comments: '2', groups: '1', pages: '1' };
    for (const [key, value] of Object.entries(expected)) expect(screen.getByTestId(`stat-${key}`).textContent, key).toBe(value);
    expect(screen.getByText('Bài thường của bạn một')).toBeTruthy(); // báo cáo chờ
    expect(screen.getByText('Kẻ Phá Hoại')).toBeTruthy();
    expect(screen.getByText(/Khoá tài khoản/)).toBeTruthy(); // nhật ký
    expect(screen.getByText(/Lý do: Spam liên tục/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem tất cả báo cáo' }).getAttribute('href')).toBe('/admin/reports');
    expect(screen.getByRole('link', { name: 'Xem toàn bộ nhật ký' }).getAttribute('href')).toBe('/admin/audit');
  });

  it('không có báo cáo / nhật ký → lời nhắn trống', async () => {
    openAdmin('/admin', () => {
      db.admin.reports = [];
      db.admin.logs = [];
    });
    expect(await screen.findByText(/Không có báo cáo nào đang chờ/)).toBeTruthy();
    expect(screen.getByText('Chưa có hoạt động nào.')).toBeTruthy();
  });

  it('tải lỗi → màn hình lỗi, "Thử lại" tải lại được', async () => {
    const { user } = openAdmin('/admin', () => void db.failNext.add('GET /admin/stats'));
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect((await screen.findByTestId('stat-users')).textContent).toBe('5');
  });

  it('bấm thẻ số liệu → sang trang tương ứng', async () => {
    const { user, location } = openAdmin('/admin');
    await user.click(await screen.findByRole('link', { name: /Bình luận/, description: undefined }).catch(() => screen.getByText('Bình luận', { selector: 'div' })));
    await waitFor(() => expect(location()).toBe('/admin/comments'));
  });
});

describe('Người dùng', () => {
  it('liệt kê tài khoản kèm email, vai trò, trạng thái, lý do khoá; dòng của mình không có nút thao tác', async () => {
    openAdmin('/admin/users');
    const banned = await rowOf('Kẻ Phá Hoại');
    expect(banned.getByText('Bị khoá')).toBeTruthy();
    expect(banned.getByText('Spam liên tục')).toBeTruthy();
    expect(banned.getByText('b1@test.vn')).toBeTruthy();
    expect(banned.getByRole('button', { name: /Mở khoá/ })).toBeTruthy();
    expect(banned.queryByRole('button', { name: /^Khoá/ })).toBeNull();
    const me = await rowOf('Trần Xuân Hoàng');
    expect(me.getByText('Tài khoản của bạn')).toBeTruthy();
    expect(me.queryByRole('button')).toBeNull();
    const normal = await rowOf('Bạn Một');
    expect(normal.getByText('Online')).toBeTruthy();
    expect((await rowOf('Người Lạ')).getByText('Offline')).toBeTruthy();
    expect(screen.getByText('Hiển thị 5 / 5')).toBeTruthy();
  });

  it('tìm kiếm (chờ người dùng gõ xong) và các bộ lọc', async () => {
    const { user } = openAdmin('/admin/users');
    await screen.findByText('Kẻ Phá Hoại');
    await user.type(screen.getByRole('searchbox'), 'Lạ');
    await waitFor(() => expect(screen.queryByText('Kẻ Phá Hoại')).toBeNull());
    expect(screen.getByText('Người Lạ')).toBeTruthy();
    expect(apiCalls('GET', '/admin/users?').some((c) => c.path.includes('q=L%E1%BA%A1'))).toBe(true);
    await user.clear(screen.getByRole('searchbox'));
    await screen.findByText('Kẻ Phá Hoại');

    await user.click(screen.getByRole('button', { name: 'Bị khoá' }));
    await waitFor(() => expect(screen.queryByText('Bạn Một')).toBeNull());
    expect(screen.getByText('Kẻ Phá Hoại')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Quản trị viên' }));
    expect(await screen.findByText('Admin Hai')).toBeTruthy();
    expect(screen.queryByText('Người Lạ')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Người dùng' }));
    await waitFor(() => expect(screen.queryByText('Admin Hai')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Đang online' }));
    await waitFor(() => expect(screen.queryByText('Người Lạ')).toBeNull());
    expect(screen.getByText('Bạn Một')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tất cả' }));
    expect(await screen.findByText('Người Lạ')).toBeTruthy();
  });

  it('không có kết quả → màn hình trống', async () => {
    const { user } = openAdmin('/admin/users');
    await screen.findByText('Kẻ Phá Hoại');
    await user.type(screen.getByRole('searchbox'), 'khongcoai');
    expect(await screen.findByText('Không tìm thấy người dùng')).toBeTruthy();
  });

  it('khoá tài khoản: mở hộp thoại, nhập lý do, xác nhận → gửi lý do, dòng chuyển sang "Bị khoá"', async () => {
    const { user } = openAdmin('/admin/users');
    await user.click((await rowOf('Người Lạ')).getByRole('button', { name: /^Khoá/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Khoá tài khoản Người Lạ' });
    await user.type(within(dialog).getByRole('textbox'), '  Phát tán tin giả  ');
    await user.click(within(dialog).getByRole('button', { name: 'Khoá tài khoản' }));
    expect(await screen.findByText('Đã khoá tài khoản Người Lạ')).toBeTruthy();
    expect(apiCalls('PATCH', '/admin/users/s1/ban')[0].body).toEqual({ banned: true, reason: 'Phát tán tin giả' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await rowOf('Người Lạ')).getByText('Phát tán tin giả')).toBeTruthy();
  });

  it('khoá rồi bấm Hủy → không gọi API', async () => {
    const { user } = openAdmin('/admin/users');
    await user.click((await rowOf('Người Lạ')).getByRole('button', { name: /^Khoá/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(apiCalls('PATCH', '/admin/users')).toHaveLength(0);
  });

  it('quản trị viên khác không có nút Khoá (phải thu hồi quyền trước)', async () => {
    openAdmin('/admin/users');
    const admin2 = await rowOf('Admin Hai');
    expect(admin2.queryByRole('button', { name: /^Khoá/ })).toBeNull();
    expect(admin2.getByRole('button', { name: /Thu hồi quyền/ })).toBeTruthy();
  });

  it('mở khoá: xác nhận → tài khoản trở lại bình thường', async () => {
    const { user } = openAdmin('/admin/users');
    await user.click((await rowOf('Kẻ Phá Hoại')).getByRole('button', { name: /Mở khoá/ }));
    await confirmDialog(user);
    expect(await screen.findByText('Đã mở khoá Kẻ Phá Hoại')).toBeTruthy();
    expect(db.admin.users.find((u) => u.id === 'b1')?.banned).toBe(false);
    expect((await rowOf('Kẻ Phá Hoại')).queryByText('Bị khoá')).toBeNull();
  });

  it('cấp quyền quản trị cho người thường, thu hồi của quản trị viên khác (đều phải xác nhận)', async () => {
    const { user } = openAdmin('/admin/users');
    await user.click((await rowOf('Người Lạ')).getByRole('button', { name: /Cấp quyền/ }));
    await confirmDialog(user);
    expect(await screen.findByText('Người Lạ đã là quản trị viên')).toBeTruthy();
    expect(apiCalls('PATCH', '/admin/users/s1/role')[0].body).toEqual({ role: 'admin' });
    expect((await rowOf('Người Lạ')).getByText('Quản trị viên')).toBeTruthy();

    await user.click((await rowOf('Admin Hai')).getByRole('button', { name: /Thu hồi quyền/ }));
    await confirmDialog(user);
    expect(await screen.findByText('Đã thu hồi quyền của Admin Hai')).toBeTruthy();
    expect(apiCalls('PATCH', '/admin/users/a2/role')[0].body).toEqual({ role: 'user' });
  });

  it('từ chối xác nhận → không đổi gì; tài khoản bị khoá không có nút "Cấp quyền"', async () => {
    const { user } = openAdmin('/admin/users');
    await user.click((await rowOf('Người Lạ')).getByRole('button', { name: /Cấp quyền/ }));
    await confirmDialog(user, 'Hủy');
    expect(apiCalls('PATCH', '/admin/users')).toHaveLength(0);
    expect((await rowOf('Kẻ Phá Hoại')).queryByRole('button', { name: /Cấp quyền/ })).toBeNull();
  });

  it('server báo lỗi khi thao tác → toast đỏ, dữ liệu giữ nguyên', async () => {
    const { user } = openAdmin('/admin/users', () => void db.failNext.add('PATCH /admin/users/s1/role'));
    await user.click((await rowOf('Người Lạ')).getByRole('button', { name: /Cấp quyền/ }));
    await confirmDialog(user);
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect((await rowOf('Người Lạ')).queryByText('Quản trị viên')).toBeNull();
  });

  it('phân trang: 30 dòng đầu, "Xem thêm" nối thêm phần còn lại', async () => {
    const { user } = openAdmin('/admin/users', () => {
      const extra: AdminUser[] = Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, name: `Thành viên ${i}`, username: `tv${i}`, email: `tv${i}@test.vn`, role: 'user', banned: false, isOnline: false }));
      db.admin.users.push(...extra);
    });
    expect(await screen.findByText('Hiển thị 30 / 45')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Xem thêm/ }));
    expect(await screen.findByText('Hiển thị 45 / 45')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Xem thêm/ })).toBeNull();
  });

  it('"Xem thêm" bị lỗi → giữ nguyên danh sách, bấm lại được', async () => {
    const { user } = openAdmin('/admin/users', () => {
      db.admin.users.push(...Array.from({ length: 35 }, (_, i) => ({ id: `x${i}`, name: `Thành viên ${i}`, username: `tv${i}`, email: `tv${i}@test.vn`, role: 'user' as const, banned: false, isOnline: false })));
    });
    await screen.findByText('Hiển thị 30 / 40');
    db.failNext.add('GET /admin/users');
    await user.click(screen.getByRole('button', { name: /Xem thêm/ }));
    await waitFor(() => expect(db.failNext.size).toBe(0));
    expect(screen.getByText('Hiển thị 30 / 40')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Xem thêm/ }));
    expect(await screen.findByText('Hiển thị 40 / 40')).toBeTruthy();
  });

  it('tải lỗi → màn hình lỗi, "Thử lại" tải lại', async () => {
    const { user } = openAdmin('/admin/users', () => void db.failNext.add('GET /admin/users'));
    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Kẻ Phá Hoại')).toBeTruthy();
  });
});

describe('Bài viết & Reels', () => {
  it('liệt kê kèm tác giả, loại, nơi đăng, số tương tác', async () => {
    openAdmin('/admin/posts');
    const normal = await rowOf('Bài thường của bạn một');
    expect(normal.getByText('Bạn Một')).toBeTruthy();
    expect(normal.getByText('2 tệp')).toBeTruthy();
    expect(normal.getByText('3 cảm xúc · 1 bình luận')).toBeTruthy();
    expect((await rowOf('Chia sẻ trong nhóm')).getByText('Nhóm Công Khai')).toBeTruthy();
    expect((await rowOf('Chia sẻ của trang')).getByText('Trang Công Nghệ')).toBeTruthy();
    expect((await rowOf('Reel của người lạ')).getByText('Reel')).toBeTruthy();
  });

  it('bài chỉ có ảnh (không chữ) và bài nhóm đang chờ duyệt hiển thị đúng', async () => {
    openAdmin('/admin/posts', () => {
      db.admin.posts[0].content = '';
      db.admin.posts[2].groupStatus = 'pending';
    });
    expect(await screen.findByText('(không có chữ)')).toBeTruthy();
    expect(screen.getByText('Đang chờ duyệt')).toBeTruthy();
  });

  it('lọc theo loại và tìm theo tác giả', async () => {
    const { user } = openAdmin('/admin/posts');
    await screen.findByText('Bài thường của bạn một');
    await user.click(screen.getByRole('button', { name: 'Reels' }));
    await waitFor(() => expect(screen.queryByText('Bài thường của bạn một')).toBeNull());
    expect(screen.getByText('Reel của người lạ')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Trong nhóm' }));
    expect(await screen.findByText('Chia sẻ trong nhóm')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Của trang' }));
    expect(await screen.findByText('Chia sẻ của trang')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Bài viết' }));
    await screen.findByText('Bài thường của bạn một');
    await user.type(screen.getByRole('searchbox'), 'Người Lạ');
    await waitFor(() => expect(screen.queryByText('Bài thường của bạn một')).toBeNull());
  });

  it('gỡ bài: phải xác nhận; đồng ý → bài biến mất; Hủy → còn nguyên', async () => {
    const { user } = openAdmin('/admin/posts');
    await user.click((await rowOf('Bài thường của bạn một')).getByRole('button', { name: /Gỡ/ }));
    await confirmDialog(user, 'Hủy');
    expect(apiCalls('DELETE', '/admin/posts')).toHaveLength(0);
    await user.click((await rowOf('Bài thường của bạn một')).getByRole('button', { name: /Gỡ/ }));
    await confirmDialog(user);
    expect(await screen.findByText('Đã gỡ nội dung')).toBeTruthy();
    expect(apiCalls('DELETE', '/admin/posts/ap1')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText('Bài thường của bạn một')).toBeNull());
  });

  it('không có bài nào → màn hình trống', async () => {
    openAdmin('/admin/posts', () => void (db.admin.posts = []));
    expect(await screen.findByText('Không có bài viết nào')).toBeTruthy();
  });
});

describe('Bình luận', () => {
  it('liệt kê kèm người viết, bài gốc; câu trả lời có dấu hiệu riêng', async () => {
    openAdmin('/admin/comments');
    const row = await rowOf('Bình luận vi phạm');
    expect(row.getByText('Người Lạ')).toBeTruthy();
    expect(row.getByText('Bài thường của bạn một')).toBeTruthy();
    expect(row.queryByLabelText('Trả lời')).toBeNull();
    expect((await rowOf('Một câu trả lời')).getByLabelText('Trả lời')).toBeTruthy();
  });

  it('bình luận của bài đã bị xoá (không còn trích đoạn) vẫn hiển thị', async () => {
    openAdmin('/admin/comments', () => void (db.admin.comments[0].postExcerpt = ''));
    expect(await screen.findByText('(bài không có chữ hoặc đã bị xoá)')).toBeTruthy();
  });

  it('tìm theo người viết; gỡ bình luận cần xác nhận', async () => {
    const { user } = openAdmin('/admin/comments');
    await screen.findByText('Bình luận vi phạm');
    await user.type(screen.getByRole('searchbox'), 'Bạn Một');
    await waitFor(() => expect(screen.queryByText('Bình luận vi phạm')).toBeNull());
    await user.clear(screen.getByRole('searchbox'));
    await user.click((await rowOf('Bình luận vi phạm')).getByRole('button', { name: /Gỡ/ }));
    await confirmDialog(user);
    expect(await screen.findByText('Đã gỡ bình luận')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Bình luận vi phạm')).toBeNull());
    expect(screen.getByText('Một câu trả lời')).toBeTruthy();
  });

  it('không có bình luận → màn hình trống', async () => {
    openAdmin('/admin/comments', () => void (db.admin.comments = []));
    expect(await screen.findByText('Không có bình luận nào')).toBeTruthy();
  });
});

describe('Nhóm & Trang', () => {
  it('tab Nhóm: thông tin nhóm, tìm kiếm, gỡ nhóm cần xác nhận', async () => {
    const { user } = openAdmin('/admin/groups');
    const row = await rowOf('Nhóm Công Khai');
    expect(row.getByText('Công khai')).toBeTruthy();
    expect(row.getByText('Trần Xuân Hoàng')).toBeTruthy();
    expect(row.getByText('3')).toBeTruthy();
    await user.type(screen.getByRole('searchbox'), 'không có');
    expect(await screen.findByText('Không có nhóm nào')).toBeTruthy();
    await user.clear(screen.getByRole('searchbox'));
    await user.click((await rowOf('Nhóm Công Khai')).getByRole('button', { name: /Gỡ nhóm/ }));
    await confirmDialog(user, 'Hủy');
    expect(apiCalls('DELETE', '/admin/groups')).toHaveLength(0);
    await user.click((await rowOf('Nhóm Công Khai')).getByRole('button', { name: /Gỡ nhóm/ }));
    await confirmDialog(user);
    expect(await screen.findByText('Đã gỡ nhóm')).toBeTruthy();
    expect(await screen.findByText('Không có nhóm nào')).toBeTruthy();
  });

  it('nhóm riêng tư hiện nhãn "Riêng tư"', async () => {
    openAdmin('/admin/groups', () => void (db.admin.groups[0].privacy = 'private'));
    expect((await rowOf('Nhóm Công Khai')).getByText('Riêng tư')).toBeTruthy();
  });

  it('tab Trang: thông tin trang, tìm kiếm, gỡ trang', async () => {
    const { user } = openAdmin('/admin/groups');
    await user.click(await screen.findByRole('button', { name: 'Trang' }));
    const row = await rowOf('Trang Công Nghệ');
    expect(row.getByText('Doanh nghiệp')).toBeTruthy();
    expect(row.getByText('Bạn Một')).toBeTruthy();
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(await screen.findByText('Không có trang nào')).toBeTruthy();
    await user.clear(screen.getByRole('searchbox'));
    await user.click((await rowOf('Trang Công Nghệ')).getByRole('button', { name: /Gỡ trang/ }));
    await confirmDialog(user);
    expect(await screen.findByText('Đã gỡ trang')).toBeTruthy();
    expect(apiCalls('DELETE', '/admin/pages/apg1')).toHaveLength(1);
  });
});

describe('Báo cáo vi phạm', () => {
  const articles = () => screen.findAllByRole('article');

  it('mặc định hiện báo cáo chờ xử lý, có lý do, mô tả, người báo cáo và liên kết tới nội dung', async () => {
    openAdmin('/admin/reports');
    expect(await articles()).toHaveLength(2);
    const post = within(screen.getByRole('article', { name: /Bài thường của bạn một/ }));
    expect(post.getByText('Spam / quảng cáo')).toBeTruthy();
    expect(post.getByText('“Quảng cáo lặp đi lặp lại”')).toBeTruthy();
    expect(post.getByText('Bạn Một')).toBeTruthy();
    expect(post.getByRole('link', { name: /Xem nội dung/ }).getAttribute('href')).toBe('/post/ap1');
    const user = within(screen.getByRole('article', { name: /Kẻ Phá Hoại/ }));
    expect(user.getByRole('link', { name: /Xem nội dung/ }).getAttribute('href')).toBe('/profile/b1');
    expect(user.queryByRole('button', { name: /Gỡ nội dung/ })).toBeNull(); // báo cáo người dùng: dùng khoá tài khoản
    expect(user.getByRole('link', { name: /Mở trang người dùng để khoá/ }).getAttribute('href')).toBe('/admin/users');
  });

  it('bộ lọc trạng thái: đã xử lý (người xử lý + ghi chú), tất cả; bình luận không có liên kết xem', async () => {
    const { user } = openAdmin('/admin/reports');
    await articles();
    await user.click(screen.getByRole('button', { name: 'Đã xử lý' }));
    const done = within(await screen.findByRole('article', { name: /Bình luận cũ/ }));
    expect(done.getByText('Đã xử lý')).toBeTruthy();
    expect(done.getByText(/Trần Xuân Hoàng/)).toBeTruthy();
    expect(done.getByText(/Đã nhắc nhở/)).toBeTruthy();
    expect(done.queryByRole('link', { name: /Xem nội dung/ })).toBeNull();
    expect(done.queryByRole('button', { name: 'Xác nhận' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Tất cả' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: 'Đã bỏ qua' }));
    expect(await screen.findByText('Không có báo cáo phù hợp')).toBeTruthy();
  });

  it('tìm kiếm trong báo cáo', async () => {
    const { user } = openAdmin('/admin/reports');
    await articles();
    await user.type(screen.getByRole('searchbox'), 'Quảng cáo');
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
  });

  it('"Gỡ nội dung": nhập ghi chú, xác nhận → nội dung bị xoá, báo cáo chuyển sang đã xử lý', async () => {
    const { user } = openAdmin('/admin/reports');
    await user.click(within(await screen.findByRole('article', { name: /Bài thường của bạn một/ })).getByRole('button', { name: /Gỡ nội dung/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Gỡ nội dung vi phạm' });
    await user.type(within(dialog).getByRole('textbox'), 'Spam rõ ràng');
    await user.click(within(dialog).getByRole('button', { name: 'Gỡ nội dung' }));
    expect(await screen.findByText('Đã gỡ nội dung và xử lý báo cáo')).toBeTruthy();
    expect(apiCalls('PATCH', '/admin/reports/ar1')[0].body).toEqual({ status: 'resolved', note: 'Spam rõ ràng', removeContent: true });
    expect(db.admin.posts.some((p) => p.id === 'ap1')).toBe(false);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
  });

  it('"Xác nhận" giữ nội dung; "Bỏ qua" đóng báo cáo không vi phạm', async () => {
    const { user } = openAdmin('/admin/reports');
    await user.click(within(await screen.findByRole('article', { name: /Bài thường của bạn một/ })).getByRole('button', { name: 'Xác nhận' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Xác nhận báo cáo' })).getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Đã xác nhận báo cáo')).toBeTruthy();
    expect(apiCalls('PATCH', '/admin/reports/ar1')[0].body).toEqual({ status: 'resolved', note: '', removeContent: false });
    expect(db.admin.posts.some((p) => p.id === 'ap1')).toBe(true);

    await user.click(within(await screen.findByRole('article', { name: /Kẻ Phá Hoại/ })).getByRole('button', { name: 'Bỏ qua' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Bỏ qua báo cáo' })).getByRole('button', { name: 'Bỏ qua' }));
    expect(await screen.findByText('Đã bỏ qua báo cáo')).toBeTruthy();
    expect(await screen.findByText('Không có báo cáo nào đang chờ')).toBeTruthy();
  });

  it('đóng hộp thoại bằng Hủy → không gọi API; lỗi server → toast đỏ, hộp thoại còn để thử lại', async () => {
    const { user } = openAdmin('/admin/reports', () => void db.failNext.add('PATCH /admin/reports/ar1'));
    const post = () => within(screen.getByRole('article', { name: /Bài thường của bạn một/ }));
    await articles();
    await user.click(post().getByRole('button', { name: 'Bỏ qua' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Hủy' }));
    expect(apiCalls('PATCH', '/admin/reports')).toHaveLength(0);
    await user.click(post().getByRole('button', { name: 'Bỏ qua' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Bỏ qua' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('không còn báo cáo chờ → thông báo "đã xử lý hết"', async () => {
    openAdmin('/admin/reports', () => db.admin.reports.forEach((r) => (r.status = 'resolved')));
    expect(await screen.findByText('Không có báo cáo nào đang chờ')).toBeTruthy();
  });

  it('tải lỗi → màn hình lỗi, "Thử lại" tải lại', async () => {
    const { user } = openAdmin('/admin/reports', () => void db.failNext.add('GET /admin/reports'));
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await articles()).toHaveLength(2);
  });

  it('phân trang: nhiều báo cáo → "Xem thêm báo cáo"', async () => {
    const { user } = openAdmin('/admin/reports', () => {
      for (let i = 0; i < 35; i++) db.admin.reports.push({ ...db.admin.reports[0], id: `rx${i}`, targetName: `Nội dung ${i}`, targetType: 'group' });
    });
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(30));
    await user.click(screen.getByRole('button', { name: 'Xem thêm báo cáo' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(37));
  });

  it('báo cáo của tài khoản đã bị xoá vẫn hiển thị', async () => {
    openAdmin('/admin/reports', () => void (db.admin.reports[0].reporter = null));
    expect(await screen.findByText('Tài khoản đã bị xoá')).toBeTruthy();
  });
});

describe('Thông báo hệ thống', () => {
  it('liệt kê các thông báo đã gửi; nút Gửi bị khoá đến khi nhập đủ tiêu đề và nội dung', async () => {
    const { user } = openAdmin('/admin/announcements');
    expect(await screen.findByText('Bảo trì lúc 2h sáng.')).toBeTruthy();
    expect(screen.getAllByText('Cảnh báo').length).toBeGreaterThan(0);
    const send = screen.getByRole('button', { name: /Gửi tới tất cả/ });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Tiêu đề'), 'Cập nhật mới');
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Nội dung'), 'Có tính năng mới');
    expect((send as HTMLButtonElement).disabled).toBe(false);
  });

  it('gửi: phải xác nhận; đồng ý → thông báo mới lên đầu danh sách, form được xoá sạch', async () => {
    const { user } = openAdmin('/admin/announcements');
    await screen.findByText('Bảo trì lúc 2h sáng.');
    await user.type(screen.getByLabelText('Tiêu đề'), '  Cập nhật mới  ');
    await user.selectOptions(screen.getByLabelText('Mức độ'), 'alert');
    await user.type(screen.getByLabelText('Nội dung'), 'Có tính năng mới');
    await user.click(screen.getByRole('button', { name: /Gửi tới tất cả/ }));
    await confirmDialog(user, 'Hủy');
    expect(apiCalls('POST', '/admin/announcements')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /Gửi tới tất cả/ }));
    await confirmDialog(user);
    expect(await screen.findByText('Đã gửi thông báo tới mọi người dùng')).toBeTruthy();
    expect(apiCalls('POST', '/admin/announcements')[0].body).toEqual({ title: 'Cập nhật mới', message: 'Có tính năng mới', type: 'alert' });
    expect(await screen.findByText('Có tính năng mới', { selector: 'p' })).toBeTruthy();
    expect((screen.getByLabelText('Tiêu đề') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Mức độ') as HTMLSelectElement).value).toBe('info');
    expect(screen.getByText('Khẩn cấp', { selector: 'span' })).toBeTruthy();
  });

  it('gửi lỗi → toast đỏ và giữ nguyên nội dung đã soạn', async () => {
    const { user } = openAdmin('/admin/announcements', () => void db.failNext.add('POST /admin/announcements'));
    await screen.findByText('Bảo trì lúc 2h sáng.');
    await user.type(screen.getByLabelText('Tiêu đề'), 'Tiêu đề');
    await user.type(screen.getByLabelText('Nội dung'), 'Nội dung');
    await user.click(screen.getByRole('button', { name: /Gửi tới tất cả/ }));
    await confirmDialog(user);
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect((screen.getByLabelText('Tiêu đề') as HTMLInputElement).value).toBe('Tiêu đề');
  });

  it('xoá bản ghi thông báo; hết thì hiện màn hình trống', async () => {
    const { user } = openAdmin('/admin/announcements');
    await user.click(await screen.findByRole('button', { name: 'Xoá thông báo Bảo trì' }));
    await confirmDialog(user, 'Hủy');
    expect(apiCalls('DELETE', '/admin/announcements')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Xoá thông báo Bảo trì' }));
    await confirmDialog(user);
    expect(await screen.findByText('Chưa có thông báo nào')).toBeTruthy();
  });

  it('tải lỗi → màn hình lỗi, "Thử lại" tải lại', async () => {
    const { user } = openAdmin('/admin/announcements', () => void db.failNext.add('GET /admin/announcements'));
    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Bảo trì lúc 2h sáng.')).toBeTruthy();
  });
});

describe('Nhật ký quản trị', () => {
  it('liệt kê hành động bằng tiếng Việt kèm chi tiết; mã hành động lạ hiện nguyên văn', async () => {
    openAdmin('/admin/audit', () => {
      db.admin.logs.push(
        { id: 'al2', admin: null, action: 'user.role', targetType: 'user', details: { role: 'admin' }, createdAt: new Date().toISOString() },
        { id: 'al3', admin: db.admin.logs[0].admin, action: 'thing.unknown', targetType: 'user', createdAt: new Date().toISOString() },
        { id: 'al4', admin: db.admin.logs[0].admin, action: 'report.resolve', targetType: 'report', details: { removed: true, note: 'Đã gỡ' }, createdAt: new Date().toISOString() },
        { id: 'al5', admin: db.admin.logs[0].admin, action: 'announcement.create', targetType: 'announcement', details: { title: 'Bảo trì' }, createdAt: new Date().toISOString() },
      );
    });
    expect(await screen.findByText('Khoá tài khoản')).toBeTruthy();
    expect(screen.getByText('Lý do: Spam liên tục')).toBeTruthy();
    expect(screen.getByText('Cấp quyền quản trị')).toBeTruthy();
    expect(screen.getByText('Tài khoản đã bị xoá')).toBeTruthy();
    expect(screen.getByText('thing.unknown')).toBeTruthy();
    expect(screen.getByText('Đã gỡ nội dung · Ghi chú: Đã gỡ')).toBeTruthy();
    expect(screen.getByText('"Bảo trì"')).toBeTruthy();
    expect(screen.getByText('4 hành động đã ghi lại'.replace('4', '5'))).toBeTruthy();
  });

  it('chưa có hành động nào → màn hình trống', async () => {
    openAdmin('/admin/audit', () => void (db.admin.logs = []));
    expect(await screen.findByText('Chưa có hành động quản trị nào')).toBeTruthy();
  });
});

describe('Báo cáo vi phạm từ phía người dùng', () => {
  it('báo cáo bài viết của người khác: chọn lý do, mô tả → gửi; báo cáo lại → báo đã báo cáo rồi', async () => {
    const { user } = renderApp('/');
    const article = (await screen.findByText('Bài của bạn một')).closest('article') as HTMLElement;
    await user.click(within(article).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    await user.click(within(article).getByRole('button', { name: 'Báo cáo vi phạm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Báo cáo bài viết' });
    await user.click(within(dialog).getByLabelText('Quấy rối, bắt nạt'));
    await user.type(within(dialog).getByLabelText('Mô tả thêm'), ' Lời lẽ xúc phạm ');
    await user.click(within(dialog).getByRole('button', { name: 'Gửi báo cáo' }));
    expect(await screen.findByText(/Đã gửi báo cáo/)).toBeTruthy();
    expect(apiCalls('POST', '/reports')[0].body).toEqual({ targetType: 'post', targetId: 'p1', reason: 'harassment', description: 'Lời lẽ xúc phạm' });
    expect(screen.queryByRole('dialog', { name: 'Báo cáo bài viết' })).toBeNull();

    await user.click(within(article).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    await user.click(within(article).getByRole('button', { name: 'Báo cáo vi phạm' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Gửi báo cáo' }));
    expect((await screen.findByRole('alert')).textContent).toContain('đã báo cáo nội dung này rồi');
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('bài của chính mình không có mục báo cáo vi phạm', async () => {
    const { user } = renderApp('/');
    const article = (await screen.findByText('Bài của tôi')).closest('article') as HTMLElement;
    await user.click(within(article).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    expect(within(article).queryByRole('button', { name: 'Báo cáo vi phạm' })).toBeNull();
  });

  it('báo cáo người dùng từ trang cá nhân; trang của mình không có nút', async () => {
    const { user } = renderApp('/profile/s1');
    await user.click(await screen.findByRole('button', { name: 'Báo cáo người dùng' }));
    await user.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    await screen.findByText(/Đã gửi báo cáo/);
    expect(apiCalls('POST', '/reports')[0].body).toMatchObject({ targetType: 'user', targetId: 's1', reason: 'spam' });
  });

  it('trang cá nhân của mình không có nút báo cáo', async () => {
    renderApp('/profile/u1');
    await screen.findByText('Chỉnh sửa trang cá nhân');
    expect(screen.queryByRole('button', { name: 'Báo cáo người dùng' })).toBeNull();
  });

  it('báo cáo nhóm không phải của mình', async () => {
    const { user } = renderApp('/groups/g3');
    await user.click(await screen.findByRole('button', { name: 'Báo cáo nhóm' }));
    await user.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    await screen.findByText(/Đã gửi báo cáo/);
    expect(apiCalls('POST', '/reports')[0].body).toMatchObject({ targetType: 'group', targetId: 'g3' });
  });

  it('chủ nhóm không thấy nút báo cáo nhóm', async () => {
    renderApp('/groups/g1');
    await screen.findByRole('heading', { name: 'Nhóm Công Khai' });
    expect(screen.queryByRole('button', { name: 'Báo cáo nhóm' })).toBeNull();
  });

  it('báo cáo trang của người khác; chủ trang không thấy nút', async () => {
    const { user } = renderApp('/pages/pg1');
    await user.click(await screen.findByRole('button', { name: 'Báo cáo trang' }));
    await user.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    await screen.findByText(/Đã gửi báo cáo/);
    expect(apiCalls('POST', '/reports')[0].body).toMatchObject({ targetType: 'page', targetId: 'pg1' });
  });

  it('chủ trang không thấy nút báo cáo trang', async () => {
    renderApp('/pages/pg2');
    await screen.findByRole('heading', { name: 'Tiệm Của Tôi' });
    expect(screen.queryByRole('button', { name: 'Báo cáo trang' })).toBeNull();
  });

  it('báo cáo bình luận của người khác', async () => {
    const { user } = renderApp('/');
    const article = (await screen.findByText('Bài của tôi')).closest('article') as HTMLElement;
    await user.click(within(article).getByRole('button', { name: 'Bình luận' }));
    await user.click(await within(article).findByRole('button', { name: 'Báo cáo bình luận' }));
    await user.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    await screen.findByText(/Đã gửi báo cáo/);
    expect(apiCalls('POST', '/reports')[0].body).toMatchObject({ targetType: 'comment', targetId: 'c1' });
  });

  it('báo cáo reel của người khác', async () => {
    const { user } = renderApp('/reels');
    const buttons = await screen.findAllByRole('button', { name: 'Báo cáo reel' });
    await user.click(buttons[0]);
    await user.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    await screen.findByText(/Đã gửi báo cáo/);
    expect(apiCalls('POST', '/reports')[0].body).toMatchObject({ targetType: 'post', targetId: 'rl1' });
  });
});

describe('Thông báo hệ thống hiển thị cho người dùng', () => {
  const system = { id: 'ns1', userId: 'u1', actor: { id: 'a2', name: 'Admin Hai', username: 'admin2', avatar: '/a.png', joinDate: '', friendsCount: 0 }, type: 'system' as const, content: 'Bảo trì lúc 2h sáng.', targetType: 'system' as const, isRead: false, createdAt: new Date().toISOString() };

  it('trang Thông báo hiện "Hệ thống" thay vì tên quản trị viên', async () => {
    renderApp('/notifications', { seed: () => void db.notifications.unshift(system) });
    expect(await screen.findByText('Hệ thống:')).toBeTruthy();
    expect(screen.queryByText('Admin Hai')).toBeNull();
  });

  it('thông báo đẩy realtime → toast "Hệ thống: ..." và có trong menu thông báo', async () => {
    const { user } = renderApp('/');
    await screen.findByText('Bài của bạn một');
    await act(async () => serverEmit('notification:new', system));
    expect((await screen.findByRole('status')).textContent).toBe('Hệ thống: Bảo trì lúc 2h sáng.');
    await user.click(screen.getByRole('button', { name: 'Thông báo' }));
    expect(screen.getAllByText('Hệ thống:').length).toBeGreaterThan(0);
  });
});

describe('Tài khoản bị khoá', () => {
  it('đăng nhập bằng tài khoản bị khoá → hiện lý do của server', async () => {
    const seed = () => {
      db.users.push({ id: 'bn', name: 'Bị Khoá', username: 'bikhoa', email: 'banned@test.vn', avatar: '', joinDate: '', friendsCount: 0 });
      db.passwords['banned@test.vn'] = 'secret123';
    };
    const { user } = renderApp('/login', { loggedIn: false, seed });
    await user.type(screen.getByLabelText('Email'), 'banned@test.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'secret123');
    await user.click(screen.getByRole('button', { name: /^Đăng nhập/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Tài khoản của bạn đã bị khoá. Lý do: Spam');
  });

  it('đang dùng mà bị khoá (sự kiện account:banned) → bị đăng xuất, về trang đăng nhập', async () => {
    const { location } = renderApp('/');
    await screen.findByText('Bài của bạn một');
    await act(async () => serverEmit('account:banned', { reason: 'Spam' }));
    await waitFor(() => expect(location()).toBe('/login'));
  });

  it('server trả 401 giữa chừng → coi như hết phiên, về trang đăng nhập', async () => {
    const { location } = renderApp('/');
    await screen.findByText('Bài của bạn một');
    await act(async () => void window.dispatchEvent(new Event('auth:session-ended')));
    await waitFor(() => expect(location()).toBe('/login'));
  });
});

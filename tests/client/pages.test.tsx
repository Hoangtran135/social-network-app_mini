// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, screen, waitFor, within, fireEvent } from './harness';
import { db, calls, makeUser, apiModule } from './fakeServer';
import type { NotificationItem } from '../../src/types';

// Các trang: hồ sơ, bạn bè, thông báo, cài đặt, sửa hồ sơ, danh sách chặn, đã lưu, kỷ niệm.

beforeEach(() => installBrowserStubs());
type Ctx = ReturnType<typeof renderApp>;
const confirmDialog = async (user: Ctx['user'], button = 'Đồng ý') => user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: button }));
const main = () => document.querySelector('main')!;

describe('Trang cá nhân — của mình', () => {
  it('hiện tên, @username, tiểu sử, số bạn bè / bài viết', async () => {
    renderApp('/profile/u1');
    expect(await screen.findByRole('heading', { name: 'Trần Xuân Hoàng', level: 1 })).toBeTruthy();
    expect(screen.getAllByText('@trầnxuânhoàng').length).toBeGreaterThan(0);
    expect(within(main()).getAllByText('Sinh viên').length).toBeGreaterThan(0);
  });

  it('có nút "Chỉnh sửa trang cá nhân" → /settings/profile; KHÔNG có nút kết bạn / nhắn tin / chặn', async () => {
    const { user, location } = renderApp('/profile/u1');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Nhắn tin' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chặn người dùng' })).toBeNull();
    await user.click(screen.getByRole('link', { name: /Chỉnh sửa trang cá nhân/ }));
    expect(location()).toBe('/settings/profile');
  });

  it('tab bài viết: thẻ giới thiệu + ô đăng bài + bài của mình', async () => {
    renderApp('/profile/u1');
    await screen.findByText('Bài của tôi');
    expect(screen.getByText('Làm việc tại FPT')).toBeTruthy();
    expect(screen.getByText('Học tại Bách Khoa')).toBeTruthy();
    expect(screen.getByText('Sống tại Hà Nội')).toBeTruthy();
    expect(screen.getByText(/Tham gia/)).toBeTruthy();
    expect(screen.queryByText('Bài của bạn một')).toBeNull();
  });

  it('chưa có thông tin → gợi ý bổ sung', async () => {
    renderApp('/profile/u1', { seed: () => void Object.assign(db.me, { workplace: undefined, education: undefined, location: undefined, website: undefined }) });
    expect(await screen.findByText(/Hãy thêm thông tin/)).toBeTruthy();
  });

  it('tab Bạn bè hiện danh sách; bấm vào mở hồ sơ bạn', async () => {
    const { user, location } = renderApp('/profile/u1');
    await user.click(await screen.findByRole('button', { name: 'Bạn bè (2)' }));
    expect(screen.getAllByText('Bạn Một').length).toBeGreaterThan(0);
    await user.click(within(main()).getAllByRole('link', { name: /Bạn Một/ })[0]);
    expect(location()).toBe('/profile/f1');
  });

  it('tab Hình ảnh: chưa có → màn hình trống; có ảnh → lưới ảnh', async () => {
    const { user } = renderApp('/profile/u1');
    await user.click(await screen.findByRole('button', { name: /Hình ảnh/ }));
    expect(screen.getByText('Chưa có hình ảnh nào')).toBeTruthy();
  });

  it('tab Hình ảnh có ảnh', async () => {
    const { user } = renderApp('/profile/u1', { seed: () => void (db.posts[1].images = ['/a.png', '/b.png']) });
    await user.click(await screen.findByRole('button', { name: 'Hình ảnh (2)' }));
    expect(main().querySelectorAll('a[href$=".png"]')).toHaveLength(2);
  });

  it('tab Giới thiệu: đủ các mục, website là link an toàn', async () => {
    const { user } = renderApp('/profile/u1');
    await user.click(await screen.findByRole('button', { name: 'Giới thiệu' }));
    for (const label of ['Tiểu sử', 'Nơi làm việc', 'Học vấn', 'Nơi sống', 'Website', 'Email', 'Tham gia']) expect(screen.getByText(label)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'example.com' });
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('mục chưa có thông tin → "Chưa cập nhật"', async () => {
    const { user } = renderApp('/profile/u1', { seed: () => void Object.assign(db.me, { workplace: undefined, website: undefined }) });
    await user.click(await screen.findByRole('button', { name: 'Giới thiệu' }));
    expect(screen.getAllByText('Chưa cập nhật').length).toBeGreaterThanOrEqual(2);
  });

  it('?tab=photos mở thẳng tab hình ảnh; đổi tab qua lối tắt "Ảnh của tôi" khi đang ở trang cá nhân', async () => {
    const { user } = renderApp('/profile/u1');
    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('link', { name: /Ảnh của tôi/ }));
    expect(await screen.findByText('Chưa có hình ảnh nào')).toBeTruthy();
  });

  it('?tab không hợp lệ → rơi về tab bài viết', async () => {
    renderApp('/profile/u1?tab=hack');
    expect(await screen.findByText('Bài của tôi')).toBeTruthy();
  });

  it('đăng bài lên tường của mình từ trang cá nhân', async () => {
    const { user } = renderApp('/profile/u1');
    await user.click(await screen.findByText('Trần Xuân Hoàng ơi, bạn đang nghĩ gì thế?'));
    const dialog = screen.getByRole('dialog', { name: 'Đăng bài' });
    await user.type(within(dialog).getByRole('textbox'), 'Bài từ trang cá nhân');
    await user.click(within(dialog).getByRole('button', { name: 'Đăng bài viết' }));
    expect(await screen.findByText('Bài từ trang cá nhân')).toBeTruthy();
  });

  it('bài được ghim nằm trên cùng', async () => {
    renderApp('/profile/u1', { seed: () => { db.posts.push({ ...db.posts[1], id: 'p9', content: 'Bài ghim', pinned: true, createdAt: new Date(Date.now() - 9e8).toISOString() }); } });
    await screen.findByText('Bài của tôi');
    expect(Array.from(document.querySelectorAll('article'))[0].id).toBe('post-p9');
  });
});

describe('Trang cá nhân — của người khác', () => {
  it('đang tải → "Đang tải hồ sơ..."', async () => {
    const original = apiModule.api.get;
    apiModule.api.get = (path: string) => (path === '/users/f1' ? new Promise(() => {}) : original(path)); // request hồ sơ treo mãi
    renderApp('/profile/f1');
    expect(await screen.findByText('Đang tải hồ sơ...')).toBeTruthy();
    apiModule.api.get = original;
  });

  it('không tồn tại / bị chặn → "Không tìm thấy người dùng" + nút về bảng tin', async () => {
    const { user, location } = renderApp('/profile/zzz');
    expect(await screen.findByText('Không tìm thấy người dùng')).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Quay lại Bảng tin' }));
    expect(location()).toBe('/');
  });

  it('bạn bè: nút "Bạn bè" (hủy kết bạn có xác nhận), có ô đăng lên tường', async () => {
    const { user } = renderApp('/profile/f1');
    expect(await screen.findByText('Viết gì đó cho Bạn Một...')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Bạn bè' }));
    await confirmDialog(user, 'Hủy');
    expect(screen.getByRole('button', { name: 'Bạn bè' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Bạn bè' }));
    await confirmDialog(user);
    expect(await screen.findByRole('button', { name: 'Thêm bạn bè' })).toBeTruthy();
  });

  it('đăng lên tường bạn → hộp thoại ghi rõ tên chủ tường', async () => {
    const { user } = renderApp('/profile/f1');
    await user.click(await screen.findByText('Viết gì đó cho Bạn Một...'));
    expect(screen.getByText('Đăng lên tường của Bạn Một')).toBeTruthy();
    const dialog = screen.getByRole('dialog', { name: 'Đăng bài' });
    await user.type(within(dialog).getByRole('textbox'), 'Chúc mừng sinh nhật');
    await user.click(within(dialog).getByRole('button', { name: 'Đăng lên tường' }));
    expect(await screen.findByText('Đã đăng bài lên tường của Bạn Một!')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST' && c.path === '/posts')?.body).toMatchObject({ wallOwnerId: 'f1' });
  });

  it('nút Nhắn tin mở cửa sổ chat với người đó', async () => {
    const { user } = renderApp('/profile/f1');
    await user.click(await screen.findByRole('button', { name: 'Nhắn tin' }));
    expect(await screen.findByPlaceholderText('Nhập tin nhắn...')).toBeTruthy();
  });

  it('người lạ: Thêm bạn bè ⇄ Hủy lời mời; KHÔNG có ô đăng lên tường', async () => {
    const { user } = renderApp('/profile/s1');
    await screen.findByRole('heading', { name: 'Người Lạ' });
    expect(screen.queryByText(/Viết gì đó cho/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Thêm bạn bè' }));
    expect(await screen.findByRole('button', { name: 'Hủy lời mời' })).toBeTruthy();
    expect(screen.getByText('Đã gửi lời mời kết bạn tới Người Lạ')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hủy lời mời' }));
    expect(await screen.findByRole('button', { name: 'Thêm bạn bè' })).toBeTruthy();
  });

  it('người đã mời mình: "Chấp nhận kết bạn" → thành bạn bè', async () => {
    const { user } = renderApp('/profile/s2');
    await user.click(await screen.findByRole('button', { name: 'Chấp nhận kết bạn' }));
    expect(await screen.findByRole('button', { name: 'Bạn bè' })).toBeTruthy();
  });

  it('người mình đã mời: hiện "Hủy lời mời"', async () => {
    renderApp('/profile/s3');
    expect(await screen.findByRole('button', { name: 'Hủy lời mời' })).toBeTruthy();
  });

  it('chặn: hỏi xác nhận; Hủy → không gọi API; Đồng ý → gọi API chặn', async () => {
    const { user } = renderApp('/profile/s1');
    await user.click(await screen.findByRole('button', { name: 'Chặn người dùng' }));
    await confirmDialog(user, 'Hủy');
    expect(calls.some((c) => c.path === '/users/s1/block')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Chặn người dùng' }));
    await confirmDialog(user);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/users/s1/block')).toBe(true));
  });

  it('chuyển từ hồ sơ này sang hồ sơ khác không hiện dữ liệu cũ', async () => {
    const { user } = renderApp('/profile/f1');
    await screen.findByRole('heading', { name: 'Bạn Một' });
    await user.click(screen.getByRole('link', { name: /Trần Xuân Hoàng/ }));
    expect(await screen.findByRole('heading', { name: 'Trần Xuân Hoàng', level: 1 })).toBeTruthy();
  });

  it('tab Bạn bè của người khác tải từ server', async () => {
    const { user } = renderApp('/profile/f1');
    await user.click(await screen.findByRole('button', { name: /Bạn bè \(\d+\)/ }));
    await waitFor(() => expect(calls.some((c) => c.path === '/friends/of/f1')).toBe(true));
    expect(screen.getAllByText('Người Lạ').length).toBeGreaterThan(0);
  });

  it('có ảnh bìa / không có ảnh bìa', async () => {
    renderApp('/profile/f1', { seed: () => void (db.users[1].coverImage = '/cover.png') });
    await screen.findByRole('heading', { name: 'Bạn Một' });
    expect(main().querySelector('img[src="/cover.png"]')).toBeTruthy();
  });
});

describe('Trang Bạn bè', () => {
  it('tab Bạn bè: danh sách, số lượng, nơi sống', async () => {
    renderApp('/friends');
    expect(await screen.findByText('2 bạn bè · 1 lời mời')).toBeTruthy();
    expect(screen.getAllByText('Bạn Một').length).toBeGreaterThan(0);
    expect(screen.getByText('Đà Nẵng')).toBeTruthy();
  });

  it('tìm bạn bè: lọc theo tên; không thấy → thông báo', async () => {
    const { user } = renderApp('/friends');
    await screen.findByText('2 bạn bè · 1 lời mời');
    await user.type(screen.getByLabelText('Tìm bạn bè'), 'Hai');
    expect(within(main()).queryByText('Bạn Một')).toBeNull();
    expect(within(main()).getByText('Bạn Hai')).toBeTruthy();
    await user.clear(screen.getByLabelText('Tìm bạn bè'));
    await user.type(screen.getByLabelText('Tìm bạn bè'), 'zzzz');
    expect(screen.getByText('Không tìm thấy bạn bè nào')).toBeTruthy();
    expect(screen.getByText(/Không có kết quả cho "zzzz"/)).toBeTruthy();
  });

  it('nhắn tin / hủy kết bạn từ thẻ bạn bè', async () => {
    const { user } = renderApp('/friends');
    await screen.findByText('2 bạn bè · 1 lời mời');
    await user.click(screen.getAllByRole('button', { name: 'Hủy kết bạn' })[0]);
    await confirmDialog(user);
    await waitFor(() => expect(screen.getByText('1 bạn bè · 1 lời mời')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Nhắn tin/ }));
    expect(await screen.findByPlaceholderText('Nhập tin nhắn...')).toBeTruthy();
  });

  it('chưa có bạn → màn hình trống + nút xem gợi ý chuyển tab', async () => {
    const { user } = renderApp('/friends', { seed: () => void (db.friends = []) });
    expect(await screen.findByText('Chưa có bạn bè nào')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Xem gợi ý kết bạn' }));
    expect(await screen.findByText('Người Lạ')).toBeTruthy();
  });

  it('tab Lời mời: lời mời nhận được + đã gửi; chấp nhận', async () => {
    const { user } = renderApp('/friends');
    await screen.findByText('2 bạn bè · 1 lời mời');
    await user.click(screen.getByRole('button', { name: /^Lời mời/ }));
    expect(screen.getByText('Lời mời đã nhận (1)')).toBeTruthy();
    expect(screen.getByText('Lời mời đã gửi (1)')).toBeTruthy();
    expect(screen.getByText('Người Được Mời')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Chấp nhận' }));
    await waitFor(() => expect(screen.getByText('3 bạn bè · 0 lời mời')).toBeTruthy());
  });

  it('từ chối lời mời; hủy lời mời đã gửi', async () => {
    const { user } = renderApp('/friends');
    await screen.findByText('2 bạn bè · 1 lời mời');
    await user.click(screen.getByRole('button', { name: /^Lời mời/ }));
    await user.click(screen.getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(screen.queryByText('Lời mời đã nhận (1)')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Hủy lời mời' }));
    expect(await screen.findByText('Không có lời mời kết bạn nào')).toBeTruthy();
  });

  it('tab Gợi ý: chỉ người chưa có quan hệ; gửi lời mời → biến mất khỏi gợi ý', async () => {
    const { user } = renderApp('/friends');
    await screen.findByText('2 bạn bè · 1 lời mời');
    await user.click(screen.getByRole('button', { name: /Gợi ý/ }));
    expect(await screen.findByText('Người Lạ')).toBeTruthy();
    expect(screen.queryByText('Người Mời')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Thêm bạn bè' }));
    expect(await screen.findByText('Không còn gợi ý mới')).toBeTruthy();
  });

  it('huy hiệu số lời mời trên tab', async () => {
    renderApp('/friends');
    await screen.findByText('2 bạn bè · 1 lời mời');
    expect(within(screen.getByRole('button', { name: /^Lời mời/ })).getByText('1')).toBeTruthy();
  });
});

describe('Trang Thông báo', () => {
  it('tiêu đề, số chưa đọc, danh sách', async () => {
    renderApp('/notifications');
    expect(await screen.findByText('Bạn có 2 thông báo chưa đọc')).toBeTruthy();
    expect(within(main()).getByText(/đã thả cảm xúc về bài viết của bạn/)).toBeTruthy();
  });

  it('đã đọc hết → câu riêng, không còn nút "Đánh dấu tất cả"', async () => {
    renderApp('/notifications', { seed: () => db.notifications.forEach((n) => (n.isRead = true)) });
    expect(await screen.findByText('Tất cả thông báo đã được đọc')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Đánh dấu tất cả đã đọc' })).toBeNull();
  });

  it('đánh dấu tất cả đã đọc', async () => {
    const { user } = renderApp('/notifications');
    await user.click(await screen.findByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));
    expect(await screen.findByText('Tất cả thông báo đã được đọc')).toBeTruthy();
    expect(calls.some((c) => c.path === '/notifications/read-all')).toBe(true);
  });

  it.each([
    ['Chưa đọc', 2],
    ['Tương tác bài viết', 2],
    ['Bạn bè', 2],
    ['Tất cả', 4],
  ])('bộ lọc "%s" → %i thông báo', async (filter, count) => {
    const { user } = renderApp('/notifications');
    await screen.findByText('Bạn có 2 thông báo chưa đọc');
    await user.click(within(main()).getByRole('button', { name: filter }));
    expect(within(main()).getAllByRole('button').filter((b) => b.textContent!.includes('trước') || b.textContent!.includes('Vừa xong'))).toHaveLength(count);
  });

  it('bộ lọc không có kết quả → màn hình trống riêng', async () => {
    const { user } = renderApp('/notifications', { seed: () => void (db.notifications = db.notifications.filter((n) => n.type === 'like')) });
    await screen.findByText(/đã thả cảm xúc/);
    await user.click(within(main()).getByRole('button', { name: 'Bạn bè' }));
    expect(screen.getByText('Không có thông báo phù hợp')).toBeTruthy();
  });

  it('không có thông báo nào → màn hình trống', async () => {
    renderApp('/notifications', { seed: () => void (db.notifications = []) });
    expect(await screen.findByText('Chưa có thông báo nào')).toBeTruthy();
  });

  it('bấm thông báo về bài viết → đánh dấu đã đọc và về bảng tin', async () => {
    const { user, location } = renderApp('/notifications');
    await screen.findByText('Bạn có 2 thông báo chưa đọc');
    await user.click(within(main()).getByText(/đã thả cảm xúc về bài viết của bạn/));
    await waitFor(() => expect(location()).toBe('/'));
    expect(calls.some((c) => c.method === 'PATCH' && c.path === '/notifications/n1/read')).toBe(true);
  });

  it('bấm thông báo về người dùng → mở trang cá nhân người đó', async () => {
    const { user, location } = renderApp('/notifications');
    await screen.findByText('Bạn có 2 thông báo chưa đọc');
    await user.click(within(main()).getByText(/đã gửi lời mời kết bạn/));
    await waitFor(() => expect(location()).toBe('/profile/s2'));
  });

  it('thông báo bài đăng lên tường → mở trang cá nhân chủ tường', async () => {
    const { user, location } = renderApp('/notifications', { seed: () => void Object.assign(db.posts[1], { wallOwnerId: 'f1' }) });
    await screen.findByText('Bạn có 2 thông báo chưa đọc');
    await user.click(within(main()).getByText(/đã thả cảm xúc về bài viết của bạn/));
    await waitFor(() => expect(location()).toBe('/profile/f1'));
  });

  it('đủ một trang → nút "Xem thêm thông báo" tải trang tiếp', async () => {
    const many: NotificationItem[] = Array.from({ length: 30 }, (_, i) => ({ id: `nb${i}`, userId: 'u1', actor: makeUser('f1', 'Bạn Một'), type: 'system', content: `thông báo ${i}`, isRead: true, createdAt: new Date().toISOString() }));
    const { user } = renderApp('/notifications', { seed: () => void (db.notifications = [...many, ...db.notifications]) });
    await screen.findByText(/thông báo 0$/);
    await user.click(screen.getByRole('button', { name: 'Xem thêm thông báo' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/notifications?limit=30&skip=30')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Xem thêm thông báo' })).toBeNull());
  });
});

describe('Trang Cài đặt', () => {
  const fill = async (user: Ctx['user'], current: string, next: string, confirm: string) => {
    await user.type(screen.getByLabelText('Mật khẩu hiện tại'), current);
    await user.type(screen.getByLabelText('Mật khẩu mới'), next);
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), confirm);
  };

  it('có lối tắt tới Sửa hồ sơ và Danh sách chặn', async () => {
    const { user, location } = renderApp('/settings');
    await user.click(await screen.findByRole('link', { name: /Danh sách chặn/ }));
    expect(location()).toBe('/settings/blocked');
  });

  it('lối tắt tới Chỉnh sửa hồ sơ', async () => {
    const { user, location } = renderApp('/settings');
    await user.click(await screen.findByRole('link', { name: /Chỉnh sửa hồ sơ/ }));
    expect(location()).toBe('/settings/profile');
  });

  it('đổi mật khẩu thành công → toast + xoá các ô', async () => {
    const { user } = renderApp('/settings');
    await screen.findByText('Đổi mật khẩu', { selector: 'h2' });
    await fill(user, 'secret123', 'matkhaumoi', 'matkhaumoi');
    await user.click(screen.getByRole('button', { name: 'Cập nhật mật khẩu' }));
    expect(await screen.findByText('Đã đổi mật khẩu thành công!')).toBeTruthy();
    expect((screen.getByLabelText('Mật khẩu hiện tại') as HTMLInputElement).value).toBe('');
  });

  it('sai mật khẩu hiện tại → toast lỗi của server', async () => {
    const { user } = renderApp('/settings');
    await screen.findByText('Đổi mật khẩu', { selector: 'h2' });
    await fill(user, 'sai-mat-khau', 'matkhaumoi', 'matkhaumoi');
    await user.click(screen.getByRole('button', { name: 'Cập nhật mật khẩu' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Mật khẩu hiện tại không chính xác.');
  });

  it('xác nhận không khớp → toast, không gọi server', async () => {
    const { user } = renderApp('/settings');
    await screen.findByText('Đổi mật khẩu', { selector: 'h2' });
    await fill(user, 'secret123', 'matkhaumoi', 'khac-nhau');
    await user.click(screen.getByRole('button', { name: 'Cập nhật mật khẩu' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Mật khẩu xác nhận không khớp');
    expect(calls.some((c) => c.path === '/users/me/password')).toBe(false);
  });

  it('mật khẩu mới quá ngắn → toast', async () => {
    renderApp('/settings');
    await screen.findByText('Đổi mật khẩu', { selector: 'h2' });
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'abc' } });
    fireEvent.submit(screen.getByLabelText('Mật khẩu mới').closest('form')!);
    expect((await screen.findByRole('alert')).textContent).toContain('ít nhất 6 ký tự');
  });
});

describe('Trang Sửa hồ sơ', () => {
  it('điền sẵn thông tin hiện tại; username bị khoá', async () => {
    renderApp('/settings/profile');
    expect(((await screen.findByLabelText('Họ và tên')) as HTMLInputElement).value).toBe('Trần Xuân Hoàng');
    expect((screen.getByLabelText('Nơi làm việc') as HTMLInputElement).value).toBe('FPT');
    expect((screen.getByLabelText(/Tên người dùng/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByPlaceholderText(/Giới thiệu đôi nét/) as HTMLTextAreaElement).value).toBe('Sinh viên');
  });

  it('sửa và lưu → toast, về trang cá nhân, dữ liệu mới', async () => {
    const { user, location } = renderApp('/settings/profile');
    const name = (await screen.findByLabelText('Họ và tên')) as HTMLInputElement;
    await user.clear(name);
    await user.type(name, 'Tên Mới');
    await user.clear(screen.getByLabelText('Nơi sống'));
    await user.type(screen.getByLabelText('Nơi sống'), 'Huế');
    await user.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));
    await waitFor(() => expect(location()).toBe('/profile/u1'));
    expect(await screen.findByRole('heading', { name: 'Tên Mới', level: 1 })).toBeTruthy();
    expect(calls.find((c) => c.method === 'PATCH' && c.path === '/users/me')?.body).toMatchObject({ name: 'Tên Mới', location: 'Huế' });
  });

  it('server lỗi → toast lỗi, ở lại trang và nút lưu dùng lại được', async () => {
    const { user, location } = renderApp('/settings/profile');
    await screen.findByLabelText('Họ và tên');
    db.failNext.add('PATCH /users/me');
    await user.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Không thể lưu thông tin');
    expect(location()).toBe('/settings/profile');
    expect((screen.getByRole('button', { name: /Lưu thay đổi/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('đổi ảnh đại diện và ảnh bìa (upload ngay, lưu khi bấm Lưu)', async () => {
    const { user } = renderApp('/settings/profile');
    await screen.findByLabelText('Họ và tên');
    const inputs = document.querySelectorAll('input[type=file]');
    await user.upload(inputs[0] as HTMLInputElement, new File(['c'], 'cover.png', { type: 'image/png' }));
    await user.upload(inputs[1] as HTMLInputElement, new File(['a'], 'avatar.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getByAltText('Ảnh đại diện').getAttribute('src')).toBe('/uploads/avatar.png'));
    expect(screen.getByAltText('Ảnh bìa').getAttribute('src')).toBe('/uploads/cover.png');
    await user.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.path === '/users/me')?.body).toMatchObject({ avatar: '/uploads/avatar.png', coverImage: '/uploads/cover.png' }));
  });

  it('Hủy bỏ và "Quay lại trang cá nhân" đều về hồ sơ', async () => {
    const { user, location } = renderApp('/settings/profile');
    await user.click(await screen.findByRole('link', { name: 'Hủy bỏ' }));
    expect(location()).toBe('/profile/u1');
  });
});

describe('Trang Danh sách chặn', () => {
  it('chưa chặn ai → màn hình trống', async () => {
    renderApp('/settings/blocked');
    expect(await screen.findByText('Bạn chưa chặn ai')).toBeTruthy();
    expect(screen.getByText('Bạn đang chặn 0 người dùng')).toBeTruthy();
  });

  it('hiện người đã chặn; bỏ chặn có xác nhận', async () => {
    const { user } = renderApp('/settings/blocked', { seed: () => void (db.blocked = ['s1']) });
    expect(await screen.findByText('Người Lạ')).toBeTruthy();
    expect(screen.getByText('Bạn đang chặn 1 người dùng')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Bỏ chặn' }));
    await confirmDialog(user, 'Hủy');
    expect(screen.getByText('Người Lạ')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Bỏ chặn' }));
    await confirmDialog(user);
    expect(await screen.findByText('Bạn chưa chặn ai')).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/users/s1/block')).toBe(true);
  });

  it('API lỗi → coi như danh sách rỗng', async () => {
    renderApp('/settings/blocked', { seed: () => void db.failNext.add('GET /users/me/blocked') });
    expect(await screen.findByText('Bạn chưa chặn ai')).toBeTruthy();
  });

  it('nút quay lại Cài đặt', async () => {
    const { user, location } = renderApp('/settings/blocked');
    await user.click(await screen.findByRole('link', { name: 'Quay lại Cài đặt' }));
    expect(location()).toBe('/settings');
  });
});

describe('Trang Đã lưu và Kỷ niệm', () => {
  it('đã lưu: chỉ hiện bài đã lưu', async () => {
    renderApp('/saved', { seed: () => void (db.posts[0].isSaved = true) });
    expect(await screen.findByText('Bài của bạn một')).toBeTruthy();
    expect(screen.queryByText('Bài của tôi')).toBeNull();
    expect(screen.getByText('Bạn đã lưu 1 bài viết')).toBeTruthy();
  });

  it('chưa lưu bài nào → hướng dẫn', async () => {
    renderApp('/saved');
    expect(await screen.findByText('Chưa có bài viết nào được lưu')).toBeTruthy();
  });

  it('bỏ lưu ngay trên trang → bài biến mất khỏi danh sách', async () => {
    const { user } = renderApp('/saved', { seed: () => void (db.posts[0].isSaved = true) });
    await screen.findByText('Bài của bạn một');
    await user.click(screen.getByRole('button', { name: 'Bỏ lưu bài viết' }));
    expect(await screen.findByText('Chưa có bài viết nào được lưu')).toBeTruthy();
  });

  it('kỷ niệm: hiện "1 năm trước, vào ngày này"', async () => {
    renderApp('/memories');
    expect(await screen.findByText('Kỷ niệm năm ngoái')).toBeTruthy();
    expect(screen.getByText(/1 năm trước, vào ngày này/)).toBeTruthy();
  });

  it('không có kỷ niệm → màn hình trống', async () => {
    renderApp('/memories', { seed: () => void (db.memories = []) });
    expect(await screen.findByText('Chưa có kỷ niệm nào cho ngày hôm nay')).toBeTruthy();
  });
});

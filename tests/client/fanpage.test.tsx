// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, screen, waitFor, within } from './harness';
import { db, calls } from './fakeServer';
import type { Post } from '../../src/types';

// Giao diện Trang (fanpage): danh sách, tạo trang, theo dõi, đăng bài với tư cách trang, quản trị viên, cài đặt, xoá trang.
// Dữ liệu mặc định: pg1 "Trang Công Nghệ" (f1 là chủ, tôi chưa theo dõi); pg2 "Tiệm Của Tôi" (tôi là chủ, f2 quản trị viên); pg3 "Trang Đã Theo Dõi" (tôi đang theo dõi).

beforeEach(() => installBrowserStubs());

type Ctx = ReturnType<typeof renderApp>['user'];
const confirmDialog = async (user: Ctx, button = 'Đồng ý') => user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: button }));
const tab = (name: RegExp | string) => screen.findByRole('button', { name });
const pagePost = (id: string, pageId: string, content: string, author = 'f1'): Post => ({
  id, author: db.users.find((u) => u.id === author)!, content, privacy: 'public', createdAt: new Date().toISOString(), reactions: [], commentsCount: 0, sharesCount: 0,
  pageId, pageName: db.pages.find((p) => p.id === pageId)!.name,
});
const seedPosts = (...posts: Post[]) => () => void db.posts.push(...posts);
const all = (...fns: (() => void)[]) => () => fns.forEach((f) => f());
const asAdmin = (pageId: string) => () => void (db.pageAdmins[pageId] = [...(db.pageAdmins[pageId] || []), 'u1']);

describe('Danh sách trang (/pages)', () => {
  it('mặc định là "Khám phá": chỉ trang chưa theo dõi và không quản trị', async () => {
    renderApp('/pages');
    expect(await screen.findByText('Trang Công Nghệ')).toBeTruthy();
    expect(screen.queryByText('Tiệm Của Tôi')).toBeNull();
    expect(screen.queryByText('Trang Đã Theo Dõi')).toBeNull();
    const card = screen.getByText('Trang Công Nghệ').closest('a')!;
    expect(card.textContent).toContain('Doanh nghiệp · 5 người theo dõi');
    expect(card.textContent).toContain('Tin công nghệ mỗi ngày');
  });

  it('tab "Đang theo dõi" và "Trang của tôi" lọc đúng', async () => {
    const { user } = renderApp('/pages');
    await screen.findByText('Trang Công Nghệ');
    await user.click(screen.getByRole('button', { name: 'Đang theo dõi' }));
    expect(await screen.findByText('Trang Đã Theo Dõi')).toBeTruthy();
    expect(screen.queryByText('Trang Công Nghệ')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Trang của tôi' }));
    expect(await screen.findByText('Tiệm Của Tôi')).toBeTruthy();
    expect(screen.queryByText('Trang Đã Theo Dõi')).toBeNull();
  });

  it('bấm thẻ mở trang; tìm theo tên; không có → thông báo', async () => {
    const { user, location } = renderApp('/pages');
    await user.type(await screen.findByRole('searchbox', { name: 'Tìm trang' }), 'zzz');
    expect(await screen.findByText('Không tìm thấy trang "zzz"')).toBeTruthy();
    await user.clear(screen.getByRole('searchbox', { name: 'Tìm trang' }));
    await user.click((await screen.findByText('Trang Công Nghệ')).closest('a')!);
    expect(location()).toBe('/pages/pg1');
  });

  it('chưa quản trị trang nào → màn hình trống kèm nút tạo trang', async () => {
    const { user } = renderApp('/pages', { seed: () => void (db.pages = db.pages.filter((p) => p.id !== 'pg2')) });
    await user.click(await screen.findByRole('button', { name: 'Trang của tôi' }));
    expect(await screen.findByText('Bạn chưa quản trị trang nào')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tạo trang đầu tiên' }));
    expect(await screen.findByRole('dialog', { name: 'Tạo trang' })).toBeTruthy();
  });

  it('chưa theo dõi trang nào / không có trang để khám phá → thông báo đúng', async () => {
    const { user } = renderApp('/pages', { seed: () => void (db.pageFollows = []) });
    await user.click(await screen.findByRole('button', { name: 'Đang theo dõi' }));
    expect(await screen.findByText('Bạn chưa theo dõi trang nào')).toBeTruthy();
  });

  it('lỗi tải → màn hình lỗi, "Thử lại" tải lại được', async () => {
    const { user } = renderApp('/pages', { seed: () => db.failNext.add('GET /pages') });
    expect(await screen.findByText('Không tải được danh sách trang')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Trang Công Nghệ')).toBeTruthy();
  });
});

describe('Tạo trang', () => {
  it('nhập tên, danh mục, giới thiệu, website, địa chỉ → tạo → mở trang mới với nhãn chủ trang', async () => {
    const { user, location } = renderApp('/pages');
    await user.click(await screen.findByRole('button', { name: 'Tạo trang' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo trang' });
    const submit = within(dialog).getByRole('button', { name: 'Tạo trang' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Tên trang/), 'Quán Mới');
    await user.selectOptions(within(dialog).getByLabelText('Danh mục'), 'education');
    await user.type(within(dialog).getByLabelText('Giới thiệu'), 'Dạy học');
    await user.type(within(dialog).getByLabelText('Website'), 'https://quan.vn');
    await user.type(within(dialog).getByLabelText('Địa chỉ'), 'Hà Nội');
    await user.click(submit);
    await waitFor(() => expect(location()).toMatch(/^\/pages\/pg/));
    expect(await screen.findByRole('heading', { name: 'Quán Mới' })).toBeTruthy();
    expect(screen.getByText('Chủ trang')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST' && c.path === '/pages')!.body).toEqual({ name: 'Quán Mới', category: 'education', description: 'Dạy học', website: 'https://quan.vn', address: 'Hà Nội' });
  });

  it('website và địa chỉ để trống → không gửi lên server', async () => {
    const { user } = renderApp('/pages');
    await user.click(await screen.findByRole('button', { name: 'Tạo trang' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo trang' });
    await user.type(within(dialog).getByLabelText(/Tên trang/), 'Trang Gọn');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo trang' }));
    await screen.findByRole('heading', { name: 'Trang Gọn' });
    expect(calls.find((c) => c.method === 'POST' && c.path === '/pages')!.body).not.toHaveProperty('website');
  });

  it('Esc / nút đóng đóng hộp thoại; server lỗi → toast lỗi và hộp thoại vẫn mở', async () => {
    const { user } = renderApp('/pages');
    await user.click(await screen.findByRole('button', { name: 'Tạo trang' }));
    await screen.findByRole('dialog', { name: 'Tạo trang' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tạo trang' })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Tạo trang' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo trang' });
    await user.type(within(dialog).getByLabelText(/Tên trang/), 'Trang Lỗi');
    db.failNext.add('POST /pages');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo trang' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    await user.click(within(screen.getByRole('dialog', { name: 'Tạo trang' })).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tạo trang' })).toBeNull());
  });
});

describe('Trang — người xem thường', () => {
  it('hiện tên, danh mục, số người theo dõi; KHÔNG có ô đăng bài và tab Quản trị', async () => {
    renderApp('/pages/pg1');
    expect(await screen.findByRole('heading', { name: 'Trang Công Nghệ' })).toBeTruthy();
    const main = document.querySelector('main')!;
    expect(main.textContent).toContain('Doanh nghiệp');
    expect(main.textContent).toContain('5 người theo dõi');
    expect(screen.getByRole('button', { name: 'Theo dõi' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Đăng gì đó với tư cách/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quản trị' })).toBeNull();
    expect(await screen.findByText('Trang chưa có bài viết nào')).toBeTruthy();
  });

  it('Theo dõi → "Đang theo dõi" + số tăng + toast; bấm lại → bỏ theo dõi', async () => {
    const { user } = renderApp('/pages/pg1');
    await user.click(await screen.findByRole('button', { name: 'Theo dõi' }));
    expect(await screen.findByRole('button', { name: 'Đang theo dõi' })).toBeTruthy();
    expect(screen.getByText('Đã theo dõi Trang Công Nghệ.')).toBeTruthy();
    expect(document.querySelector('main')!.textContent).toContain('6 người theo dõi');
    await user.click(screen.getByRole('button', { name: 'Đang theo dõi' }));
    expect(await screen.findByRole('button', { name: 'Theo dõi' })).toBeTruthy();
    expect(screen.getByText('Đã bỏ theo dõi Trang Công Nghệ.')).toBeTruthy();
    expect(document.querySelector('main')!.textContent).toContain('5 người theo dõi');
  });

  it('theo dõi thất bại → toast lỗi, nút không đổi', async () => {
    const { user } = renderApp('/pages/pg1');
    const button = await screen.findByRole('button', { name: 'Theo dõi' });
    db.failNext.add('POST /pages/pg1/follow');
    await user.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(screen.getByRole('button', { name: 'Theo dõi' })).toBeTruthy();
  });

  it('tab Giới thiệu: mô tả, danh mục, website (liên kết), địa chỉ; trang thiếu thông tin → ghi chú', async () => {
    const { user } = renderApp('/pages/pg1');
    await user.click(await tab('Giới thiệu'));
    expect(screen.getByText('Tin công nghệ mỗi ngày')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'https://cn.example' }).getAttribute('href')).toBe('https://cn.example');
    expect(screen.queryByText('Hà Nội')).toBeNull();
  });

  it('trang không có mô tả → câu thay thế; có địa chỉ thì hiện', async () => {
    const { user } = renderApp('/pages/pg2');
    await user.click(await tab('Giới thiệu'));
    expect(screen.getByText('Trang chưa có phần giới thiệu.')).toBeTruthy();
    expect(screen.getByText('Hà Nội')).toBeTruthy();
  });

  it('bài của trang: hiện TÊN TRANG thay cho người đăng, liên kết tới trang; người xem thường không thấy "đăng bởi"', async () => {
    renderApp('/pages/pg1', { seed: seedPosts(pagePost('pp1', 'pg1', 'Tin công nghệ mới')) });
    const card = (await screen.findByText('Tin công nghệ mới')).closest('article')!;
    expect(within(card).getByRole('link', { name: 'Trang Công Nghệ' }).getAttribute('href')).toBe('/pages/pg1');
    expect(within(card).queryByText(/đăng bởi/)).toBeNull();
    expect(within(card).queryByRole('link', { name: 'Bạn Một' })).toBeNull();
  });

  it('bài của trang hiện ở bảng tin chung với tên trang, không hiện ở trang cá nhân của người đăng', async () => {
    const { user } = renderApp('/', { seed: seedPosts(pagePost('pp1', 'pg1', 'Thông báo từ trang')) });
    const card = (await screen.findByText('Thông báo từ trang')).closest('article')!;
    expect(within(card).getByRole('link', { name: 'Trang Công Nghệ' })).toBeTruthy();
    await user.click(within(card).getByRole('link', { name: 'Trang Công Nghệ' }));
    expect(await screen.findByRole('heading', { name: 'Trang Công Nghệ' })).toBeTruthy();
  });

  it('bài của trang do chính mình đăng không hiện ở trang cá nhân của mình', async () => {
    renderApp('/profile/u1', { seed: seedPosts(pagePost('pp1', 'pg2', 'Bài của trang tôi quản trị', 'u1')) });
    await screen.findByText('Bài của tôi');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Bài của trang tôi quản trị')).toBeNull();
  });

  it('trang không tồn tại → màn hình lỗi; lỗi tải bài viết → thử lại được', async () => {
    renderApp('/pages/khong-co');
    expect(await screen.findByText('Không tìm thấy trang.')).toBeTruthy();
  });

  it('lỗi tải bài viết của trang → màn hình lỗi trong tab, "Thử lại" tải lại', async () => {
    const { user } = renderApp('/pages/pg1', { seed: () => db.failNext.add('GET /pages/pg1/posts') });
    expect(await screen.findByText('Không tải được bài viết của trang')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Trang chưa có bài viết nào')).toBeTruthy();
  });

  it('bấm thông báo về trang → mở đúng trang', async () => {
    const { user, location } = renderApp('/notifications', {
      seed: () => db.notifications.unshift({ id: 'ntp', userId: 'u1', actor: db.users.find((u) => u.id === 'f1')!, type: 'system', content: 'đã thêm bạn làm quản trị viên của trang "Trang Công Nghệ".', targetId: 'pg1', targetType: 'page', isRead: false, createdAt: new Date().toISOString() }),
    });
    await user.click(await screen.findByText(/đã thêm bạn làm quản trị viên/));
    await waitFor(() => expect(location()).toBe('/pages/pg1'));
  });
});

describe('Trang — chủ trang đăng bài', () => {
  it('có ô đăng bài; hộp thoại ghi rõ "đăng lên trang", không có quyền riêng tư / gắn thẻ; bài hiện với tên trang', async () => {
    const { user } = renderApp('/pages/pg2');
    await user.click(await screen.findByRole('button', { name: /Đăng gì đó với tư cách Tiệm Của Tôi/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Đăng bài' });
    expect(within(dialog).getByRole('heading', { name: 'Đăng lên trang Tiệm Của Tôi' })).toBeTruthy();
    expect(within(dialog).getByText('🌐 Công khai · đăng với tư cách trang')).toBeTruthy();
    expect(within(dialog).queryByLabelText('Quyền riêng tư')).toBeNull();
    expect(within(dialog).queryByTitle('Gắn thẻ bạn bè')).toBeNull();
    await user.type(within(dialog).getByRole('textbox'), 'Khai trương cửa hàng');
    await user.click(within(dialog).getByRole('button', { name: 'Đăng lên trang' }));
    const card = (await screen.findByText('Khai trương cửa hàng')).closest('article')!;
    expect(within(card).getByRole('link', { name: 'Tiệm Của Tôi' })).toBeTruthy();
    expect(screen.getByText('Đã đăng bài lên trang!')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/pages/pg2/posts')).toBe(true);
  });

  it('đăng thất bại → toast lỗi', async () => {
    const { user } = renderApp('/pages/pg2');
    await user.click(await screen.findByRole('button', { name: /Đăng gì đó với tư cách/ }));
    await user.type(within(await screen.findByRole('dialog', { name: 'Đăng bài' })).getByRole('textbox'), 'x');
    db.failNext.add('POST /pages/pg2/posts');
    await user.click(screen.getByRole('button', { name: 'Đăng lên trang' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
  });

  it('quản trị viên (không phải chủ) cũng đăng được; bài của người khác có mục "Xóa khỏi trang" và ghi "đăng bởi"', async () => {
    const { user } = renderApp('/pages/pg1', { seed: all(asAdmin('pg1'), seedPosts(pagePost('pp1', 'pg1', 'Bài do chủ trang đăng'))) });
    const card = (await screen.findByText('Bài do chủ trang đăng')).closest('article')!;
    expect(within(card).getByText(/đăng bởi Bạn Một/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Đăng gì đó với tư cách/ })).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    await user.click(screen.getByText('Xóa khỏi trang'));
    await confirmDialog(user, 'Hủy');
    expect(screen.getByText('Bài do chủ trang đăng')).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    await user.click(screen.getByText('Xóa khỏi trang'));
    await confirmDialog(user);
    await waitFor(() => expect(screen.queryByText('Bài do chủ trang đăng')).toBeNull());
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/pages/pg1/posts/pp1')).toBe(true);
  });

  it('xoá bài của người khác thất bại → toast lỗi, bài vẫn còn', async () => {
    const { user } = renderApp('/pages/pg1', { seed: all(asAdmin('pg1'), seedPosts(pagePost('pp1', 'pg1', 'Bài khó xoá'))) });
    const card = (await screen.findByText('Bài khó xoá')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    db.failNext.add('DELETE /pages/pg1/posts/pp1');
    await user.click(screen.getByText('Xóa khỏi trang'));
    await confirmDialog(user);
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(screen.getByText('Bài khó xoá')).toBeTruthy();
  });

  it('bài trang không có mục "Xóa khỏi trang" với người xem thường', async () => {
    const { user } = renderApp('/pages/pg1', { seed: seedPosts(pagePost('pp1', 'pg1', 'Bài công khai')) });
    const card = (await screen.findByText('Bài công khai')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    expect(screen.queryByText('Xóa khỏi trang')).toBeNull();
  });
});

describe('Trang — quản trị', () => {
  it('chủ trang: tab Quản trị có thông tin trang, quản trị viên, người theo dõi, xoá trang', async () => {
    const { user } = renderApp('/pages/pg2');
    await user.click(await tab('Quản trị'));
    expect(await screen.findByText('Thông tin trang')).toBeTruthy();
    const admins = await screen.findByRole('list', { name: 'Danh sách quản trị viên' });
    expect(within(admins).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('Trần Xuân Hoàng'), expect.stringContaining('Bạn Hai')]);
    expect(within(admins).getByText('Chủ trang')).toBeTruthy();
    expect(screen.getByText(/Người theo dõi \(1\)/)).toBeTruthy();
    expect(await screen.findByText('Bạn Hai', { selector: 'span' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xoá trang' })).toBeTruthy();
  });

  it('sửa thông tin trang → lưu → tiêu đề cập nhật; tên quá ngắn khoá nút Lưu', async () => {
    const { user } = renderApp('/pages/pg2');
    await user.click(await tab('Quản trị'));
    const form = (await screen.findByText('Thông tin trang')).closest('section')!;
    const name = within(form).getByLabelText(/Tên trang/);
    await user.clear(name);
    await user.type(name, 'a');
    expect((within(form).getByRole('button', { name: 'Lưu thay đổi' }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(name);
    await user.type(name, 'Tiệm Đổi Tên');
    await user.selectOptions(within(form).getByLabelText('Danh mục'), 'nonprofit');
    await user.type(within(form).getByLabelText('Giới thiệu'), 'Mô tả mới');
    await user.type(within(form).getByLabelText('Website'), 'https://moi.vn');
    await user.click(within(form).getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Đã lưu thông tin trang.')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Tiệm Đổi Tên' })).toBeTruthy();
    expect(calls.find((c) => c.method === 'PATCH' && c.path === '/pages/pg2')!.body).toMatchObject({ name: 'Tiệm Đổi Tên', category: 'nonprofit', description: 'Mô tả mới', website: 'https://moi.vn' });
  });

  it('đổi ảnh trang và ảnh bìa (upload) → gửi đường dẫn mới khi lưu', async () => {
    const { user } = renderApp('/pages/pg2');
    await user.click(await tab('Quản trị'));
    const form = (await screen.findByText('Thông tin trang')).closest('section')!;
    const inputs = form.querySelectorAll('input[type=file]');
    await user.upload(inputs[0] as HTMLInputElement, new File(['x'], 'logo.png', { type: 'image/png' }));
    await user.upload(inputs[1] as HTMLInputElement, new File(['x'], 'bia.png', { type: 'image/png' }));
    await waitFor(() => expect(form.querySelector('img')).not.toBeNull());
    await user.click(within(form).getByRole('button', { name: 'Lưu thay đổi' }));
    await screen.findByText('Đã lưu thông tin trang.');
    expect(calls.find((c) => c.method === 'PATCH' && c.path === '/pages/pg2')!.body).toMatchObject({ avatar: '/uploads/logo.png', cover: '/uploads/bia.png' });
  });

  it('lưu thất bại → toast lỗi', async () => {
    const { user } = renderApp('/pages/pg2');
    await user.click(await tab('Quản trị'));
    const form = (await screen.findByText('Thông tin trang')).closest('section')!;
    db.failNext.add('PATCH /pages/pg2');
    await user.click(within(form).getByRole('button', { name: 'Lưu thay đổi' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
  });

  it('chủ trang THÊM quản trị viên: tìm người, bấm Thêm → có trong danh sách; người đã là quản trị viên không hiện trong kết quả', async () => {
    const { user } = renderApp('/pages/pg2');
    await user.click(await tab('Quản trị'));
    await user.type(await screen.findByLabelText('Thêm quản trị viên'), 'Bạn');
    const row = (await screen.findByText('Bạn Một', { selector: 'div' })).closest('li')!;
    expect(screen.queryByText('Bạn Hai', { selector: 'div' })).toBeNull(); // đã là quản trị viên
    await user.click(within(row).getByRole('button', { name: 'Thêm' }));
    expect(await screen.findByText('Đã thêm Bạn Một làm quản trị viên.')).toBeTruthy();
    const admins = screen.getByRole('list', { name: 'Danh sách quản trị viên' });
    await waitFor(() => expect(within(admins).getByText('Bạn Một')).toBeTruthy());
    expect((screen.getByLabelText('Thêm quản trị viên') as HTMLInputElement).value).toBe('');
  });

  it('tìm không ra người → thông báo', async () => {
    const { user } = renderApp('/pages/pg2');
    await user.click(await tab('Quản trị'));
    await user.type(await screen.findByLabelText('Thêm quản trị viên'), 'khongaico');
    expect(await screen.findByText('Không tìm thấy người dùng nào.')).toBeTruthy();
  });

  it('GỠ quyền quản trị viên: hỏi xác nhận; Hủy giữ nguyên; Đồng ý → biến khỏi danh sách', async () => {
    const { user } = renderApp('/pages/pg2');
    await user.click(await tab('Quản trị'));
    const admins = await screen.findByRole('list', { name: 'Danh sách quản trị viên' });
    const row = within(admins).getByText('Bạn Hai').closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Gỡ quyền' }));
    await confirmDialog(user, 'Hủy');
    expect(within(admins).getByText('Bạn Hai')).toBeTruthy();
    await user.click(within(row).getByRole('button', { name: 'Gỡ quyền' }));
    await confirmDialog(user);
    expect(await screen.findByText('Đã gỡ quyền quản trị viên của Bạn Hai.')).toBeTruthy();
    await waitFor(() => expect(within(admins).queryByText('Bạn Hai')).toBeNull());
  });

  it('quản trị viên (không phải chủ): không thêm được người khác, không có nút Xoá trang; tự "Rời vị trí" được', async () => {
    const { user } = renderApp('/pages/pg1', { seed: asAdmin('pg1') });
    await user.click(await tab('Quản trị'));
    const admins = await screen.findByRole('list', { name: 'Danh sách quản trị viên' });
    expect(screen.queryByLabelText('Thêm quản trị viên')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xoá trang' })).toBeNull();
    expect(within(admins).queryByRole('button', { name: 'Gỡ quyền' })).toBeNull();
    await user.click(within(admins).getByRole('button', { name: 'Rời vị trí' }));
    await confirmDialog(user);
    expect(await screen.findByText('Bạn đã rời vị trí quản trị viên.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Quản trị' })).toBeNull()); // mất quyền ngay
  });

  it('XOÁ TRANG: hỏi xác nhận; Hủy giữ trang; Đồng ý → về /pages, trang biến mất', async () => {
    const { user, location } = renderApp('/pages/pg2');
    await user.click(await tab('Quản trị'));
    await user.click(await screen.findByRole('button', { name: 'Xoá trang' }));
    await confirmDialog(user, 'Hủy');
    expect(db.pages.some((p) => p.id === 'pg2')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Xoá trang' }));
    await confirmDialog(user);
    await waitFor(() => expect(location()).toBe('/pages'));
    await user.click(await screen.findByRole('button', { name: 'Trang của tôi' }));
    expect(await screen.findByText('Bạn chưa quản trị trang nào')).toBeTruthy();
  });

  it('xoá trang thất bại → ở lại, toast lỗi', async () => {
    const { user, location } = renderApp('/pages/pg2');
    await user.click(await tab('Quản trị'));
    const button = await screen.findByRole('button', { name: 'Xoá trang' });
    db.failNext.add('DELETE /pages/pg2');
    await user.click(button);
    await confirmDialog(user);
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(location()).toBe('/pages/pg2');
  });

  it('menu bên trái có mục "Trang" và sáng lên khi đang ở trang của Trang', async () => {
    renderApp('/pages/pg1');
    expect((await screen.findByRole('link', { name: /^Trang$/ })).getAttribute('aria-current')).toBe('page');
  });
});

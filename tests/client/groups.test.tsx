// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, screen, waitFor, within, act, triggerInfiniteScroll } from './harness';
import { db, calls, serverEmit } from './fakeServer';
import type { Post } from '../../src/types';

// Giao diện nhóm giao lưu: danh sách, tạo nhóm, tham gia / rời, xin vào nhóm riêng tư (câu hỏi + chờ duyệt), đăng bài (kèm duyệt bài),
// quản lý thành viên (bổ nhiệm, gỡ quyền, chuyển quyền chủ nhóm, xoá), duyệt yêu cầu / bài, báo cáo, cài đặt, xoá nhóm.
// Dữ liệu mặc định (fakeServer.seedGroups): g1 công khai (tôi = chủ nhóm, f2 = quản trị viên, f1 = thành viên);
// g2 riêng tư có câu hỏi + duyệt bài (f1 = chủ, tôi CHƯA tham gia, s2 đang chờ duyệt); g3 công khai (f1 = chủ, tôi = thành viên thường).

beforeEach(() => installBrowserStubs());

type Ctx = ReturnType<typeof renderApp>['user'];
const confirmDialog = async (user: Ctx, button = 'Đồng ý') => user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: button }));
const tab = (name: RegExp | string) => screen.findByRole('button', { name });
const mainText = () => document.querySelector('main')!.textContent || '';

/** Đặt vai trò của tôi trong một nhóm TRƯỚC khi ứng dụng tải (null = chưa tham gia). */
const asRole = (groupId: string, role: 'owner' | 'admin' | 'member' | null) => () => {
  const list = db.members[groupId].filter((m) => m.user.id !== 'u1');
  if (role === 'owner') {
    list.forEach((m) => m.role === 'owner' && (m.role = 'admin'));
    db.groups.find((g) => g.id === groupId)!.ownerId = 'u1';
  }
  if (role) list.push({ user: db.me, role, status: 'active', joinedAt: new Date().toISOString() });
  db.members[groupId] = list;
};
const groupPost = (id: string, groupId: string, author: 'f1' | 'f2' | 's1' | 'u1', content: string, status: Post['groupStatus'] = 'approved'): Post => ({
  id, author: db.users.find((u) => u.id === author)!, content, privacy: 'only_me', createdAt: new Date().toISOString(), reactions: [], commentsCount: 0, sharesCount: 0,
  groupId, groupName: db.groups.find((g) => g.id === groupId)!.name, groupStatus: status,
});
/** Seed bài viết: nhận bài hoặc hàm tạo bài (hàm chạy SAU khi renderApp dựng lại db — cần khi bài dựa vào dữ liệu db như nhóm, người dùng). */
const seedPosts = (...items: (Post | (() => Post))[]) => () => void db.posts.push(...items.map((item) => (typeof item === 'function' ? item() : item)));
const all = (...fns: (() => void)[]) => () => fns.forEach((f) => f());

describe('Danh sách nhóm (/groups)', () => {
  it('"Nhóm của tôi" chỉ có nhóm đã tham gia; "Khám phá" có nhóm chưa tham gia', async () => {
    const { user } = renderApp('/groups');
    await screen.findByText('Nhóm Công Khai');
    expect(screen.getByText('Nhóm Của Bạn Một')).toBeTruthy();
    expect(screen.queryByText('Nhóm Riêng Tư')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Khám phá' }));
    expect(await screen.findByText('Nhóm Riêng Tư')).toBeTruthy();
    expect(screen.queryByText('Nhóm Công Khai')).toBeNull();
    expect(calls.some((c) => c.path.startsWith('/groups?scope=discover'))).toBe(true);
  });

  it('thẻ nhóm hiện quyền riêng tư và số thành viên; bấm vào mở trang nhóm', async () => {
    const { user, location } = renderApp('/groups');
    const card = (await screen.findByText('Nhóm Công Khai')).closest('a')!;
    expect(within(card).getByText('Nhóm công khai')).toBeTruthy();
    expect(card.textContent).toContain('3 thành viên');
    await user.click(card);
    expect(location()).toBe('/groups/g1');
    expect(await screen.findByRole('heading', { name: 'Nhóm Công Khai' })).toBeTruthy();
  });

  it('tìm nhóm theo tên; không có → thông báo; xoá ô tìm → có lại', async () => {
    const { user } = renderApp('/groups');
    await screen.findByText('Nhóm Công Khai');
    await user.type(screen.getByRole('searchbox', { name: 'Tìm nhóm' }), 'Bạn Một');
    expect(await screen.findByText('Nhóm Của Bạn Một')).toBeTruthy();
    expect(screen.queryByText('Nhóm Công Khai')).toBeNull();
    await user.clear(screen.getByRole('searchbox', { name: 'Tìm nhóm' }));
    await user.type(screen.getByRole('searchbox', { name: 'Tìm nhóm' }), 'zzzz');
    expect(await screen.findByText('Không tìm thấy nhóm "zzzz"')).toBeTruthy();
  });

  it('chưa tham gia nhóm nào → màn hình trống có nút "Khám phá nhóm"', async () => {
    const { user } = renderApp('/groups', { seed: all(asRole('g1', null), asRole('g3', null)) });
    expect(await screen.findByText('Bạn chưa tham gia nhóm nào')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Khám phá nhóm' }));
    expect(await screen.findByText('Nhóm Công Khai')).toBeTruthy();
  });

  it('khám phá không có nhóm nào → thông báo trống', async () => {
    const { user } = renderApp('/groups', { seed: () => void (db.groups = []) });
    await user.click(await screen.findByRole('button', { name: 'Khám phá' }));
    expect(await screen.findByText('Chưa có nhóm nào để khám phá')).toBeTruthy();
  });

  it('server lỗi → màn hình lỗi, "Thử lại" tải lại được', async () => {
    const { user } = renderApp('/groups', { seed: () => db.failNext.add('GET /groups') });
    expect(await screen.findByText('Không tải được danh sách nhóm')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Nhóm Công Khai')).toBeTruthy();
  });

  it('menu bên trái có mục "Nhóm" và sáng lên khi đang ở trang nhóm', async () => {
    renderApp('/groups/g1');
    const link = await screen.findByRole('link', { name: /^Nhóm$/ });
    expect(link.getAttribute('aria-current')).toBe('page');
  });
});

describe('Tạo nhóm', () => {
  it('mở hộp thoại, nhập thông tin → tạo → chuyển tới trang nhóm mới, mình là chủ nhóm', async () => {
    const { user, location } = renderApp('/groups');
    await user.click(await screen.findByRole('button', { name: 'Tạo nhóm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo nhóm' });
    const submit = within(dialog).getByRole('button', { name: 'Tạo nhóm' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Tên nhóm/), 'Hội Mới');
    await user.type(within(dialog).getByLabelText('Mô tả'), 'Mô tả nhóm mới');
    await user.type(within(dialog).getByLabelText(/Nội quy/), 'Điều một{Enter}Điều hai');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(submit);
    await waitFor(() => expect(location()).toMatch(/^\/groups\/g/));
    expect(await screen.findByRole('heading', { name: 'Hội Mới' })).toBeTruthy();
    expect(screen.getByText('Chủ nhóm')).toBeTruthy();
    const body = calls.find((c) => c.method === 'POST' && c.path === '/groups')!.body as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'Hội Mới', description: 'Mô tả nhóm mới', privacy: 'public', rules: ['Điều một', 'Điều hai'], joinQuestions: [], postApproval: true });
  });

  it('nhóm riêng tư: hiện ô câu hỏi (tối đa 3), chỉ gửi câu hỏi có nội dung', async () => {
    const { user } = renderApp('/groups');
    await user.click(await screen.findByRole('button', { name: 'Tạo nhóm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo nhóm' });
    expect(within(dialog).queryByLabelText('Câu hỏi 1')).toBeNull(); // nhóm công khai không có câu hỏi
    await user.click(within(dialog).getByRole('radio', { name: /Riêng tư/ }));
    await user.type(within(dialog).getByLabelText('Câu hỏi 1'), 'Bạn là ai?');
    expect(within(dialog).getByLabelText('Câu hỏi 3')).toBeTruthy();
    await user.type(within(dialog).getByLabelText(/Tên nhóm/), 'Nhóm Kín');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo nhóm' }));
    await screen.findByRole('heading', { name: 'Nhóm Kín' });
    expect(calls.find((c) => c.method === 'POST' && c.path === '/groups')!.body).toMatchObject({ privacy: 'private', joinQuestions: ['Bạn là ai?'] });
  });

  it('Esc hoặc bấm nút đóng → đóng hộp thoại, không tạo gì', async () => {
    const { user } = renderApp('/groups');
    await user.click(await screen.findByRole('button', { name: 'Tạo nhóm' }));
    await screen.findByRole('dialog', { name: 'Tạo nhóm' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tạo nhóm' })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Tạo nhóm' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Tạo nhóm' })).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tạo nhóm' })).toBeNull());
    expect(calls.some((c) => c.method === 'POST' && c.path === '/groups')).toBe(false);
  });

  it('server từ chối → toast lỗi, hộp thoại vẫn mở để sửa', async () => {
    const { user } = renderApp('/groups');
    await user.click(await screen.findByRole('button', { name: 'Tạo nhóm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo nhóm' });
    await user.type(within(dialog).getByLabelText(/Tên nhóm/), 'Nhóm Lỗi');
    db.failNext.add('POST /groups');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo nhóm' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(screen.getByRole('dialog', { name: 'Tạo nhóm' })).toBeTruthy();
  });
});

describe('Trang nhóm — chủ nhóm', () => {
  it('hiện tên, quyền riêng tư, số thành viên, nhãn chủ nhóm; KHÔNG có nút rời nhóm; có tab Quản trị', async () => {
    renderApp('/groups/g1');
    expect(await screen.findByRole('heading', { name: 'Nhóm Công Khai' })).toBeTruthy();
    const main = document.querySelector('main')!;
    expect(within(main).getByText('Nhóm công khai')).toBeTruthy();
    expect(within(main).getByText('3 thành viên')).toBeTruthy();
    expect(within(main).getByText('Chủ nhóm')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rời nhóm' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tham gia nhóm' })).toBeNull();
    expect(await tab(/^Quản trị/)).toBeTruthy();
  });

  it('tab Giới thiệu: mô tả, quyền riêng tư, nội quy đánh số', async () => {
    const { user } = renderApp('/groups/g1');
    await user.click(await tab('Giới thiệu'));
    expect(screen.getByText('Nơi giao lưu mở')).toBeTruthy();
    expect(screen.getByText(/Công khai — ai cũng xem được/)).toBeTruthy();
    const rules = screen.getByRole('list');
    expect(within(rules).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Tôn trọng nhau', 'Không spam']);
  });

  it('nhóm không có mô tả / nội quy → câu thay thế', async () => {
    const { user } = renderApp('/groups/g3', { seed: asRole('g3', 'owner') });
    await user.click(await tab('Giới thiệu'));
    expect(screen.getByText('Nhóm chưa có mô tả.')).toBeTruthy();
    expect(screen.getByText('Nhóm chưa đặt nội quy.')).toBeTruthy();
  });

  it('nhóm riêng tư hiển thị đúng mô tả quyền riêng tư', async () => {
    const { user } = renderApp('/groups/g2', { seed: asRole('g2', 'owner') });
    await user.click(await tab('Giới thiệu'));
    expect(screen.getByText(/Riêng tư — chỉ thành viên xem được/)).toBeTruthy();
  });

  it('nhóm chưa có bài → màn hình trống khuyến khích đăng bài', async () => {
    renderApp('/groups/g1');
    expect(await screen.findByText('Nhóm chưa có bài viết nào')).toBeTruthy();
    expect(screen.getByText(/Hãy là người đầu tiên/)).toBeTruthy();
  });

  it('đăng bài vào nhóm: hộp thoại KHÔNG có chọn quyền riêng tư / gắn thẻ; bài hiện ngay trong nhóm, KHÔNG lên bảng tin', async () => {
    const { user } = renderApp('/groups/g1');
    await user.click(await screen.findByRole('button', { name: /Viết gì đó cho nhóm Nhóm Công Khai/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Đăng bài' });
    expect(within(dialog).getByRole('heading', { name: 'Đăng vào nhóm Nhóm Công Khai' })).toBeTruthy();
    expect(within(dialog).queryByLabelText('Quyền riêng tư')).toBeNull();
    expect(within(dialog).queryByTitle('Gắn thẻ bạn bè')).toBeNull();
    await user.type(within(dialog).getByRole('textbox'), 'Chào cả nhóm');
    await user.click(within(dialog).getByRole('button', { name: 'Đăng vào nhóm' }));
    expect(await screen.findByText('Chào cả nhóm')).toBeTruthy();
    expect(screen.getByText('Đã đăng bài vào nhóm!')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/groups/g1/posts')).toBe(true);
    // Bài nhóm không lọt ra bảng tin
    await user.click(screen.getAllByRole('link', { name: /Bảng tin/ })[0]);
    await feedLoaded();
    expect(screen.queryByText('Chào cả nhóm')).toBeNull();
  });

  it('bài nhóm trong thẻ: không có Chia sẻ / Lưu / Ghim; có biểu tượng nhóm; chủ bài sửa / xoá được', async () => {
    const { user } = renderApp('/groups/g1', { seed: seedPosts(groupPost('gp1', 'g1', 'u1', 'Bài của tôi trong nhóm')) });
    const card = (await screen.findByText('Bài của tôi trong nhóm')).closest('article')!;
    expect(within(card).queryByRole('button', { name: /Chia sẻ/ })).toBeNull();
    expect(within(card).queryByRole('button', { name: /Lưu bài viết/ })).toBeNull();
    expect(within(card).getByTitle('Bài viết trong nhóm Nhóm Công Khai')).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    expect(screen.queryByText('Lưu bài viết')).toBeNull();
    expect(screen.queryByText('Ghim bài viết')).toBeNull();
    expect(screen.getByText('Chỉnh sửa bài viết')).toBeTruthy();
    await user.click(screen.getByText('Xóa bài viết'));
    await confirmDialog(user);
    await waitFor(() => expect(screen.queryByText('Bài của tôi trong nhóm')).toBeNull());
  });

  it('sửa bài nhóm: không có chọn quyền riêng tư, hiện nhãn "Bài trong nhóm"', async () => {
    const { user } = renderApp('/groups/g1', { seed: seedPosts(groupPost('gp1', 'g1', 'u1', 'Nội dung cũ')) });
    const card = (await screen.findByText('Nội dung cũ')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    await user.click(screen.getByText('Chỉnh sửa bài viết'));
    const dialog = await screen.findByRole('dialog', { name: 'Đăng bài' });
    expect(within(dialog).getByText('👥 Bài trong nhóm')).toBeTruthy();
    expect(within(dialog).queryByLabelText('Quyền riêng tư')).toBeNull();
  });

  it('chủ nhóm xoá bài của người khác bằng "Xóa khỏi nhóm" (có hỏi xác nhận); thành viên thường thì không có mục này', async () => {
    const { user } = renderApp('/groups/g1', { seed: seedPosts(groupPost('gp1', 'g1', 'f1', 'Bài của bạn một trong nhóm')) });
    const card = (await screen.findByText('Bài của bạn một trong nhóm')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    expect(screen.getByText('Báo cáo bài viết')).toBeTruthy();
    await user.click(screen.getByText('Xóa khỏi nhóm'));
    await confirmDialog(user);
    await waitFor(() => expect(screen.queryByText('Bài của bạn một trong nhóm')).toBeNull());
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/groups/g1/posts/gp1')).toBe(true);
  });

  it('quản trị viên xoá bài thất bại → toast lỗi, bài vẫn còn', async () => {
    const { user } = renderApp('/groups/g1', { seed: seedPosts(groupPost('gp1', 'g1', 'f1', 'Bài khó xoá')) });
    const card = (await screen.findByText('Bài khó xoá')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    db.failNext.add('DELETE /groups/g1/posts/gp1');
    await user.click(screen.getByText('Xóa khỏi nhóm'));
    await confirmDialog(user);
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(screen.getByText('Bài khó xoá')).toBeTruthy();
  });
});

describe('Báo cáo bài viết trong nhóm', () => {
  const seed = (role: 'member' | 'admin' = 'member') => all(asRole('g3', role), seedPosts(groupPost('gp1', 'g3', 's1', 'Bài có thể vi phạm')));

  it('thành viên báo cáo bài người khác: hộp thoại lý do → gửi → toast; bài của mình không có mục Báo cáo', async () => {
    const { user } = renderApp('/groups/g3', { seed: all(seed(), seedPosts(groupPost('gp2', 'g3', 'u1', 'Bài của tôi'))) });
    const mine = (await screen.findByText('Bài của tôi')).closest('article')!;
    await user.click(within(mine).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    expect(screen.queryByText('Báo cáo bài viết')).toBeNull();
    await user.keyboard('{Escape}');
    const card = screen.getByText('Bài có thể vi phạm').closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    await user.click(screen.getByText('Báo cáo bài viết'));
    const dialog = await screen.findByRole('dialog', { name: 'Báo cáo bài viết' });
    await user.type(within(dialog).getByLabelText('Lý do báo cáo'), 'Spam quảng cáo');
    await user.click(within(dialog).getByRole('button', { name: 'Gửi báo cáo' }));
    expect(await screen.findByText(/Đã gửi báo cáo cho quản trị viên/)).toBeTruthy();
    expect(db.reports).toHaveLength(1);
    expect(db.reports[0]).toMatchObject({ postId: 'gp1', reporterId: 'u1', reason: 'Spam quảng cáo' });
    expect(screen.queryByRole('dialog', { name: 'Báo cáo bài viết' })).toBeNull();
  });

  it('báo cáo trùng → toast lỗi của server', async () => {
    const { user } = renderApp('/groups/g3', { seed: seed() });
    db.reports.push({ id: 'rp0', groupId: 'g3', postId: 'gp1', reporterId: 'u1', reason: '' });
    const card = (await screen.findByText('Bài có thể vi phạm')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    await user.click(screen.getByText('Báo cáo bài viết'));
    await user.click(await screen.findByRole('button', { name: 'Gửi báo cáo' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Đã có lỗi xảy ra.');
  });

  it('Esc đóng hộp thoại báo cáo mà không gửi gì', async () => {
    const { user } = renderApp('/groups/g3', { seed: seed() });
    const card = (await screen.findByText('Bài có thể vi phạm')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    await user.click(screen.getByText('Báo cáo bài viết'));
    await screen.findByRole('dialog', { name: 'Báo cáo bài viết' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Báo cáo bài viết' })).toBeNull());
    expect(db.reports).toHaveLength(0);
  });

  it('quản trị viên thấy báo cáo ở tab Quản trị: Bỏ qua, hoặc Xoá bài viết (có hỏi xác nhận)', async () => {
    const { user } = renderApp('/groups/g3', {
      seed: all(seed('admin'), () => db.reports.push({ id: 'rp1', groupId: 'g3', postId: 'gp1', reporterId: 'f1', reason: 'Nội dung xấu' }, { id: 'rp2', groupId: 'g3', postId: 'gp1', reporterId: 'f2', reason: '' })),
    });
    await user.click(await tab(/^Quản trị/));
    const section = (await screen.findByText('Báo cáo từ thành viên')).closest('section')!;
    expect(await within(section).findByText('Lý do: Nội dung xấu')).toBeTruthy();
    await user.click(within(section).getAllByRole('button', { name: 'Bỏ qua' })[0]);
    expect(await screen.findByText('Đã bỏ qua báo cáo.')).toBeTruthy();
    await waitFor(() => expect(within(section).getAllByRole('button', { name: 'Bỏ qua' })).toHaveLength(1));
    await user.click(within(section).getByRole('button', { name: 'Xoá bài viết' }));
    await confirmDialog(user);
    expect(await screen.findByText('Đã xoá bài viết bị báo cáo.')).toBeTruthy();
    await waitFor(() => expect(within(section).getByText('Không có báo cáo nào cần xử lý.')).toBeTruthy());
    expect(db.posts.some((p) => p.id === 'gp1')).toBe(false);
  });
});

describe('Tham gia / rời nhóm công khai', () => {
  it('chưa tham gia: xem được bài (nhóm công khai) nhưng KHÔNG có ô đăng bài; bấm "Tham gia nhóm" → thành viên, có ô đăng bài', async () => {
    const { user } = renderApp('/groups/g1', { seed: all(asRole('g1', null), seedPosts(groupPost('gp1', 'g1', 'f1', 'Bài công khai trong nhóm'))) });
    expect(await screen.findByText('Bài công khai trong nhóm')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Viết gì đó cho nhóm/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Tham gia nhóm' }));
    expect(await screen.findByText('Bạn đã tham gia nhóm Nhóm Công Khai!')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Rời nhóm' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Viết gì đó cho nhóm/ })).toBeTruthy();
    expect(mainText()).toContain('3 thành viên'); // 2 + mình
  });

  it('rời nhóm: hỏi xác nhận; Hủy → vẫn ở lại; Đồng ý → rời, nút đổi lại thành "Tham gia nhóm"', async () => {
    const { user } = renderApp('/groups/g3');
    await user.click(await screen.findByRole('button', { name: 'Rời nhóm' }));
    await confirmDialog(user, 'Hủy');
    expect(screen.getByRole('button', { name: 'Rời nhóm' })).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/groups/g3/join')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Rời nhóm' }));
    await confirmDialog(user);
    expect(await screen.findByText('Bạn đã rời nhóm Nhóm Của Bạn Một.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Tham gia nhóm' })).toBeTruthy();
  });

  it('thành viên thường: không có tab Quản trị, không có menu quản lý thành viên', async () => {
    const { user } = renderApp('/groups/g3');
    await screen.findByRole('heading', { name: 'Nhóm Của Bạn Một' });
    expect(screen.queryByRole('button', { name: /^Quản trị/ })).toBeNull();
    expect(screen.queryByText('Chủ nhóm', { selector: 'span' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Thành viên' }));
    await within(await screen.findByRole('list', { name: 'Danh sách thành viên' })).findByText('Bạn Một');
    expect(screen.queryByRole('button', { name: /^Quản lý/ })).toBeNull();
  });

  it('chủ nhóm rời nhóm bằng API → server từ chối, toast lỗi (UI vốn không có nút)', async () => {
    renderApp('/groups/g1');
    await screen.findByRole('heading', { name: 'Nhóm Công Khai' });
    await expect(import('./fakeServer').then((m) => m.handle('DELETE', '/groups/g1/join'))).rejects.toThrow(/Chủ nhóm không thể rời nhóm/);
  });

  it('vào nhóm thất bại → toast lỗi, vẫn là người ngoài', async () => {
    const { user } = renderApp('/groups/g1', { seed: asRole('g1', null) });
    await screen.findByRole('heading', { name: 'Nhóm Công Khai' });
    db.failNext.add('POST /groups/g1/join');
    await user.click(screen.getByRole('button', { name: 'Tham gia nhóm' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(screen.getByRole('button', { name: 'Tham gia nhóm' })).toBeTruthy();
  });
});

describe('Xin vào nhóm riêng tư', () => {
  it('người ngoài thấy nhóm bị khoá: không xem được bài và danh sách thành viên', async () => {
    const { user } = renderApp('/groups/g2');
    expect(await screen.findByText('Đây là nhóm riêng tư')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xin tham gia' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thành viên' }));
    expect(await screen.findByText('Danh sách thành viên chỉ dành cho thành viên')).toBeTruthy();
    expect(calls.some((c) => c.path.startsWith('/groups/g2/members'))).toBe(false); // không gọi server khi bị khoá
  });

  it('nhóm có câu hỏi: hộp thoại bắt buộc trả lời; trả lời xong → "Đã gửi yêu cầu", đổi nút thành "Huỷ yêu cầu"', async () => {
    const { user } = renderApp('/groups/g2');
    await user.click(await screen.findByRole('button', { name: 'Xin tham gia' }));
    const dialog = await screen.findByRole('dialog', { name: 'Xin tham gia nhóm' });
    const send = within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await user.type(within(dialog).getByLabelText('Bạn là ai?'), '   ');
    expect(send.disabled).toBe(true);
    await user.clear(within(dialog).getByLabelText('Bạn là ai?'));
    await user.type(within(dialog).getByLabelText('Bạn là ai?'), 'Bạn của Hai');
    await user.click(send);
    expect(await screen.findByText(/Đã gửi yêu cầu tham gia/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Huỷ yêu cầu' })).toBeTruthy();
    expect(screen.getByText('Yêu cầu của bạn đang chờ quản trị viên duyệt.')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST' && c.path === '/groups/g2/join')!.body).toEqual({ answers: ['Bạn của Hai'] });
    expect(screen.getByText('Đây là nhóm riêng tư')).toBeTruthy(); // vẫn chưa xem được bài
  });

  it('huỷ yêu cầu đang chờ → không hỏi xác nhận, quay lại "Xin tham gia"', async () => {
    const { user } = renderApp('/groups/g2', {
      seed: () => void db.members.g2.push({ user: db.me, role: 'member', status: 'pending', joinedAt: new Date().toISOString() }),
    });
    await user.click(await screen.findByRole('button', { name: 'Huỷ yêu cầu' }));
    expect(await screen.findByText('Đã huỷ yêu cầu tham gia.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Xin tham gia' })).toBeTruthy();
  });

  it('Esc đóng hộp thoại câu hỏi mà không gửi yêu cầu', async () => {
    const { user } = renderApp('/groups/g2');
    await user.click(await screen.findByRole('button', { name: 'Xin tham gia' }));
    await screen.findByRole('dialog', { name: 'Xin tham gia nhóm' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Xin tham gia nhóm' })).toBeNull());
    expect(calls.some((c) => c.method === 'POST' && c.path === '/groups/g2/join')).toBe(false);
  });

  it('nhóm riêng tư KHÔNG có câu hỏi: xin vào gửi luôn, không hiện hộp thoại', async () => {
    const { user } = renderApp('/groups/g2', { seed: () => void (db.groups.find((g) => g.id === 'g2')!.joinQuestions = []) });
    await user.click(await screen.findByRole('button', { name: 'Xin tham gia' }));
    expect(await screen.findByRole('button', { name: 'Huỷ yêu cầu' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Xin tham gia nhóm' })).toBeNull();
  });
});

describe('Nhóm bật duyệt bài', () => {
  it('thành viên thường: có ghi chú duyệt bài; đăng bài → toast "đang chờ duyệt" và bài hiện ở mục chờ duyệt của mình', async () => {
    const { user } = renderApp('/groups/g2', { seed: asRole('g2', 'member') });
    expect(await screen.findByText('Bài viết của bạn sẽ hiện sau khi quản trị viên duyệt.')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: /Viết gì đó cho nhóm/ }));
    await user.type(within(await screen.findByRole('dialog', { name: 'Đăng bài' })).getByRole('textbox'), 'Bài cần duyệt');
    await user.click(screen.getByRole('button', { name: 'Đăng vào nhóm' }));
    expect(await screen.findByText(/đang chờ quản trị viên duyệt/)).toBeTruthy();
    expect(await screen.findByText('Bài viết của bạn đang chờ duyệt')).toBeTruthy();
    const card = screen.getByText('Bài cần duyệt').closest('article')!;
    expect(within(card).getByText(/Đang chờ duyệt/)).toBeTruthy();
    // chưa ai khác thấy: nằm trong mục "đang chờ", không có trong danh sách đã duyệt của GET approved
    expect(db.posts.find((p) => p.content === 'Bài cần duyệt')!.groupStatus).toBe('pending');
  });

  it('bài chờ duyệt không có mục Báo cáo; chủ bài vẫn xoá được', async () => {
    const { user } = renderApp('/groups/g2', { seed: all(asRole('g2', 'member'), seedPosts(groupPost('gp1', 'g2', 'u1', 'Bài đợi duyệt', 'pending'))) });
    const card = (await screen.findByText('Bài đợi duyệt')).closest('article')!;
    await user.click(within(card).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    expect(screen.queryByText('Báo cáo bài viết')).toBeNull();
    await user.click(screen.getByText('Xóa bài viết'));
    await confirmDialog(user);
    await waitFor(() => expect(screen.queryByText('Bài đợi duyệt')).toBeNull());
  });

  it('chủ nhóm / quản trị viên đăng bài thì không cần duyệt, không có ghi chú duyệt bài', async () => {
    const { user } = renderApp('/groups/g2', { seed: asRole('g2', 'admin') });
    await screen.findByRole('button', { name: /Viết gì đó cho nhóm/ });
    expect(screen.queryByText('Bài viết của bạn sẽ hiện sau khi quản trị viên duyệt.')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Viết gì đó cho nhóm/ }));
    await user.type(within(await screen.findByRole('dialog', { name: 'Đăng bài' })).getByRole('textbox'), 'Bài của admin');
    await user.click(screen.getByRole('button', { name: 'Đăng vào nhóm' }));
    expect(await screen.findByText('Đã đăng bài vào nhóm!')).toBeTruthy();
    expect(db.posts.find((p) => p.content === 'Bài của admin')!.groupStatus).toBe('approved');
  });
});

describe('Quản trị — yêu cầu tham gia, bài chờ duyệt', () => {
  const adminOfPrivate = (...extra: (() => void)[]) => all(asRole('g2', 'owner'), ...extra);

  it('hiện số việc chờ xử lý trên tab Quản trị; yêu cầu hiện kèm câu trả lời; Chấp nhận → thành viên + số giảm', async () => {
    const { user } = renderApp('/groups/g2', { seed: adminOfPrivate() });
    const adminTab = await tab(/^Quản trị/);
    expect(adminTab.textContent).toContain('1');
    await user.click(adminTab);
    const section = (await screen.findByText('Yêu cầu tham gia')).closest('section')!;
    expect(await within(section).findByText('Người Mời')).toBeTruthy();
    expect(within(section).getByText('Bạn là ai?')).toBeTruthy();
    expect(within(section).getByText('Tôi là bạn của Hai')).toBeTruthy();
    await user.click(within(section).getByRole('button', { name: 'Chấp nhận' }));
    expect(await screen.findByText('Đã chấp nhận Người Mời vào nhóm.')).toBeTruthy();
    await waitFor(() => expect(within(section).getByText('Không có yêu cầu nào đang chờ.')).toBeTruthy());
    expect(db.members.g2.find((m) => m.user.id === 's2')!.status).toBe('active');
    await user.click(screen.getByRole('button', { name: 'Thành viên' }));
    expect(await within(await screen.findByRole('list', { name: 'Danh sách thành viên' })).findByText('Người Mời')).toBeTruthy();
  });

  it('Từ chối yêu cầu → người đó bị xoá khỏi danh sách chờ', async () => {
    const { user } = renderApp('/groups/g2', { seed: adminOfPrivate() });
    await user.click(await tab(/^Quản trị/));
    const section = (await screen.findByText('Yêu cầu tham gia')).closest('section')!;
    await user.click(await within(section).findByRole('button', { name: 'Từ chối' }));
    expect(await screen.findByText('Đã từ chối Người Mời.')).toBeTruthy();
    expect(db.members.g2.some((m) => m.user.id === 's2')).toBe(false);
  });

  it('duyệt yêu cầu thất bại → toast lỗi, người đó vẫn trong danh sách chờ', async () => {
    const { user } = renderApp('/groups/g2', { seed: adminOfPrivate() });
    await user.click(await tab(/^Quản trị/));
    const section = (await screen.findByText('Yêu cầu tham gia')).closest('section')!;
    const button = await within(section).findByRole('button', { name: 'Chấp nhận' });
    db.failNext.add('POST /groups/g2/members/s2/approve');
    await user.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(within(section).getByText('Người Mời')).toBeTruthy();
  });

  it('bài chờ duyệt: Duyệt → bài hiện ở tab Bài viết; Từ chối → biến mất', async () => {
    const { user } = renderApp('/groups/g2', {
      seed: adminOfPrivate(seedPosts(groupPost('gp1', 'g2', 'f2', 'Bài chờ số một', 'pending'), groupPost('gp2', 'g2', 'f1', 'Bài chờ số hai', 'pending'))),
    });
    await user.click(await tab(/^Quản trị/));
    const section = (await screen.findByText('Bài viết chờ duyệt')).closest('section')!;
    expect(await within(section).findByText('Bài chờ số một')).toBeTruthy();
    const first = within(section).getByText('Bài chờ số một').closest('li')!;
    await user.click(within(first).getByRole('button', { name: 'Duyệt' }));
    expect(await screen.findByText('Đã duyệt bài viết.')).toBeTruthy();
    const second = (await within(section).findByText('Bài chờ số hai')).closest('li')!;
    await user.click(within(second).getByRole('button', { name: 'Từ chối' }));
    expect(await screen.findByText('Đã từ chối bài viết.')).toBeTruthy();
    await waitFor(() => expect(within(section).getByText('Không có bài viết nào đang chờ duyệt.')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Bài viết' }));
    expect(await screen.findByText('Bài chờ số một')).toBeTruthy();
    expect(screen.queryByText('Bài chờ số hai')).toBeNull();
  });

  it('bài chờ duyệt có ảnh / video hiển thị ghi chú tương ứng', async () => {
    const withMedia = { ...groupPost('gp1', 'g2', 'f2', 'Bài có ảnh', 'pending'), images: ['/a.png', '/b.png'] };
    const withVideo = { ...groupPost('gp2', 'g2', 'f1', 'Bài có video', 'pending'), video: '/v.mp4' };
    const { user } = renderApp('/groups/g2', { seed: adminOfPrivate(seedPosts(withMedia, withVideo)) });
    await user.click(await tab(/^Quản trị/));
    expect(await screen.findByText('📷 2 ảnh')).toBeTruthy();
    expect(screen.getByText('🎬 Có video')).toBeTruthy();
  });

  it('chủ nhóm xem được yêu cầu: lỗi tải danh sách → hiển thị trống thay vì treo', async () => {
    const { user } = renderApp('/groups/g2', { seed: adminOfPrivate(() => db.failNext.add('GET /groups/g2/members')) });
    await user.click(await tab(/^Quản trị/));
    const section = (await screen.findByText('Yêu cầu tham gia')).closest('section')!;
    expect(await within(section).findByText('Không có yêu cầu nào đang chờ.')).toBeTruthy();
  });
});

describe('Quản trị — thành viên (bổ nhiệm, gỡ quyền, chuyển quyền, xoá)', () => {
  const membersTab = async (user: Ctx) => {
    await user.click(await tab('Thành viên'));
    return screen.findByRole('list', { name: 'Danh sách thành viên' });
  };
  const row = (list: HTMLElement, name: string) => within(list).getByText(name).closest('li')!;

  it('danh sách xếp: chủ nhóm → quản trị viên → thành viên; có nhãn vai trò và "(bạn)"', async () => {
    const { user } = renderApp('/groups/g1');
    const list = await membersTab(user);
    await within(list).findByText('Bạn Một');
    const names = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(names[0]).toContain('Trần Xuân Hoàng');
    expect(names[0]).toContain('(bạn)');
    expect(names[0]).toContain('Chủ nhóm');
    expect(names[1]).toContain('Bạn Hai');
    expect(names[1]).toContain('Quản trị viên');
    expect(names[2]).toContain('Bạn Một');
  });

  it('chủ nhóm không có menu quản lý chính mình; có menu cho mọi người khác', async () => {
    const { user } = renderApp('/groups/g1');
    const list = await membersTab(user);
    await within(list).findByText('Bạn Một');
    expect(within(row(list, 'Trần Xuân Hoàng')).queryByRole('button', { name: /^Quản lý/ })).toBeNull();
    expect(within(row(list, 'Bạn Một')).getByRole('button', { name: 'Quản lý Bạn Một' })).toBeTruthy();
    expect(within(row(list, 'Bạn Hai')).getByRole('button', { name: 'Quản lý Bạn Hai' })).toBeTruthy();
  });

  it('BỔ NHIỆM thành viên làm quản trị viên → nhãn cập nhật; menu đổi thành "Gỡ quyền quản trị viên"', async () => {
    const { user } = renderApp('/groups/g1');
    const list = await membersTab(user);
    await within(list).findByText('Bạn Một');
    await user.click(within(row(list, 'Bạn Một')).getByRole('button', { name: 'Quản lý Bạn Một' }));
    await user.click(screen.getByText('Bổ nhiệm làm quản trị viên'));
    expect(await screen.findByText('Đã bổ nhiệm Bạn Một làm quản trị viên.')).toBeTruthy();
    await waitFor(() => expect(within(row(list, 'Bạn Một')).getByText('Quản trị viên')).toBeTruthy());
    expect(calls.find((c) => c.method === 'PATCH' && c.path === '/groups/g1/members/f1')!.body).toEqual({ role: 'admin' });
    await user.click(within(row(list, 'Bạn Một')).getByRole('button', { name: 'Quản lý Bạn Một' }));
    expect(screen.getByText('Gỡ quyền quản trị viên')).toBeTruthy();
    expect(screen.queryByText('Bổ nhiệm làm quản trị viên')).toBeNull();
  });

  it('GỠ QUYỀN quản trị viên → trở lại thành viên thường', async () => {
    const { user } = renderApp('/groups/g1');
    const list = await membersTab(user);
    await user.click(await within(list).findByRole('button', { name: 'Quản lý Bạn Hai' }));
    await user.click(screen.getByText('Gỡ quyền quản trị viên'));
    expect(await screen.findByText('Đã gỡ quyền quản trị viên của Bạn Hai.')).toBeTruthy();
    await waitFor(() => expect(within(row(list, 'Bạn Hai')).queryByText('Quản trị viên')).toBeNull());
    expect(db.members.g1.find((m) => m.user.id === 'f2')!.role).toBe('member');
  });

  it('CHUYỂN QUYỀN chủ nhóm: hỏi xác nhận; Đồng ý → mình thành quản trị viên, người kia là chủ nhóm', async () => {
    const { user } = renderApp('/groups/g1');
    const list = await membersTab(user);
    await user.click(await within(list).findByRole('button', { name: 'Quản lý Bạn Một' }));
    await user.click(screen.getByText('Chuyển quyền chủ nhóm'));
    await confirmDialog(user, 'Hủy');
    expect(db.groups.find((g) => g.id === 'g1')!.ownerId).toBe('u1');
    await user.click(within(row(list, 'Bạn Một')).getByRole('button', { name: 'Quản lý Bạn Một' }));
    await user.click(screen.getByText('Chuyển quyền chủ nhóm'));
    await confirmDialog(user);
    expect(await screen.findByText('Đã chuyển quyền chủ nhóm cho Bạn Một.')).toBeTruthy();
    await waitFor(() => expect(within(row(list, 'Bạn Một')).getByText('Chủ nhóm')).toBeTruthy());
    expect(within(row(list, 'Trần Xuân Hoàng')).getByText('Quản trị viên')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Rời nhóm' })).toBeTruthy(); // không còn là chủ → rời nhóm được
    expect(within(row(list, 'Trần Xuân Hoàng')).queryByRole('button', { name: /^Quản lý/ })).toBeNull();
  });

  it('XOÁ thành viên khỏi nhóm: hỏi xác nhận; Đồng ý → biến khỏi danh sách, số thành viên giảm', async () => {
    const { user } = renderApp('/groups/g1');
    const list = await membersTab(user);
    await user.click(await within(list).findByRole('button', { name: 'Quản lý Bạn Một' }));
    await user.click(screen.getByText('Xoá khỏi nhóm'));
    await confirmDialog(user, 'Hủy');
    expect(within(list).getByText('Bạn Một')).toBeTruthy();
    await user.click(within(row(list, 'Bạn Một')).getByRole('button', { name: 'Quản lý Bạn Một' }));
    await user.click(screen.getByText('Xoá khỏi nhóm'));
    await confirmDialog(user);
    expect(await screen.findByText('Đã xoá Bạn Một khỏi nhóm.')).toBeTruthy();
    await waitFor(() => expect(within(list).queryByText('Bạn Một')).toBeNull());
    await waitFor(() => expect(mainText()).toContain('2 thành viên'));
  });

  it('QUẢN TRỊ VIÊN (không phải chủ): chỉ quản lý được thành viên thường — không có menu cho quản trị viên khác / chủ nhóm', async () => {
    const { user } = renderApp('/groups/g1', { seed: all(asRole('g1', 'admin'), () => db.members.g1.push({ user: db.users.find((u) => u.id === 's1')!, role: 'admin', status: 'active', joinedAt: '2024-01-01' })) });
    const list = await membersTab(user);
    await within(list).findByText('Bạn Một');
    expect(within(row(list, 'Bạn Một')).getByRole('button', { name: 'Quản lý Bạn Một' })).toBeTruthy(); // thành viên thường → quản lý được
    expect(within(row(list, 'Bạn Hai')).queryByRole('button', { name: /^Quản lý/ })).toBeNull(); // quản trị viên khác
    expect(within(row(list, 'Người Lạ')).queryByRole('button', { name: /^Quản lý/ })).toBeNull();
    expect(within(row(list, 'Bạn Một')).queryByRole('button', { name: /^Quản lý/ })).not.toBeNull();
    await user.click(within(row(list, 'Bạn Một')).getByRole('button', { name: 'Quản lý Bạn Một' }));
    expect(screen.queryByText('Bổ nhiệm làm quản trị viên')).toBeNull(); // chỉ chủ nhóm mới bổ nhiệm
    expect(screen.queryByText('Chuyển quyền chủ nhóm')).toBeNull();
    expect(screen.getByText('Xoá khỏi nhóm')).toBeTruthy();
  });

  it('quản trị viên rời nhóm được; nhãn vai trò hiện đúng ở đầu trang', async () => {
    const { user } = renderApp('/groups/g1', { seed: asRole('g1', 'admin') });
    expect(await screen.findByText('Quản trị viên', { selector: 'span' })).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Rời nhóm' }));
    await confirmDialog(user);
    expect(await screen.findByText('Bạn đã rời nhóm Nhóm Công Khai.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Tham gia nhóm' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Quản trị/ })).toBeNull(); // mất quyền ngay
  });

  it('thao tác quản lý thất bại → toast lỗi, danh sách giữ nguyên', async () => {
    const { user } = renderApp('/groups/g1');
    const list = await membersTab(user);
    await user.click(await within(list).findByRole('button', { name: 'Quản lý Bạn Một' }));
    db.failNext.add('PATCH /groups/g1/members/f1');
    await user.click(screen.getByText('Bổ nhiệm làm quản trị viên'));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(within(row(list, 'Bạn Một')).queryByText('Quản trị viên')).toBeNull();
  });

  it('bấm ra ngoài đóng menu quản lý', async () => {
    const { user } = renderApp('/groups/g1');
    const list = await membersTab(user);
    await user.click(await within(list).findByRole('button', { name: 'Quản lý Bạn Một' }));
    expect(screen.getByText('Xoá khỏi nhóm')).toBeTruthy();
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByText('Xoá khỏi nhóm')).toBeNull());
  });

  it('nhóm công khai: người ngoài xem được danh sách thành viên nhưng không có menu quản lý', async () => {
    const { user } = renderApp('/groups/g1', { seed: asRole('g1', null) });
    const list = await membersTab(user);
    expect(await within(list).findByText('Bạn Một')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Quản lý/ })).toBeNull();
  });

  it('lỗi tải danh sách thành viên → màn hình lỗi, "Thử lại" tải lại được', async () => {
    const { user } = renderApp('/groups/g1');
    await screen.findByRole('heading', { name: 'Nhóm Công Khai' });
    db.failNext.add('GET /groups/g1/members');
    await user.click(await tab('Thành viên'));
    expect(await screen.findByText('Không tải được danh sách thành viên')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('list', { name: 'Danh sách thành viên' })).toBeTruthy();
  });
});

describe('Quản trị — cài đặt nhóm', () => {
  it('chủ nhóm đổi tên, mô tả, nội quy, câu hỏi, bật duyệt bài, quyền riêng tư → lưu → tiêu đề cập nhật', async () => {
    const { user } = renderApp('/groups/g1');
    await user.click(await tab(/^Quản trị/));
    const form = (await screen.findByText('Cài đặt nhóm')).closest('section')!;
    const name = within(form).getByLabelText(/Tên nhóm/);
    await user.clear(name);
    await user.type(name, 'Tên Nhóm Mới');
    await user.type(within(form).getByLabelText('Mô tả'), ' thêm');
    await user.clear(within(form).getByLabelText(/Nội quy/));
    await user.type(within(form).getByLabelText(/Nội quy/), 'Luật A{Enter}Luật B');
    await user.type(within(form).getByLabelText('Câu hỏi 1'), 'Vì sao vào?');
    await user.click(within(form).getByRole('checkbox'));
    await user.selectOptions(within(form).getByLabelText('Quyền riêng tư'), 'private');
    await user.click(within(form).getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Đã lưu cài đặt nhóm.')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Tên Nhóm Mới' })).toBeTruthy();
    const body = calls.find((c) => c.method === 'PATCH' && c.path === '/groups/g1')!.body as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'Tên Nhóm Mới', privacy: 'private', rules: ['Luật A', 'Luật B'], joinQuestions: ['Vì sao vào?'], postApproval: true });
    expect(mainText()).toContain('Nhóm riêng tư');
  });

  it('tên quá ngắn → nút Lưu bị khoá', async () => {
    const { user } = renderApp('/groups/g1');
    await user.click(await tab(/^Quản trị/));
    const form = (await screen.findByText('Cài đặt nhóm')).closest('section')!;
    await user.clear(within(form).getByLabelText(/Tên nhóm/));
    await user.type(within(form).getByLabelText(/Tên nhóm/), 'a');
    expect((within(form).getByRole('button', { name: 'Lưu thay đổi' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('quản trị viên (không phải chủ): ô quyền riêng tư bị khoá + ghi chú; không có nút Xoá nhóm; không gửi trường privacy', async () => {
    const { user } = renderApp('/groups/g1', { seed: asRole('g1', 'admin') });
    await user.click(await tab(/^Quản trị/));
    const form = (await screen.findByText('Cài đặt nhóm')).closest('section')!;
    expect((within(form).getByLabelText('Quyền riêng tư') as HTMLSelectElement).disabled).toBe(true);
    expect(within(form).getByText('Chỉ chủ nhóm mới đổi được quyền riêng tư.')).toBeTruthy();
    expect(within(form).queryByRole('button', { name: 'Xoá nhóm' })).toBeNull();
    await user.type(within(form).getByLabelText('Mô tả'), '!');
    await user.click(within(form).getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Đã lưu cài đặt nhóm.')).toBeTruthy();
    expect(calls.find((c) => c.method === 'PATCH' && c.path === '/groups/g1')!.body).not.toHaveProperty('privacy');
  });

  it('lưu thất bại → toast lỗi', async () => {
    const { user } = renderApp('/groups/g1');
    await user.click(await tab(/^Quản trị/));
    const form = (await screen.findByText('Cài đặt nhóm')).closest('section')!;
    db.failNext.add('PATCH /groups/g1');
    await user.click(within(form).getByRole('button', { name: 'Lưu thay đổi' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
  });

  it('đổi ảnh nhóm và ảnh bìa (upload) → gửi đường dẫn ảnh mới khi lưu', async () => {
    const { user } = renderApp('/groups/g1');
    await user.click(await tab(/^Quản trị/));
    const form = (await screen.findByText('Cài đặt nhóm')).closest('section')!;
    const inputs = form.querySelectorAll('input[type=file]');
    await user.upload(inputs[0] as HTMLInputElement, new File(['x'], 'avatar.png', { type: 'image/png' }));
    await user.upload(inputs[1] as HTMLInputElement, new File(['x'], 'cover.png', { type: 'image/png' }));
    await waitFor(() => expect(form.querySelector('img')).not.toBeNull());
    await user.click(within(form).getByRole('button', { name: 'Lưu thay đổi' }));
    await screen.findByText('Đã lưu cài đặt nhóm.');
    expect(calls.find((c) => c.method === 'PATCH' && c.path === '/groups/g1')!.body).toMatchObject({ avatar: '/uploads/avatar.png', cover: '/uploads/cover.png' });
    expect(document.querySelector('img[src="/uploads/cover.png"]')).not.toBeNull();
  });

  it('XOÁ NHÓM: hỏi xác nhận; Hủy giữ nhóm; Đồng ý → về /groups và nhóm biến mất', async () => {
    const { user, location } = renderApp('/groups/g1');
    await user.click(await tab(/^Quản trị/));
    const form = (await screen.findByText('Cài đặt nhóm')).closest('section')!;
    await user.click(within(form).getByRole('button', { name: 'Xoá nhóm' }));
    await confirmDialog(user, 'Hủy');
    expect(db.groups.some((g) => g.id === 'g1')).toBe(true);
    await user.click(within(form).getByRole('button', { name: 'Xoá nhóm' }));
    await confirmDialog(user);
    await waitFor(() => expect(location()).toBe('/groups'));
    expect(await screen.findByText('Nhóm Của Bạn Một')).toBeTruthy();
    expect(screen.queryByText('Nhóm Công Khai')).toBeNull();
  });

  it('xoá nhóm thất bại → ở lại trang nhóm, toast lỗi', async () => {
    const { user, location } = renderApp('/groups/g1');
    await user.click(await tab(/^Quản trị/));
    const form = (await screen.findByText('Cài đặt nhóm')).closest('section')!;
    db.failNext.add('DELETE /groups/g1');
    await user.click(within(form).getByRole('button', { name: 'Xoá nhóm' }));
    await confirmDialog(user);
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(location()).toBe('/groups/g1');
  });
});

describe('Điều hướng, lỗi, thông báo, realtime', () => {
  it('nhóm không tồn tại → màn hình lỗi với câu của server; "Thử lại" gọi lại', async () => {
    const { user } = renderApp('/groups/khong-co');
    expect(await screen.findByText('Không tìm thấy nhóm.')).toBeTruthy();
    expect(screen.getByText(/Nhóm có thể đã bị xoá/)).toBeTruthy();
    const before = calls.length;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
  });

  it('lỗi mạng khi tải nhóm (không phải lỗi API) → vẫn hiện màn hình lỗi chung', async () => {
    renderApp('/groups/g1', { seed: () => db.failNext.add('GET /groups/g1') });
    expect(await screen.findByText('Lỗi máy chủ giả lập')).toBeTruthy();
  });

  it('chuyển giữa 2 nhóm: tải lại dữ liệu, về tab Bài viết', async () => {
    const { user } = renderApp('/groups');
    await user.click((await screen.findByText('Nhóm Công Khai')).closest('a')!);
    await user.click(await tab('Giới thiệu'));
    await screen.findByText('Nơi giao lưu mở');
    await user.click(screen.getAllByRole('link', { name: /^Nhóm$/ })[0]);
    await user.click((await screen.findByText('Nhóm Của Bạn Một')).closest('a')!);
    expect(await screen.findByRole('heading', { name: 'Nhóm Của Bạn Một' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bài viết' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('bấm thông báo về nhóm → mở đúng trang nhóm', async () => {
    const { user, location } = renderApp('/notifications', {
      seed: () => db.notifications.unshift({ id: 'ng1', userId: 'u1', actor: db.users.find((u) => u.id === 'f1')!, type: 'system', content: 'đã xin tham gia nhóm "Nhóm Công Khai".', targetId: 'g1', targetType: 'group', isRead: false, createdAt: new Date().toISOString() }),
    });
    await user.click(await screen.findByText(/đã xin tham gia nhóm/));
    await waitFor(() => expect(location()).toBe('/groups/g1'));
    expect(await screen.findByRole('heading', { name: 'Nhóm Công Khai' })).toBeTruthy();
  });

  it('realtime: bài mới của thành viên khác hiện ngay trong trang nhóm; bài bị xoá biến mất', async () => {
    renderApp('/groups/g1');
    await screen.findByText('Nhóm chưa có bài viết nào');
    act(() => serverEmit('post:new', { post: groupPost('rt1', 'g1', 'f1', 'Bài realtime trong nhóm') }));
    expect(await screen.findByText('Bài realtime trong nhóm')).toBeTruthy();
    act(() => serverEmit('post:delete', { postId: 'rt1' }));
    await waitFor(() => expect(screen.queryByText('Bài realtime trong nhóm')).toBeNull());
  });

  it('realtime: bài nhóm đến qua socket KHÔNG hiện ở bảng tin chung', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('post:new', { post: groupPost('rt2', 'g1', 'f1', 'Bài nhóm không được lên bảng tin') }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Bài nhóm không được lên bảng tin')).toBeNull();
  });

  it('bài nhóm không hiện trên trang cá nhân của tác giả', async () => {
    renderApp('/profile/u1', { seed: seedPosts(groupPost('gp9', 'g1', 'u1', 'Bài trong nhóm của tôi')) });
    await screen.findByText('Bài của tôi');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Bài trong nhóm của tôi')).toBeNull();
  });

  it('bài chờ duyệt vừa được duyệt (realtime post:new bản đã duyệt) → tác giả thấy bài ở danh sách chính, mất nhãn "Đang chờ duyệt"', async () => {
    renderApp('/groups/g2', { seed: all(asRole('g2', 'member'), seedPosts(() => groupPost('gp1', 'g2', 'u1', 'Bài vừa được duyệt', 'pending'))) });
    expect(await screen.findByText('Bài viết của bạn đang chờ duyệt')).toBeTruthy();
    expect(screen.getByText(/Đang chờ duyệt/, { selector: 'span' })).toBeTruthy();
    act(() => serverEmit('post:new', { post: groupPost('gp1', 'g2', 'u1', 'Bài vừa được duyệt', 'approved') }));
    await waitFor(() => expect(screen.queryByText('Bài viết của bạn đang chờ duyệt')).toBeNull());
    expect(screen.queryByText(/Đang chờ duyệt/, { selector: 'span' })).toBeNull();
    expect(screen.getByText('Bài vừa được duyệt')).toBeTruthy();
  });

  it('cuộn vô hạn bảng tin KHÔNG đếm bài nhóm đang nằm chung danh sách (skip chỉ tính bài thuộc bảng tin)', async () => {
    const feedPosts = Array.from({ length: 25 }, (_, i) => () => ({ ...groupPost(`np${i}`, 'g1', 'f1', `Bài bảng tin ${i}`), groupId: undefined, groupName: undefined, groupStatus: undefined, privacy: 'public' as const }));
    const { user } = renderApp('/groups/g1', { seed: seedPosts(() => groupPost('gA', 'g1', 'f1', 'Bài nhóm A'), () => groupPost('gB', 'g1', 'f1', 'Bài nhóm B'), ...feedPosts) });
    await screen.findByText('Bài nhóm A'); // bài nhóm đã nằm trong danh sách chung
    await user.click(screen.getAllByRole('link', { name: /Bảng tin/ })[0]);
    await feedLoaded().catch(() => undefined);
    await screen.findByText('Bài bảng tin 0');
    await triggerInfiniteScroll();
    await waitFor(() => expect(calls.some((c) => c.path.startsWith('/posts?limit=20&skip='))).toBe(true));
    expect(calls.find((c) => c.path.startsWith('/posts?limit=20&skip='))!.path).toBe('/posts?limit=20&skip=20'); // không phải 22 (20 + 2 bài nhóm)
  });

  it('bấm thông báo về bài NHÓM → mở trang nhóm (không về bảng tin); về REEL → mở mục Reels', async () => {
    const notif = (id: string, targetId: string, content: string) => db.notifications.unshift({ id, userId: 'u1', actor: db.users.find((u) => u.id === 'f1')!, type: 'like', content, targetId, targetType: 'post', isRead: false, createdAt: new Date().toISOString() });
    const first = renderApp('/notifications', { seed: all(seedPosts(() => groupPost('gpn', 'g1', 'u1', 'Bài nhóm có thông báo')), () => notif('ngx', 'gpn', 'đã thả cảm xúc ❤️ về bài NHÓM của bạn')) });
    await first.user.click(await screen.findByText(/về bài NHÓM của bạn/));
    await waitFor(() => expect(first.location()).toBe('/groups/g1'));
    first.unmount();

    const second = renderApp('/notifications', { seed: () => notif('nrx', 'rl1', 'đã thả cảm xúc ❤️ về REEL của bạn') });
    await second.user.click(await screen.findByText(/về REEL của bạn/));
    await waitFor(() => expect(second.location()).toBe('/reels?reel=rl1'));
  });

  it('lỗi tải bài viết của nhóm → màn hình lỗi trong tab, "Thử lại" tải lại', async () => {
    const { user } = renderApp('/groups/g1', { seed: () => db.failNext.add('GET /groups/g1/posts') });
    expect(await screen.findByText('Không tải được bài viết của nhóm')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Nhóm chưa có bài viết nào')).toBeTruthy();
  });

  it('menu tài khoản trên điện thoại có mục "Nhóm"', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    expect(within(document.querySelector('header')!).getByRole('link', { name: 'Nhóm' })).toBeTruthy();
  });
});

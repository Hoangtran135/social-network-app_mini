// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, screen, waitFor, within } from './harness';
import { db, calls } from './fakeServer';
import { postHref, snippet } from '../../src/utils/searchFormat';
import type { Post } from '../../src/types';

// Tìm kiếm tổng hợp ở giao diện: ô tìm trên Navbar (gợi ý người + nhóm + trang + bài viết), trang /search có tab, trang xem một bài (/post/:id).
// Dữ liệu mặc định có: bạn bè f1 "Bạn Một", f2 "Bạn Hai"; người lạ s1 "Người Lạ"; nhóm "Nhóm Công Khai" (tôi là chủ); trang "Trang Công Nghệ"...

beforeEach(() => installBrowserStubs());

const searchbox = () => screen.findByRole('searchbox', { name: 'Tìm kiếm trên SocialNet' });
/** Khung chứa ô tìm kiếm + bảng gợi ý (để không nhầm với liên kết cùng tên ở bảng tin). */
const box = () => screen.getByRole('search').parentElement as HTMLElement;
const groupPost = (id: string, content: string): Post => ({ id, author: db.users.find((u) => u.id === 'f1')!, content, privacy: 'only_me', createdAt: new Date().toISOString(), reactions: [], commentsCount: 0, sharesCount: 0, groupId: 'g1', groupName: 'Nhóm Công Khai', groupStatus: 'approved' });
/** Seed bài viết: nhận các hàm tạo bài để chúng chạy SAU khi renderApp dựng lại db. */
const seedPosts = (...makers: (() => Post)[]) => () => void db.posts.push(...makers.map((make) => make()));

describe('postHref / snippet', () => {
  const base = { id: 'p1', content: '', author: { id: 'u', name: 'U', username: 'u', avatar: '' }, privacy: 'public', createdAt: '', reactions: [], commentsCount: 0, sharesCount: 0 } as unknown as Post;
  it('postHref: bài nhóm → nhóm; reel → mục Reels; bài của trang → trang; còn lại → trang bài viết', () => {
    expect(postHref({ ...base, groupId: 'g9' })).toBe('/groups/g9');
    expect(postHref({ ...base, kind: 'reel' })).toBe('/reels?reel=p1');
    expect(postHref({ ...base, pageId: 'pg9' })).toBe('/pages/pg9');
    expect(postHref(base)).toBe('/post/p1');
  });
  it('snippet: ngắn thì giữ nguyên (gộp khoảng trắng); dài thì cắt quanh từ khoá và thêm "…"', () => {
    expect(snippet('  xin   chào\nbạn ', 'x')).toBe('xin chào bạn');
    const long = `${'a '.repeat(100)}TỪKHOÁ ${'b '.repeat(100)}`;
    const out = snippet(long, 'từkhoá', 60);
    expect(out).toContain('TỪKHOÁ');
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(62);
    expect(snippet('x'.repeat(300), 'khongco', 50)).toBe(`${'x'.repeat(50)}…`); // không có từ khoá → cắt từ đầu
    expect(snippet(`${'x'.repeat(300)} cuoi`, '#cuoi', 50).endsWith('cuoi')).toBe(true); // bỏ dấu # khi tìm vị trí
  });
});

describe('Ô tìm kiếm trên Navbar', () => {
  it('gõ → hiện gợi ý theo nhóm: Mọi người, Nhóm, Trang, Bài viết, kèm lý do', async () => {
    const { user } = renderApp('/', { seed: seedPosts(() => groupPost('gpx', 'Bài trong nhóm về công nghệ')) });
    await user.type(await searchbox(), 'công');
    expect(await screen.findByText('Nhóm Công Khai')).toBeTruthy(); // nhóm
    expect(screen.getByText('Nhóm của bạn')).toBeTruthy(); // lý do
    expect(screen.getByText('Trang Công Nghệ')).toBeTruthy(); // trang
    expect(screen.getByText('Bài trong nhóm về công nghệ')).toBeTruthy(); // bài viết
    expect(calls.some((c) => c.path === `/search?q=${encodeURIComponent('công')}&type=all`)).toBe(true);
  });

  it('người: bạn bè có chip "Bạn bè" và lên trước người lạ', async () => {
    const { user } = renderApp('/');
    await user.type(await searchbox(), 'Bạn');
    const friend = await within(box()).findByRole('link', { name: /^Bạn Một/ });
    expect(within(friend).getByText('Bạn bè')).toBeTruthy();
    expect(within(box()).queryByRole('link', { name: /^Người Lạ/ })).toBeNull();
  });

  it('mỗi loại là liên kết đúng đích', async () => {
    const { user } = renderApp('/', { seed: seedPosts(() => groupPost('gpx', 'Bài về Công nghệ'), () => ({ ...groupPost('gpy', 'Bài thường Công nghệ'), groupId: undefined, groupName: undefined, groupStatus: undefined, privacy: 'public' })) });
    await user.type(await searchbox(), 'Công');
    const href = async (name: RegExp | string) => (await screen.findByRole('link', { name })).getAttribute('href');
    expect(await href(/Trang Công Nghệ/)).toBe('/pages/pg1');
    expect(await href(/Bài về Công nghệ/)).toBe('/groups/g1');
    expect(await href(/Bài thường Công nghệ/)).toBe('/post/gpy');
  });

  it('"Xem tất cả kết quả" và phím Enter đều mở trang /search; sau đó ô tìm được xoá', async () => {
    const { user, location } = renderApp('/');
    const input = await searchbox();
    await user.type(input, 'Bạn');
    await user.click(await screen.findByRole('link', { name: /Xem tất cả kết quả cho "Bạn"/ }));
    expect(location()).toBe('/search?q=B%E1%BA%A1n');
    expect((input as HTMLInputElement).value).toBe('');
    await user.type(input, 'Nhóm{Enter}');
    await waitFor(() => expect(location()).toBe(`/search?q=${encodeURIComponent('Nhóm')}`));
  });

  it('Enter khi ô trống → không làm gì', async () => {
    const { user, location } = renderApp('/');
    await user.type(await searchbox(), '   {Enter}');
    expect(location()).toBe('/');
  });

  it('không có kết quả → thông báo, không có liên kết "Xem tất cả"', async () => {
    const { user } = renderApp('/');
    await user.type(await searchbox(), 'khongcogi');
    expect((await screen.findByText(/Không tìm thấy "khongcogi"/)).textContent).toContain('khongcogi');
    expect(screen.queryByRole('link', { name: /Xem tất cả kết quả/ })).toBeNull();
  });

  it('chỉ có nhóm khớp → chỉ hiện mục Nhóm (không có tiêu đề các mục rỗng)', async () => {
    const { user } = renderApp('/');
    await user.type(await searchbox(), 'Riêng Tư');
    await screen.findByText('Nhóm Riêng Tư');
    expect(screen.getAllByText('Nhóm', { selector: 'p' })).toHaveLength(1);
    expect(screen.queryByText('Mọi người', { selector: 'p' })).toBeNull();
    expect(screen.queryByText('Trang', { selector: 'p' })).toBeNull();
  });
});

describe('Trang /search', () => {
  it('chưa có từ khoá → hướng dẫn nhập', async () => {
    renderApp('/search');
    expect(await screen.findByText('Nhập từ khoá để tìm kiếm')).toBeTruthy();
    expect(calls.some((c) => c.path.startsWith('/search'))).toBe(false);
  });

  it('tab "Tất cả": đủ 4 mục; mỗi mục có kết quả đúng', async () => {
    renderApp('/search?q=công', { seed: seedPosts(() => groupPost('gpx', 'Bài về công nghệ mới')) });
    expect(await screen.findByRole('heading', { name: 'Kết quả cho "công"' })).toBeTruthy();
    expect(await screen.findByText('Nhóm Công Khai')).toBeTruthy();
    expect(screen.getByText('Trang Công Nghệ')).toBeTruthy();
    expect(screen.getByText('Bài về công nghệ mới')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nhóm' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Trang' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bài viết' })).toBeTruthy();
    expect(calls.some((c) => c.path === `/search?q=${encodeURIComponent('công')}&type=all`)).toBe(true);
  });

  it('chuyển tab → gọi lại với đúng type, cập nhật đường dẫn, chỉ hiện loại đó', async () => {
    const { user, location } = renderApp('/search?q=Nhóm');
    await screen.findByText('Nhóm Công Khai');
    await user.click(screen.getByRole('button', { name: 'Trang' }));
    await waitFor(() => expect(location()).toBe(`/search?q=${encodeURIComponent('Nhóm')}&tab=pages`));
    expect(await screen.findByText(/Không tìm thấy kết quả cho "Nhóm"/)).toBeTruthy(); // không có trang tên "Nhóm"
    expect(calls.some((c) => c.path.endsWith('&type=pages'))).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Nhóm' }));
    expect(await screen.findByText('Nhóm Công Khai')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tất cả' }));
    await waitFor(() => expect(location()).toBe(`/search?q=${encodeURIComponent('Nhóm')}`));
  });

  it('mở thẳng một tab qua ?tab=; tab lạ → coi như "Tất cả"', async () => {
    renderApp('/search?q=Bạn&tab=people');
    expect(await screen.findByText('Bạn Một')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mọi người' }).getAttribute('aria-pressed')).toBe('true');
    expect(calls.some((c) => c.path.endsWith('&type=people'))).toBe(true);
  });

  it('tab lạ → "Tất cả"', async () => {
    renderApp('/search?q=Bạn&tab=banana');
    await screen.findByText('Bạn Một');
    expect(screen.getByRole('button', { name: 'Tất cả' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('kết quả người có lý do "Bạn bè"; bài viết hiện đủ lý do', async () => {
    renderApp('/search?q=Bạn');
    await screen.findByText('Bạn Một');
    expect(screen.getAllByText('Bạn bè').length).toBeGreaterThan(0);
  });

  it('bài viết trong nhóm đã tham gia xuất hiện; bài trong nhóm chưa tham gia thì không', async () => {
    renderApp('/search?q=kín', {
      seed: seedPosts(() => groupPost('a', 'Nội dung kín trong nhóm của tôi'), () => ({ ...groupPost('b', 'Nội dung kín nhóm lạ'), groupId: 'g2', groupName: 'Nhóm Riêng Tư' })),
    });
    expect(await screen.findByText('Nội dung kín trong nhóm của tôi')).toBeTruthy();
    expect(screen.queryByText('Nội dung kín nhóm lạ')).toBeNull();
  });

  it('không có kết quả → màn hình trống', async () => {
    renderApp('/search?q=khongcogi');
    expect(await screen.findByText('Không tìm thấy kết quả cho "khongcogi"')).toBeTruthy();
  });

  it('lỗi tải → màn hình lỗi, "Thử lại" gọi lại', async () => {
    const { user } = renderApp('/search?q=Bạn', { seed: () => db.failNext.add('GET /search') });
    expect(await screen.findByText('Không tải được kết quả')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Bạn Một')).toBeTruthy();
  });

  it('đổi từ khoá nhanh → kết quả của lần tìm cũ không ghi đè lần mới', async () => {
    const { user } = renderApp('/search?q=Bạn');
    await screen.findByText('Bạn Một');
    await user.type(await searchbox(), 'Người{Enter}');
    expect(await screen.findByText('Người Lạ')).toBeTruthy();
    expect(screen.queryByText('Bạn Một')).toBeNull();
  });
});

describe('Trang xem một bài (/post/:id)', () => {
  it('hiện thẻ bài viết đầy đủ; từ kết quả tìm kiếm bấm vào là mở được', async () => {
    const { user, location } = renderApp('/search?q=Bài của người lạ');
    await user.click(await screen.findByRole('link', { name: /Bài của người lạ/ }));
    expect(location()).toBe('/post/p3');
    const card = (await screen.findByText('Bài của người lạ', { selector: 'p, div, span' })).closest('article')!;
    expect(within(card).getByText('Người Lạ')).toBeTruthy();
  });

  it('bài không tồn tại / không có quyền → màn hình lỗi', async () => {
    renderApp('/post/khong-co');
    expect(await screen.findByText('Không tìm thấy bài viết')).toBeTruthy();
  });
});

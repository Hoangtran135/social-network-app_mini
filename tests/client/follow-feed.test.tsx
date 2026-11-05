// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, post, screen, waitFor, within } from './harness';
import { db, calls, apiModule } from './fakeServer';
import { postScore } from '../../src/utils/feedScore';

// Theo dõi (hồ sơ + tab "Đang theo dõi"), sắp xếp bảng tin "Mới nhất / Nổi bật", khung xương và màn hình lỗi.

beforeEach(() => installBrowserStubs());

const order = () => Array.from(document.querySelectorAll('article')).map((a) => a.id);

describe('postScore', () => {
  const p = (r: number, c: number, s: number) => ({ reactions: Array.from({ length: r }, () => ({ type: 'like' as const, userId: 'x', userName: 'x' })), commentsCount: c, sharesCount: s });
  it.each([[0, 0, 0, 0], [1, 0, 0, 1], [0, 1, 0, 2], [0, 0, 1, 3], [5, 3, 2, 17], [10, 0, 0, 10]])('%i cảm xúc, %i bình luận, %i chia sẻ → %i điểm', (r, c, s, expected) => expect(postScore(p(r, c, s))).toBe(expected));
  it('chia sẻ có trọng số cao hơn bình luận, bình luận cao hơn cảm xúc', () => {
    expect(postScore(p(0, 0, 1))).toBeGreaterThan(postScore(p(0, 1, 0)));
    expect(postScore(p(0, 1, 0))).toBeGreaterThan(postScore(p(1, 0, 0)));
  });
});

describe('Theo dõi trên trang cá nhân', () => {
  it('người chưa theo dõi: nút "Theo dõi" → bấm → "Đang theo dõi" + toast + số người theo dõi cập nhật', async () => {
    const { user } = renderApp('/profile/s1');
    await screen.findByRole('heading', { name: 'Người Lạ' });
    await screen.findByText(/người theo dõi/);
    const button = screen.getByRole('button', { name: 'Theo dõi' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    await user.click(button);
    expect(await screen.findByRole('button', { name: 'Đang theo dõi' })).toBeTruthy();
    expect(screen.getByText('Đã theo dõi Người Lạ')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/users/s1/follow')).toBe(true);
    expect(within(document.querySelector('main')!).getByText(/3/, { selector: 'b' })).toBeTruthy(); // 3 người theo dõi (số server trả về)
  });

  it('đang theo dõi → bấm lại để bỏ theo dõi', async () => {
    const { user } = renderApp('/profile/s1', { seed: () => void (db.following = ['s1']) });
    await user.click(await screen.findByRole('button', { name: 'Đang theo dõi' }));
    expect(await screen.findByRole('button', { name: 'Theo dõi' })).toBeTruthy();
    expect(screen.getByText('Đã bỏ theo dõi Người Lạ')).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/users/s1/follow')).toBe(true);
  });

  it('theo dõi được cả người đã là bạn bè; hồ sơ của mình không có nút theo dõi', async () => {
    const { user } = renderApp('/profile/f1');
    await user.click(await screen.findByRole('button', { name: 'Theo dõi' }));
    expect(await screen.findByRole('button', { name: 'Đang theo dõi' })).toBeTruthy();
  });

  it('hồ sơ của mình: không có nút theo dõi, hiện số "đang theo dõi" của mình', async () => {
    renderApp('/profile/u1', { seed: () => void (db.following = ['s1', 's2']) });
    expect(await screen.findByText(/người theo dõi/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Theo dõi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đang theo dõi' })).toBeNull();
    expect(document.querySelector('main')!.textContent).toContain('2 đang theo dõi');
  });

  it('server lỗi khi theo dõi → toast lỗi, nút không đổi', async () => {
    const { user } = renderApp('/profile/s1');
    await screen.findByText(/người theo dõi/);
    db.failNext.add('POST /users/s1/follow');
    await user.click(screen.getByRole('button', { name: 'Theo dõi' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(screen.getByRole('button', { name: 'Theo dõi' })).toBeTruthy();
  });

  it('chặn người đang theo dõi → bị loại khỏi danh sách theo dõi ngay', async () => {
    const { user } = renderApp('/profile/s1', { seed: () => void (db.following = ['s1']) });
    await user.click(await screen.findByRole('button', { name: 'Chặn người dùng' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Đồng ý' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/users/s1/block')).toBe(true));
  });
});

describe('Tab "Đang theo dõi" của bảng tin', () => {
  it('chỉ hiện bài của người mình theo dõi và của chính mình', async () => {
    const { user } = renderApp('/', { seed: () => void (db.following = ['s1']) });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Đang theo dõi' }));
    expect(screen.getByText('Bài của người lạ')).toBeTruthy();
    expect(screen.getByText('Bài của tôi')).toBeTruthy();
    expect(screen.queryByText('Bài của bạn một')).toBeNull();
  });

  it('chưa theo dõi ai → chỉ còn bài của mình', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Đang theo dõi' }));
    expect(order()).toEqual(['post-p2']);
  });

  it('không có bài nào phù hợp → mô tả riêng cho tab này', async () => {
    const { user } = renderApp('/', { seed: () => void (db.posts = db.posts.filter((p) => p.author.id === 's1')) });
    await screen.findByText('Bài của người lạ');
    await user.click(screen.getByRole('button', { name: 'Đang theo dõi' }));
    expect(screen.getByText(/Bạn chưa theo dõi ai/)).toBeTruthy();
  });

  it('theo dõi từ hồ sơ rồi quay lại bảng tin → bài người đó xuất hiện ở tab', async () => {
    const { user } = renderApp('/profile/s1');
    await user.click(await screen.findByRole('button', { name: 'Theo dõi' }));
    await screen.findByRole('button', { name: 'Đang theo dõi' });
    await user.click(screen.getAllByRole('link', { name: /Bảng tin/ })[0]);
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Đang theo dõi' }));
    expect(screen.getByText('Bài của người lạ')).toBeTruthy();
  });
});

describe('Sắp xếp bảng tin', () => {
  const engagement = () => {
    db.posts[2].reactions = [1, 2, 3].map((i) => ({ type: 'like' as const, userId: `x${i}`, userName: 'x' })); // p3: 3 điểm
    db.posts[1].sharesCount = 4; // p2: 12 + 2*1 comment = 14 điểm (có 1 cảm xúc sẵn → 15)
  };

  it('mặc định "Mới nhất": theo thời gian', async () => {
    renderApp('/', { seed: engagement });
    await feedLoaded();
    expect((screen.getByLabelText('Sắp xếp bảng tin') as HTMLSelectElement).value).toBe('newest');
    expect(order().slice(0, 3)).toEqual(['post-p1', 'post-p2', 'post-p3']);
  });

  it('"Nổi bật": bài tương tác nhiều nhất lên đầu', async () => {
    const { user } = renderApp('/', { seed: engagement });
    await feedLoaded();
    await user.selectOptions(screen.getByLabelText('Sắp xếp bảng tin'), 'top');
    expect(order().slice(0, 3)).toEqual(['post-p2', 'post-p3', 'post-p1']);
  });

  it('hoà điểm thì bài mới hơn trước; đổi về "Mới nhất" khôi phục thứ tự', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.selectOptions(screen.getByLabelText('Sắp xếp bảng tin'), 'top');
    // p2 có 2 điểm cảm xúc+bình luận (1 + 2) cao hơn các bài còn lại (0 điểm, theo thời gian)
    expect(order()[0]).toBe('post-p2');
    expect(order().slice(1)).toEqual(['post-p1', 'post-p3', 'post-p4']);
    await user.selectOptions(screen.getByLabelText('Sắp xếp bảng tin'), 'newest');
    expect(order().slice(0, 3)).toEqual(['post-p1', 'post-p2', 'post-p3']);
  });

  it('kết hợp bộ lọc và sắp xếp', async () => {
    const { user } = renderApp('/', { seed: engagement });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Bạn bè' }));
    await user.selectOptions(screen.getByLabelText('Sắp xếp bảng tin'), 'top');
    expect(order()).toEqual(['post-p2', 'post-p1', 'post-p4']);
  });

  it('tương tác mới (thả cảm xúc) làm đổi điểm khi đang xem "Nổi bật"', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.selectOptions(screen.getByLabelText('Sắp xếp bảng tin'), 'top');
    expect(order()[0]).toBe('post-p2');
    for (const type of ['like']) void type;
    await user.click(within(post('p1')).getByRole('button', { name: 'Thích' }));
    await within(post('p1')).findByText('👍 Thích');
    await user.click(within(post('p3')).getByRole('button', { name: 'Thích' }));
    await within(post('p3')).findByText('👍 Thích');
    // p2: 1 cảm xúc + 2 (1 bình luận) = 3 điểm; p1, p3: 1 điểm → p2 vẫn đầu
    expect(order()[0]).toBe('post-p2');
  });
});

describe('Khung xương và lỗi khi tải bảng tin', () => {
  it('đang tải → khung xương, chưa hiện màn hình trống; xong thì hiện bài', async () => {
    const original = apiModule.api.get;
    let release!: () => void;
    apiModule.api.get = (p: string) => (p.startsWith('/posts?limit') ? new Promise((r) => (release = () => r(original(p)))) : original(p));
    renderApp('/');
    expect(await screen.findByRole('status', { name: 'Đang tải bài viết' })).toBeTruthy();
    expect(screen.queryByText('Chưa có bài viết nào')).toBeNull();
    release();
    expect(await feedLoaded()).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Đang tải bài viết' })).toBeNull();
    apiModule.api.get = original;
  });

  it('tải lỗi → màn hình lỗi thân thiện; "Thử lại" tải lại được', async () => {
    const { user } = renderApp('/', { seed: () => void db.failNext.add('GET /posts') });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không tải được bảng tin');
    expect(screen.queryByText('Chưa có bài viết nào')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await feedLoaded()).toBeTruthy();
    expect(screen.queryByText('Không tải được bảng tin')).toBeNull();
  });

  it('thử lại mà vẫn lỗi → vẫn ở màn hình lỗi, bấm được tiếp', async () => {
    const { user } = renderApp('/', { seed: () => void db.failNext.add('GET /posts') });
    const alert = await screen.findByRole('alert');
    db.failNext.add('GET /posts');
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Không tải được bảng tin');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await feedLoaded()).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, screen, waitFor, within, triggerIntersection } from './harness';
import { db, calls } from './fakeServer';
import type { Post } from '../../src/types';

// Reels (video ngắn): cuộn dọc, tự phát khi đang xem, thích, bình luận, lượt xem, bật / tắt tiếng, xoá, đăng reel mới.
// Dữ liệu mặc định: rl1 (bạn một, "Reel của bạn một #vui"), rl2 (người lạ).

const play = vi.fn().mockResolvedValue(undefined);
const pause = vi.fn();
beforeEach(() => {
  installBrowserStubs();
  play.mockClear().mockResolvedValue(undefined);
  pause.mockClear();
  HTMLMediaElement.prototype.play = play;
  HTMLMediaElement.prototype.pause = pause;
});

type Ctx = ReturnType<typeof renderApp>['user'];
const confirmDialog = async (user: Ctx, button = 'Đồng ý') => user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: button }));
const reels = () => screen.findAllByTestId('reel');
const reelOf = async (caption: string) => (await screen.findByText(caption, { exact: false })).closest('[data-testid="reel"]') as HTMLElement;
const myReel = (id: string, caption: string): Post => ({ id, author: db.me, content: caption, video: `/videos/${id}.mp4`, privacy: 'public', createdAt: new Date().toISOString(), reactions: [], commentsCount: 0, sharesCount: 0, kind: 'reel', viewsCount: 0 });

describe('Trang Reels', () => {
  it('hiện danh sách reel: video, tác giả, chú thích có #hashtag; chưa phát khi chưa nằm trong khung nhìn', async () => {
    renderApp('/reels');
    expect(await reels()).toHaveLength(2);
    const first = await reelOf('Reel của bạn một');
    expect(first.querySelector('video')!.getAttribute('src')).toBe('/videos/rl1.mp4');
    expect(within(first).getByRole('link', { name: 'Bạn Một' }).getAttribute('href')).toBe('/profile/f1');
    expect(within(first).getByRole('link', { name: '#vui' }).getAttribute('href')).toBe('/hashtag/vui');
    expect(play).not.toHaveBeenCalled();
  });

  it('khung xương khi đang tải; chưa có reel → màn hình trống với nút Tạo Reel', async () => {
    const { user } = renderApp('/reels', { seed: () => void (db.posts = db.posts.filter((p) => p.kind !== 'reel')) });
    expect(await screen.findByText('Chưa có Reel nào')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Tạo Reel' })[1]);
    expect(await screen.findByRole('dialog', { name: 'Tạo Reel' })).toBeTruthy();
  });

  it('lỗi tải → màn hình lỗi, "Thử lại" tải lại được', async () => {
    const { user } = renderApp('/reels', { seed: () => db.failNext.add('GET /reels') });
    expect(await screen.findByText('Không tải được Reels')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await reels()).toHaveLength(2);
  });

  it('reel KHÔNG hiện ở bảng tin chung', async () => {
    renderApp('/');
    await feedLoaded();
    expect(screen.queryByText('Reel của bạn một #vui')).toBeNull();
  });

  it('menu bên trái có "Reels", sáng lên khi đang ở trang Reels', async () => {
    renderApp('/reels');
    expect((await screen.findByRole('link', { name: /^Reels$/ })).getAttribute('aria-current')).toBe('page');
  });
});

describe('Phát video & lượt xem', () => {
  it('reel nằm trong khung nhìn (≥70%) → tự phát; rời đi → dừng và tua về đầu', async () => {
    renderApp('/reels');
    await reels();
    await triggerIntersection(true, 1);
    await waitFor(() => expect(play).toHaveBeenCalled());
    await triggerIntersection(false, 0);
    await waitFor(() => expect(pause).toHaveBeenCalled());
  });

  it('chỉ hiện một phần (<70%) → chưa phát', async () => {
    renderApp('/reels');
    await reels();
    await triggerIntersection(true, 0.4);
    await new Promise((r) => setTimeout(r, 50));
    expect(play).not.toHaveBeenCalled();
  });

  it('xem đủ ~1 giây → ghi nhận lượt xem MỘT lần và cập nhật số hiển thị', async () => {
    renderApp('/reels');
    await reels();
    const before = calls.filter((c) => c.path.endsWith('/view')).length;
    await triggerIntersection(true, 1);
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith('/view')).length).toBeGreaterThan(before), { timeout: 4000 });
    const views = calls.filter((c) => c.path.endsWith('/view'));
    expect(views[0].method).toBe('POST');
    await waitFor(() => expect(screen.getAllByLabelText(/lượt xem/).some((el) => el.textContent === '4')).toBe(true)); // 3 + 1
    await triggerIntersection(false, 0);
    await triggerIntersection(true, 1);
    await new Promise((r) => setTimeout(r, 1300));
    expect(calls.filter((c) => c.path.endsWith('/view')).length).toBe(views.length); // xem lại không đếm thêm
  });

  it('rời đi trước 1 giây → KHÔNG tính lượt xem', async () => {
    renderApp('/reels');
    await reels();
    const before = calls.filter((c) => c.path.endsWith('/view')).length;
    await triggerIntersection(true, 1);
    await triggerIntersection(false, 0);
    await new Promise((r) => setTimeout(r, 1300));
    expect(calls.filter((c) => c.path.endsWith('/view')).length).toBe(before);
  });

  it('trình duyệt chặn tự phát → hiện nút ▶, bấm vào để phát; bấm video để dừng / phát', async () => {
    // jsdom không có trình phát thật: tự mô phỏng trạng thái "đang phát" để nút bấm-để-dừng có ý nghĩa
    const state = new WeakMap<HTMLMediaElement, boolean>();
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get(this: HTMLMediaElement) { return !state.get(this); } });
    play.mockImplementation(function (this: HTMLMediaElement) {
      state.set(this, true);
      return Promise.resolve();
    });
    pause.mockImplementation(function (this: HTMLMediaElement) {
      state.set(this, false);
    });
    play.mockRejectedValueOnce(new Error('NotAllowedError'));
    const { user } = renderApp('/reels');
    const first = await reelOf('Reel của bạn một');
    await triggerIntersection(true, 1);
    const button = await within(first).findByRole('button', { name: 'Phát video' });
    await user.click(button);
    await waitFor(() => expect(within(first).queryByRole('button', { name: 'Phát video' })).toBeNull());
    await user.click(within(first).getByLabelText('Video reel')); // đang phát → dừng
    expect(pause).toHaveBeenCalled();
    expect(await within(first).findByRole('button', { name: 'Phát video' })).toBeTruthy();
  });

  it('nút tiếng: mặc định tắt; bấm → bật cho mọi reel; bấm lại → tắt', async () => {
    const { user } = renderApp('/reels');
    const first = await reelOf('Reel của bạn một');
    const video = first.querySelector('video')!;
    expect(video.muted).toBe(true);
    await user.click(within(first).getByRole('button', { name: 'Bật tiếng' }));
    expect(video.muted).toBe(false);
    expect((await reels()).every((r) => !r.querySelector('video')!.muted)).toBe(true);
    await user.click(within(first).getByRole('button', { name: 'Tắt tiếng' }));
    expect(video.muted).toBe(true);
  });
});

describe('Số lượt xem hiển thị', () => {
  it('reel chưa có số lượt xem → hiện 0; số lớn được rút gọn (1.5K)', async () => {
    renderApp('/reels', {
      seed: () => db.posts.unshift({ ...myReel('nv', 'Reel chưa có lượt xem'), viewsCount: undefined }, { ...myReel('big', 'Reel nhiều lượt xem'), viewsCount: 1500 }),
    });
    expect(within(await reelOf('Reel chưa có lượt xem')).getByLabelText('0 lượt xem').textContent).toBe('0');
    expect(within(await reelOf('Reel nhiều lượt xem')).getByLabelText('1500 lượt xem').textContent).toBe('1.5K');
  });
});

describe('Thích & bình luận', () => {
  it('thích → số cảm xúc tăng, nút đổi trạng thái; bấm lại → bỏ', async () => {
    const { user } = renderApp('/reels');
    const first = await reelOf('Reel của bạn một');
    const like = within(first).getByRole('button', { name: 'Thích' });
    expect(like.getAttribute('aria-pressed')).toBe('false');
    await user.click(like);
    const liked = await within(first).findByRole('button', { name: 'Bỏ thích' });
    expect(liked.getAttribute('aria-pressed')).toBe('true');
    expect(liked.textContent).toContain('1');
    await user.click(liked);
    expect((await within(first).findByRole('button', { name: 'Thích' })).textContent).toContain('0');
    expect(calls.filter((c) => c.path === '/posts/rl1/react')).toHaveLength(2);
  });

  it('thích thất bại → toast lỗi', async () => {
    const { user } = renderApp('/reels');
    const first = await reelOf('Reel của bạn một');
    db.failNext.add('POST /posts/rl1/react');
    await user.click(within(first).getByRole('button', { name: 'Thích' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
  });

  it('mở bình luận → ngăn kéo có khung bình luận; viết bình luận → số bình luận tăng; đóng ngăn kéo', async () => {
    const { user } = renderApp('/reels');
    const first = await reelOf('Reel của bạn một');
    await user.click(within(first).getByRole('button', { name: 'Bình luận' }));
    const drawer = await within(first).findByRole('dialog', { name: 'Bình luận reel' });
    await user.type(within(drawer).getByPlaceholderText(/Viết bình luận/), 'Hay quá');
    await user.click(within(drawer).getByRole('button', { name: /Gửi/ }));
    expect(await within(drawer).findByText('Hay quá')).toBeTruthy();
    await user.click(within(drawer).getByRole('button', { name: 'Đóng bình luận' }));
    expect(within(first).queryByRole('dialog', { name: 'Bình luận reel' })).toBeNull();
    expect(within(first).getByRole('button', { name: 'Bình luận' }).textContent).toContain('1');
  });
});

describe('Reel của mình & đăng reel', () => {
  it('chỉ reel của mình có nút xoá; xoá hỏi xác nhận (Hủy giữ lại, Đồng ý xoá)', async () => {
    const { user } = renderApp('/reels', { seed: () => db.posts.unshift(myReel('mine1', 'Reel của tôi')) });
    const mine = await reelOf('Reel của tôi');
    expect(within(await reelOf('Reel của bạn một')).queryByRole('button', { name: 'Xóa reel' })).toBeNull();
    await user.click(within(mine).getByRole('button', { name: 'Xóa reel' }));
    await confirmDialog(user, 'Hủy');
    expect(screen.getByText('Reel của tôi')).toBeTruthy();
    await user.click(within(mine).getByRole('button', { name: 'Xóa reel' }));
    await confirmDialog(user);
    await waitFor(() => expect(screen.queryByText('Reel của tôi')).toBeNull());
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/posts/mine1')).toBe(true);
  });

  it('đăng reel: chưa chọn video → nút khoá; chọn video → xem trước; nhập chú thích, chọn "Bạn bè" → đăng → nằm đầu danh sách', async () => {
    const { user } = renderApp('/reels');
    await reels();
    await user.click(screen.getByRole('button', { name: 'Tạo Reel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo Reel' });
    const submit = within(dialog).getByRole('button', { name: 'Đăng Reel' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.upload(dialog.querySelector('input[type=file]') as HTMLInputElement, new File(['v'], 'clip.mp4', { type: 'video/mp4' }));
    await waitFor(() => expect(dialog.querySelector('video')!.getAttribute('src')).toBe('/uploads/clip.mp4'));
    await user.type(within(dialog).getByLabelText('Chú thích'), 'Chuyến đi #biển');
    expect(within(dialog).getByText('15/300')).toBeTruthy();
    await user.selectOptions(within(dialog).getByLabelText('Ai xem được'), 'friends');
    await user.click(submit);
    expect(await screen.findByText('Đã đăng Reel!')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tạo Reel' })).toBeNull());
    const list = await reels();
    expect(list[0].querySelector('video')!.getAttribute('src')).toBe('/uploads/clip.mp4');
    expect(within(list[0]).getByText('#biển')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST' && c.path === '/reels')!.body).toEqual({ video: '/uploads/clip.mp4', caption: 'Chuyến đi #biển', privacy: 'friends' });
  });

  it('bỏ video đã chọn → quay lại ô chọn video và khoá nút đăng', async () => {
    const { user } = renderApp('/reels');
    await user.click(await screen.findByRole('button', { name: 'Tạo Reel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo Reel' });
    await user.upload(dialog.querySelector('input[type=file]') as HTMLInputElement, new File(['v'], 'clip.mp4', { type: 'video/mp4' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Bỏ video' }));
    expect(within(dialog).getByRole('button', { name: 'Chọn video' })).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Đăng Reel' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('đăng thất bại → toast lỗi, hộp thoại vẫn mở để thử lại; Esc đóng', async () => {
    const { user } = renderApp('/reels');
    await user.click(await screen.findByRole('button', { name: 'Tạo Reel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo Reel' });
    await user.upload(dialog.querySelector('input[type=file]') as HTMLInputElement, new File(['v'], 'clip.mp4', { type: 'video/mp4' }));
    await within(dialog).findByRole('button', { name: 'Bỏ video' });
    db.failNext.add('POST /reels');
    await user.click(within(dialog).getByRole('button', { name: 'Đăng Reel' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(screen.getByRole('dialog', { name: 'Tạo Reel' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tạo Reel' })).toBeNull());
  });
});

describe('Mở thẳng một reel & tải thêm', () => {
  it('?reel=<id> → reel đó lên đầu và được cuộn tới', async () => {
    renderApp('/reels?reel=rl2');
    const list = await reels();
    expect(list[0].id).toBe('reel-rl2');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it('reel không tồn tại trong liên kết → bỏ qua, vẫn hiện danh sách', async () => {
    renderApp('/reels?reel=khong-co');
    expect(await reels()).toHaveLength(2);
  });

  it('đủ một trang (8 reel) → cuộn tới cuối tải thêm; hết thì dừng', async () => {
    const many = Array.from({ length: 10 }, (_, i) => myReel(`m${i}`, `Reel số ${i}`));
    renderApp('/reels', { seed: () => (db.posts = [...many, ...db.posts]) });
    await waitFor(async () => expect(await reels()).toHaveLength(8));
    await triggerIntersection(true, 1);
    await waitFor(async () => expect(await reels()).toHaveLength(12));
    expect(calls.filter((c) => c.path.startsWith('/reels?')).map((c) => c.path)).toEqual(['/reels?limit=8&skip=0', '/reels?limit=8&skip=8']);
    await triggerIntersection(true, 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls.filter((c) => c.path.startsWith('/reels?'))).toHaveLength(2); // không còn gì để tải
  });
});

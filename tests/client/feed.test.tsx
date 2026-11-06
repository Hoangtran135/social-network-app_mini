// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, post, screen, waitFor, within, fireEvent, act } from './harness';
import { db, calls, makeUser, serverEmit } from './fakeServer';
import type { Post } from '../../src/types';

// Bảng tin: story, ô đăng bài, bộ lọc, thẻ bài viết (cảm xúc, bình luận, menu, chia sẻ, ảnh), cuộn tải thêm, realtime.

beforeEach(() => installBrowserStubs());

const confirmDialog = async (user: ReturnType<typeof renderApp>['user'], button = 'Đồng ý') => user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: button }));
const openMenu = async (user: ReturnType<typeof renderApp>['user'], postId: string) => user.click(within(post(postId)).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
const manyPosts = (n: number): Post[] => Array.from({ length: n }, (_, i) => ({ id: `bulk${i}`, author: makeUser('f1', 'Bạn Một'), content: `Bài số ${i}`, privacy: 'public', createdAt: new Date(Date.now() - i * 60000).toISOString(), reactions: [], commentsCount: 0, sharesCount: 0 }));

describe('Bảng tin — hiển thị', () => {
  it('hiện bài của mình, bạn bè, người lạ; ô đăng bài; thanh story', async () => {
    renderApp('/');
    await feedLoaded();
    for (const text of ['Bài của tôi', 'Bài của người lạ', 'Bài của bạn hai (chỉ bạn bè)']) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText('Trần Xuân Hoàng ơi, bạn đang nghĩ gì thế?')).toBeTruthy();
    expect(screen.getByText('Tạo tin')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xem tin của Bạn Một' })).toBeTruthy();
  });

  it('bài mới nhất nằm trên cùng', async () => {
    renderApp('/');
    await feedLoaded();
    const order = Array.from(document.querySelectorAll('article')).map((a) => a.id);
    expect(order.slice(0, 3)).toEqual(['post-p1', 'post-p2', 'post-p3']);
  });

  it('bài đăng lên tường người khác KHÔNG hiện ở bảng tin', async () => {
    renderApp('/', { seed: () => void (db.posts[2].wallOwnerId = 'f1') });
    await feedLoaded();
    expect(screen.queryByText('Bài của người lạ')).toBeNull();
  });

  it('chưa có bài nào → màn hình trống + nút đăng bài', async () => {
    renderApp('/', { seed: () => void (db.posts = []) });
    expect(await screen.findByText('Chưa có bài viết nào')).toBeTruthy();
    expect(screen.getByText(/Hãy là người đầu tiên/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Đăng bài ngay' })).toBeTruthy();
  });

  it('bộ lọc "Bạn bè": chỉ bài của bạn bè và của mình', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Bạn bè' }));
    expect(screen.queryByText('Bài của người lạ')).toBeNull();
    expect(screen.getByText('Bài của bạn một')).toBeTruthy();
    expect(screen.getByText('Bài của tôi')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tất cả bài viết' }));
    expect(screen.getByText('Bài của người lạ')).toBeTruthy();
  });

  it('bộ lọc "Bạn bè" khi bạn chưa đăng gì → mô tả riêng', async () => {
    const { user } = renderApp('/', { seed: () => void (db.posts = db.posts.filter((p) => p.author.id === 's1')) });
    await screen.findByText('Bài của người lạ');
    await user.click(screen.getByRole('button', { name: 'Bạn bè' }));
    expect(screen.getByText(/Bạn bè của bạn chưa đăng bài nào/)).toBeTruthy();
  });

  it('tải thêm: đủ trang đầu thì có nút "Xem thêm bài viết"; bấm → tải tiếp, hết thì báo đã xem hết', async () => {
    const { user } = renderApp('/', { seed: () => void (db.posts = manyPosts(25)) });
    await screen.findByText('Bài số 0');
    expect(screen.queryByText('Bài số 24')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Xem thêm bài viết' }));
    expect(await screen.findByText('Bài số 24')).toBeTruthy();
    expect(await screen.findByText('Bạn đã xem hết bài viết.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem thêm bài viết' })).toBeNull();
    expect(calls.filter((c) => c.path.startsWith('/posts?')).map((c) => c.path)).toEqual(['/posts?limit=20', '/posts?limit=20&skip=20']);
  });

  it('ít hơn 1 trang → không có nút tải thêm, báo đã xem hết', async () => {
    renderApp('/');
    await feedLoaded();
    expect(screen.queryByRole('button', { name: 'Xem thêm bài viết' })).toBeNull();
    expect(screen.getByText('Bạn đã xem hết bài viết.')).toBeTruthy();
  });
});

describe('Đăng bài', () => {
  const openModal = async (user: ReturnType<typeof renderApp>['user']) => {
    await feedLoaded();
    await user.click(screen.getByText('Trần Xuân Hoàng ơi, bạn đang nghĩ gì thế?'));
    return screen.getByRole('dialog', { name: 'Đăng bài' });
  };

  it('đăng bài chữ → xuất hiện đầu bảng tin + toast', async () => {
    const { user } = renderApp('/');
    const dialog = await openModal(user);
    await user.type(within(dialog).getByRole('textbox'), 'Xin chào mọi người');
    await user.click(within(dialog).getByRole('button', { name: 'Đăng bài viết' }));
    expect(await screen.findByText('Xin chào mọi người')).toBeTruthy();
    expect(screen.getByText('Đã đăng bài viết thành công!')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Đăng bài' })).toBeNull();
    expect(document.querySelector('article')!.textContent).toContain('Xin chào mọi người');
  });

  it('nút Đăng bị khoá khi chưa có nội dung', async () => {
    const { user } = renderApp('/');
    const dialog = await openModal(user);
    expect((within(dialog).getByRole('button', { name: 'Đăng bài viết' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(dialog).getByRole('textbox'), 'a');
    expect((within(dialog).getByRole('button', { name: 'Đăng bài viết' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('đóng bằng nút X, phím Esc, hoặc bấm nền mờ', async () => {
    const { user } = renderApp('/');
    let dialog = await openModal(user);
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog', { name: 'Đăng bài' })).toBeNull();
    dialog = await openModal(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Đăng bài' })).toBeNull();
    dialog = await openModal(user);
    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.queryByRole('dialog', { name: 'Đăng bài' })).toBeNull();
  });

  it('chọn quyền riêng tư, cảm xúc → gửi đúng lên server', async () => {
    const { user } = renderApp('/');
    const dialog = await openModal(user);
    await user.selectOptions(within(dialog).getByRole('combobox'), 'friends');
    await user.click(within(dialog).getByTitle('Cảm xúc'));
    await user.click(within(dialog).getByText('hạnh phúc 😊'));
    await user.type(within(dialog).getByRole('textbox'), 'Vui quá');
    await user.click(within(dialog).getByRole('button', { name: 'Đăng bài viết' }));
    await screen.findByText('Vui quá');
    expect(calls.find((c) => c.method === 'POST' && c.path === '/posts')?.body).toMatchObject({ content: 'Vui quá', privacy: 'friends', feeling: 'hạnh phúc 😊' });
    expect(document.querySelector('article')!.textContent).toContain('đang cảm thấy hạnh phúc 😊');
  });

  it('chọn lại cùng cảm xúc thì bỏ chọn', async () => {
    const { user } = renderApp('/');
    const dialog = await openModal(user);
    await user.click(within(dialog).getByTitle('Cảm xúc'));
    await user.click(within(dialog).getByText('thư giãn ☕'));
    expect(within(dialog).getByText(/đang cảm thấy thư giãn/)).toBeTruthy();
    await user.click(within(dialog).getByTitle('Cảm xúc'));
    await user.click(within(dialog).getByText('thư giãn ☕'));
    expect(within(dialog).queryByText(/đang cảm thấy thư giãn/)).toBeNull();
  });

  it('đăng kèm ảnh: xem trước, xoá ảnh, và ảnh được gửi lên', async () => {
    const { user } = renderApp('/');
    const dialog = await openModal(user);
    const fileInput = dialog.querySelectorAll('input[type=file]')[0] as HTMLInputElement;
    await user.upload(fileInput, [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })]);
    await waitFor(() => expect(within(dialog).getAllByRole('button', { name: 'Bỏ ảnh' })).toHaveLength(2));
    await user.click(within(dialog).getAllByRole('button', { name: 'Bỏ ảnh' })[0]);
    expect(within(dialog).getAllByRole('button', { name: 'Bỏ ảnh' })).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Đăng bài viết' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/posts' && c.method === 'POST')?.body).toMatchObject({ images: ['/uploads/b.png'] }));
  });

  it('đăng video; có ảnh rồi thì khoá nút video và ngược lại', async () => {
    const { user } = renderApp('/');
    const dialog = await openModal(user);
    await user.upload(dialog.querySelectorAll('input[type=file]')[1] as HTMLInputElement, new File(['v'], 'clip.mp4', { type: 'video/mp4' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Bỏ video' })).toBeTruthy());
    expect((within(dialog).getByTitle('Ảnh') as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByTitle('Video') as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Bỏ video' }));
    expect((within(dialog).getByTitle('Ảnh') as HTMLButtonElement).disabled).toBe(false);
  });

  it('gõ @ gợi ý bạn bè; chọn → chèn tên và gắn thẻ', async () => {
    const { user } = renderApp('/');
    const dialog = await openModal(user);
    await user.type(within(dialog).getByRole('textbox'), 'Chào @Bạn');
    await user.click(await within(dialog).findByText('Bạn Một', { selector: 'span.text-xs.font-semibold' }));
    expect((within(dialog).getByRole('textbox') as HTMLTextAreaElement).value).toContain('@Bạn Một ');
    expect(within(dialog).getByText(/cùng với Bạn Một/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Đăng bài viết' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/posts' && c.method === 'POST')?.body).toMatchObject({ taggedUserIds: ['f1'] }));
  });

  it('gắn thẻ bằng danh sách bạn bè', async () => {
    const { user } = renderApp('/');
    const dialog = await openModal(user);
    await user.click(within(dialog).getByTitle('Gắn thẻ bạn bè'));
    await user.click(within(dialog).getByText('Bạn Hai'));
    expect(within(dialog).getByText(/cùng với Bạn Hai/)).toBeTruthy();
  });

  it('server lỗi → toast đỏ, bài không xuất hiện', async () => {
    const { user } = renderApp('/');
    const dialog = await openModal(user);
    db.failNext.add('POST /posts');
    await user.type(within(dialog).getByRole('textbox'), 'Bài sẽ lỗi');
    await user.click(within(dialog).getByRole('button', { name: 'Đăng bài viết' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(screen.queryByText('Bài sẽ lỗi')).toBeNull();
  });

  it('nút "Đăng bài ngay" ở màn hình trống cũng mở hộp thoại', async () => {
    const { user } = renderApp('/', { seed: () => void (db.posts = []) });
    await user.click(await screen.findByRole('button', { name: '+ Đăng bài ngay' }));
    expect(screen.getByRole('dialog', { name: 'Đăng bài' })).toBeTruthy();
  });

  it('nút "Đăng bài" trên Navbar mở hộp thoại', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getAllByRole('button', { name: 'Đăng bài' })[0]);
    expect(screen.getByRole('dialog', { name: 'Đăng bài' })).toBeTruthy();
  });
});

describe('Thẻ bài viết — cảm xúc', () => {
  it('bấm Thích → thành "👍 Thích" và đếm; bấm lại → bỏ', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    const card = within(post('p1'));
    await user.click(card.getByRole('button', { name: 'Thích' }));
    expect(await card.findByText('👍 Thích')).toBeTruthy();
    expect(card.getByText('👍 1')).toBeTruthy();
    await user.click(card.getByRole('button', { name: '👍 Thích' }));
    expect(await card.findByRole('button', { name: 'Thích' })).toBeTruthy();
    expect(card.queryByText('👍 1')).toBeNull();
  });

  it('rê chuột vào nút Thích → bảng cảm xúc; chọn "Yêu thích"', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    const card = within(post('p1'));
    fireEvent.mouseEnter(card.getByRole('button', { name: 'Thích' }).parentElement!);
    await user.click(await card.findByRole('button', { name: 'Yêu thích' }));
    expect(await card.findByText('❤️ Yêu thích')).toBeTruthy();
    expect(calls.find((c) => c.path === '/posts/p1/react')?.body).toEqual({ type: 'love' });
  });

  it('rời chuột khỏi nút thì bảng cảm xúc đóng', async () => {
    renderApp('/');
    await feedLoaded();
    const card = within(post('p1'));
    const wrapper = card.getByRole('button', { name: 'Thích' }).parentElement!;
    fireEvent.mouseEnter(wrapper);
    await card.findByRole('button', { name: 'Haha' });
    fireEvent.mouseLeave(wrapper);
    expect(card.queryByRole('button', { name: 'Haha' })).toBeNull();
  });

  it('cảm ứng: nhấn giữ 400ms mở bảng cảm xúc và KHÔNG thả "like" khi nhả tay', async () => {
    renderApp('/');
    await feedLoaded();
    const card = within(post('p1'));
    const button = card.getByRole('button', { name: 'Thích' });
    fireEvent.touchStart(button);
    await card.findByRole('button', { name: 'Wow' }, { timeout: 1500 });
    fireEvent.touchEnd(button);
    fireEvent.click(button);
    expect(calls.some((c) => c.path === '/posts/p1/react')).toBe(false);
  });

  it('chạm nhanh (không giữ) thì thả "like" bình thường', async () => {
    renderApp('/');
    await feedLoaded();
    const card = within(post('p1'));
    const button = card.getByRole('button', { name: 'Thích' });
    fireEvent.touchStart(button);
    fireEvent.touchEnd(button);
    fireEvent.click(button);
    expect(await card.findByText('👍 Thích')).toBeTruthy();
  });

  it('bài đã có cảm xúc của người khác hiện tổng số', async () => {
    renderApp('/');
    await feedLoaded();
    expect(within(post('p2')).getByText('👍 1')).toBeTruthy();
    expect(within(post('p2')).getByText('1 bình luận')).toBeTruthy();
  });

  it('server lỗi khi thả cảm xúc → toast lỗi', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    db.failNext.add('POST /posts/p1/react');
    await user.click(within(post('p1')).getByRole('button', { name: 'Thích' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
  });
});

describe('Thẻ bài viết — bình luận', () => {
  const open = async (postId = 'p2') => {
    const ctx = renderApp('/');
    await feedLoaded();
    await ctx.user.click(within(post(postId)).getByRole('button', { name: 'Bình luận' }));
    return { ...ctx, card: within(post(postId)) };
  };

  it('mở khung → thấy bình luận có sẵn; bấm lại → đóng', async () => {
    const { user, card } = await open();
    expect(await card.findByText('Bình luận đầu tiên')).toBeTruthy();
    await user.click(card.getByRole('button', { name: 'Bình luận' }));
    expect(card.queryByText('Bình luận đầu tiên')).toBeNull();
  });

  it('bài chưa có bình luận → lời mời bình luận', async () => {
    const { card } = await open('p1');
    expect(await card.findByText(/Chưa có bình luận nào/)).toBeTruthy();
  });

  it('viết bình luận → xuất hiện và tăng bộ đếm', async () => {
    const { user, card } = await open();
    await user.type(card.getByPlaceholderText(/Viết bình luận/), 'Mình đồng ý');
    await user.click(card.getByRole('button', { name: 'Gửi bình luận' }));
    expect(await card.findByText('Mình đồng ý')).toBeTruthy();
    expect(card.getByText('2 bình luận')).toBeTruthy();
  });

  it('nút gửi khoá khi ô trống', async () => {
    const { card } = await open();
    expect((card.getByRole('button', { name: 'Gửi bình luận' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('trả lời một bình luận (cấp 2)', async () => {
    const { user, card } = await open();
    await user.click(await card.findByRole('button', { name: 'Trả lời' }));
    await user.type(card.getByPlaceholderText('Trả lời Bạn Một...'), 'Cảm ơn bạn');
    await user.click(card.getByRole('button', { name: 'Gửi trả lời' }));
    expect(await card.findByText('Cảm ơn bạn')).toBeTruthy();
    expect(calls.find((c) => c.path === '/comments' && c.method === 'POST')?.body).toMatchObject({ parentId: 'c1' });
  });

  it('câu trả lời không có nút "Trả lời" (chỉ 2 cấp)', async () => {
    const { user, card } = await open();
    await user.click(await card.findByRole('button', { name: 'Trả lời' }));
    await user.type(card.getByPlaceholderText('Trả lời Bạn Một...'), 'Rep');
    await user.click(card.getByRole('button', { name: 'Gửi trả lời' }));
    await card.findByText('Rep');
    expect(card.getAllByRole('button', { name: 'Trả lời' })).toHaveLength(1);
  });

  it('thích / bỏ thích bình luận', async () => {
    const { user, card } = await open();
    await card.findByText('Bình luận đầu tiên');
    // [0] = nút Thích của bài viết, [1] = nút Thích của bình luận
    await user.click(card.getAllByRole('button', { name: 'Thích' })[1]);
    expect(await card.findByTitle('1 cảm xúc')).toBeTruthy();
    await user.click(card.getByRole('button', { name: '👍 Thích' }));
    await waitFor(() => expect(card.queryByTitle('1 cảm xúc')).toBeNull());
    expect(card.getAllByRole('button', { name: 'Thích' })).toHaveLength(2);
  });

  it('xoá bình luận của mình có xác nhận; bình luận của người khác không có nút Xóa', async () => {
    const { user, card } = await open();
    await card.findByText('Bình luận đầu tiên');
    expect(card.queryByRole('button', { name: 'Xóa' })).toBeNull();
    await user.type(card.getByPlaceholderText(/Viết bình luận/), 'Của tôi');
    await user.click(card.getByRole('button', { name: 'Gửi bình luận' }));
    await card.findByText('Của tôi');
    await user.click(card.getByRole('button', { name: 'Xóa' }));
    await confirmDialog(user);
    await waitFor(() => expect(card.queryByText('Của tôi')).toBeNull());
    expect(card.getByText('1 bình luận')).toBeTruthy();
  });

  it('huỷ xác nhận → bình luận còn nguyên', async () => {
    const { user, card } = await open();
    await user.type(card.getByPlaceholderText(/Viết bình luận/), 'Giữ lại');
    await user.click(card.getByRole('button', { name: 'Gửi bình luận' }));
    await card.findByText('Giữ lại');
    await user.click(card.getByRole('button', { name: 'Xóa' }));
    await confirmDialog(user, 'Hủy');
    expect(card.getByText('Giữ lại')).toBeTruthy();
  });

  it('gắn thẻ bạn bè trong bình luận', async () => {
    const { user, card } = await open();
    await user.click(card.getByRole('button', { name: 'Gắn thẻ bạn bè' }));
    await user.click(card.getByText('Bạn Hai'));
    expect(card.getByText(/cùng với/)).toBeTruthy();
    await user.type(card.getByPlaceholderText(/Viết bình luận/), 'Xem đi');
    await user.click(card.getByRole('button', { name: 'Gửi bình luận' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/comments' && c.method === 'POST')?.body).toMatchObject({ taggedUserIds: ['f2'] }));
  });

  it('đính kèm ảnh vào bình luận, có thể bỏ ảnh', async () => {
    const { user, card } = await open();
    await user.upload(card.getByRole('button', { name: 'Đính kèm ảnh' }).parentElement!.querySelector('input[type=file]') as HTMLInputElement, new File(['x'], 'pic.png', { type: 'image/png' }));
    expect(await card.findByRole('button', { name: 'Bỏ ảnh' })).toBeTruthy();
    await user.click(card.getByRole('button', { name: 'Bỏ ảnh' }));
    expect(card.queryByRole('button', { name: 'Bỏ ảnh' })).toBeNull();
  });

  it('bình luận chỉ có ảnh vẫn gửi được', async () => {
    const { user, card } = await open();
    await user.upload(card.getByRole('button', { name: 'Đính kèm ảnh' }).parentElement!.querySelector('input[type=file]') as HTMLInputElement, new File(['x'], 'pic.png', { type: 'image/png' }));
    await card.findByRole('button', { name: 'Bỏ ảnh' });
    await user.click(card.getByRole('button', { name: 'Gửi bình luận' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/comments' && c.method === 'POST')?.body).toMatchObject({ image: '/uploads/pic.png' }));
  });
});

describe('Thẻ bài viết — menu "..." và chia sẻ', () => {
  it('bài của người khác: chỉ có Lưu + Sao chép liên kết', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await openMenu(user, 'p1');
    const menu = within(post('p1'));
    expect(menu.getByText('Lưu bài viết')).toBeTruthy();
    expect(menu.getByText('Sao chép liên kết')).toBeTruthy();
    expect(menu.queryByText('Chỉnh sửa bài viết')).toBeNull();
    expect(menu.queryByText('Xóa bài viết')).toBeNull();
    expect(menu.queryByText('Ghim bài viết')).toBeNull();
  });

  it('bài của mình: đủ Ghim / Sửa / Xóa', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await openMenu(user, 'p2');
    for (const t of ['Ghim bài viết', 'Chỉnh sửa bài viết', 'Xóa bài viết']) expect(within(post('p2')).getByText(t)).toBeTruthy();
  });

  it('lưu bài → toast, nút lưu đổi trạng thái; bỏ lưu', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await openMenu(user, 'p1');
    await user.click(within(post('p1')).getByText('Lưu bài viết'));
    expect(await screen.findByText('Đã lưu bài viết')).toBeTruthy();
    expect(within(post('p1')).getByRole('button', { name: 'Bỏ lưu bài viết' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(within(post('p1')).getByRole('button', { name: 'Bỏ lưu bài viết' }));
    expect(await screen.findByText('Đã bỏ lưu bài viết')).toBeTruthy();
  });

  it('sao chép liên kết → ghi vào clipboard + toast', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await openMenu(user, 'p1');
    await user.click(within(post('p1')).getByText('Sao chép liên kết'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#post-p1'));
    expect(await screen.findByText('Đã sao chép liên kết bài viết!')).toBeTruthy();
  });

  it('ghim bài → có nhãn "Đã ghim"', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await openMenu(user, 'p2');
    await user.click(within(post('p2')).getByText('Ghim bài viết'));
    expect(await within(post('p2')).findByText(/Đã ghim/)).toBeTruthy();
    await openMenu(user, 'p2');
    expect(within(post('p2')).getByText('Bỏ ghim bài viết')).toBeTruthy();
  });

  it('sửa bài → nội dung mới + nhãn "đã chỉnh sửa"', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await openMenu(user, 'p2');
    await user.click(within(post('p2')).getByText('Chỉnh sửa bài viết'));
    const dialog = screen.getByRole('dialog', { name: 'Đăng bài' });
    expect(screen.getByText('Chỉnh sửa bài viết', { selector: 'h3' })).toBeTruthy();
    const box = within(dialog).getByRole('textbox') as HTMLTextAreaElement;
    expect(box.value).toBe('Bài của tôi');
    await user.clear(box);
    await user.type(box, 'Đã sửa xong');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Đã sửa xong')).toBeTruthy();
    expect(within(post('p2')).getByText('(đã chỉnh sửa)')).toBeTruthy();
  });

  it('xoá bài: hỏi xác nhận; Hủy giữ lại, Đồng ý xoá', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await openMenu(user, 'p2');
    await user.click(within(post('p2')).getByText('Xóa bài viết'));
    await confirmDialog(user, 'Hủy');
    expect(screen.getByText('Bài của tôi')).toBeTruthy();
    await openMenu(user, 'p2');
    await user.click(within(post('p2')).getByText('Xóa bài viết'));
    await confirmDialog(user);
    await waitFor(() => expect(screen.queryByText('Bài của tôi')).toBeNull());
    expect(screen.getByText('Đã xóa bài viết!')).toBeTruthy();
  });

  it('bấm ra ngoài thì menu "..." đóng', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await openMenu(user, 'p1');
    fireEvent.mouseDown(document.body);
    expect(within(post('p1')).queryByText('Sao chép liên kết')).toBeNull();
  });

  it('chia sẻ lên trang cá nhân → bài mới + tăng số chia sẻ', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(within(post('p1')).getByRole('button', { name: 'Chia sẻ' }));
    await user.click(within(post('p1')).getByText('Chia sẻ lên trang cá nhân'));
    await user.click(within(screen.getByRole('dialog', { name: 'Chia sẻ bài viết' })).getByRole('button', { name: 'Chia sẻ ngay' }));
    expect(await screen.findByText(/\[Chia sẻ\]: Bài của bạn một/)).toBeTruthy();
    expect(screen.getByText('Đã chia sẻ bài viết lên trang cá nhân của bạn!')).toBeTruthy();
    expect(within(post('p1')).getByText('1 lượt chia sẻ')).toBeTruthy();
  });

  it('gửi bài qua tin nhắn → chọn bạn → mở cửa sổ chat', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(within(post('p1')).getByRole('button', { name: 'Chia sẻ' }));
    await user.click(within(post('p1')).getByText('Gửi qua tin nhắn'));
    const dialog = screen.getByRole('dialog', { name: 'Gửi bài viết cho bạn bè' });
    await user.click(within(dialog).getByText('Bạn Một'));
    expect(await screen.findByPlaceholderText('Nhập tin nhắn...')).toBeTruthy();
    expect(calls.some((c) => c.path === '/messages/conversations/cv1/share-post')).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Gửi bài viết cho bạn bè' })).toBeNull();
  });

  it('hộp thoại gửi bài: đóng bằng X và Esc; chưa có bạn → thông báo', async () => {
    const { user } = renderApp('/', { seed: () => void (db.friends = []) });
    await feedLoaded();
    await user.click(within(post('p1')).getByRole('button', { name: 'Chia sẻ' }));
    await user.click(within(post('p1')).getByText('Gửi qua tin nhắn'));
    expect(screen.getByText('Bạn chưa có bạn bè nào để gửi.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog', { name: 'Gửi bài viết cho bạn bè' })).toBeNull();
    await user.click(within(post('p1')).getByRole('button', { name: 'Chia sẻ' }));
    await user.click(within(post('p1')).getByText('Gửi qua tin nhắn'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Gửi bài viết cho bạn bè' })).toBeNull();
  });

  it('nút bookmark nhanh ở hàng nút', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(within(post('p3')).getByRole('button', { name: 'Lưu bài viết' }));
    expect(await within(post('p3')).findByRole('button', { name: 'Bỏ lưu bài viết' })).toBeTruthy();
  });
});

describe('Thẻ bài viết — ảnh, video, thông tin', () => {
  const withImages = (n: number) => () => void (db.posts[0].images = Array.from({ length: n }, (_, i) => `/img/${i}.png`));

  it.each([1, 2, 3, 4])('%i ảnh → hiển thị đúng số ô', async (n) => {
    renderApp('/', { seed: withImages(n) });
    await feedLoaded();
    expect(within(post('p1')).getAllByRole('button', { name: 'Xem ảnh lớn' })).toHaveLength(n);
  });

  it('5 ảnh → chỉ hiện 4 ô, ô cuối có "+1"', async () => {
    renderApp('/', { seed: withImages(5) });
    await feedLoaded();
    expect(within(post('p1')).getAllByRole('button', { name: 'Xem ảnh lớn' })).toHaveLength(4);
    expect(within(post('p1')).getByText('+1')).toBeTruthy();
  });

  it('bấm ảnh → xem lớn; đóng bằng nút, nền mờ và Esc', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(within(post('p1')).getByRole('button', { name: 'Xem ảnh lớn' }));
    await user.click(screen.getByRole('button', { name: 'Đóng ảnh' }));
    expect(screen.queryByRole('button', { name: 'Đóng ảnh' })).toBeNull();
    await user.click(within(post('p1')).getByRole('button', { name: 'Xem ảnh lớn' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Đóng ảnh' })).toBeNull();
    await user.click(within(post('p1')).getByRole('button', { name: 'Xem ảnh lớn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đóng ảnh' }).parentElement!);
    expect(screen.queryByRole('button', { name: 'Đóng ảnh' })).toBeNull();
  });

  it('video có thanh điều khiển', async () => {
    renderApp('/', { seed: () => void (db.posts[0].video = '/v/clip.mp4') });
    await feedLoaded();
    const video = post('p1').querySelector('video')!;
    expect(video.getAttribute('src')).toBe('/v/clip.mp4');
    expect(video.hasAttribute('controls')).toBe(true);
  });

  it('hiện cảm xúc, người được gắn thẻ, vị trí, quyền riêng tư, tường người khác', async () => {
    renderApp('/', {
      seed: () => {
        Object.assign(db.posts[0], { feeling: 'đang ăn 🍕', taggedUsers: [makeUser('f2', 'Bạn Hai')], location: 'Hà Nội', privacy: 'friends', wallOwnerId: undefined });
        db.posts[2].wallOwnerId = undefined;
      },
    });
    await feedLoaded();
    const card = within(post('p1'));
    expect(card.getByText('đang ăn 🍕')).toBeTruthy();
    expect(card.getByText('Bạn Hai')).toBeTruthy();
    expect(card.getByText(/Hà Nội/)).toBeTruthy();
    expect(card.getByTitle('Bạn bè')).toBeTruthy();
  });

  it('tên tác giả là link tới trang cá nhân', async () => {
    const { user, location } = renderApp('/');
    await feedLoaded();
    await user.click(within(post('p1')).getAllByRole('link', { name: 'Bạn Một' })[0]);
    expect(location()).toBe('/profile/f1');
  });
});

describe('Realtime của bảng tin', () => {
  it('post:new → bài hiện ngay đầu bảng tin (không trùng khi nhận 2 lần)', async () => {
    renderApp('/');
    await feedLoaded();
    const newPost = { id: 'rt1', author: makeUser('f2', 'Bạn Hai'), content: 'Bài realtime', privacy: 'public', createdAt: new Date().toISOString(), reactions: [], commentsCount: 0, sharesCount: 0 };
    act(() => serverEmit('post:new', { post: newPost }));
    act(() => serverEmit('post:new', { post: newPost }));
    expect(await screen.findByText('Bài realtime')).toBeTruthy();
    expect(screen.getAllByText('Bài realtime')).toHaveLength(1);
  });

  it('post:update → nội dung đổi nhưng giữ trạng thái đã lưu của mình', async () => {
    renderApp('/', { seed: () => void (db.posts[0].isSaved = true) });
    await feedLoaded();
    act(() => serverEmit('post:update', { post: { ...db.posts[0], content: 'Nội dung mới từ server', isSaved: false } }));
    expect(await screen.findByText('Nội dung mới từ server')).toBeTruthy();
    expect(within(post('p1')).getByRole('button', { name: 'Bỏ lưu bài viết' })).toBeTruthy();
  });

  it('post:delete → bài biến mất', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('post:delete', { postId: 'p3' }));
    await waitFor(() => expect(screen.queryByText('Bài của người lạ')).toBeNull());
  });

  it('comment:new / comment:delete cập nhật khung bình luận đang mở và bộ đếm', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(within(post('p2')).getByRole('button', { name: 'Bình luận' }));
    await within(post('p2')).findByText('Bình luận đầu tiên');
    act(() => serverEmit('comment:new', { postId: 'p2', comment: { id: 'rtc', postId: 'p2', author: makeUser('f2', 'Bạn Hai'), content: 'Bình luận realtime', createdAt: new Date().toISOString(), likes: [] } }));
    expect(await within(post('p2')).findByText('Bình luận realtime')).toBeTruthy();
    expect(within(post('p2')).getByText('2 bình luận')).toBeTruthy();
    act(() => serverEmit('comment:delete', { postId: 'p2', commentId: 'rtc' }));
    await waitFor(() => expect(within(post('p2')).queryByText('Bình luận realtime')).toBeNull());
  });

  it('notification:new → toast + huy hiệu thông báo tăng', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('notification:new', { id: 'nx', userId: 'u1', actor: makeUser('f2', 'Bạn Hai'), type: 'like', content: 'đã thích bài của bạn', isRead: false, createdAt: new Date().toISOString() }));
    expect(await screen.findByText('Bạn Hai đã thích bài của bạn')).toBeTruthy();
  });

  it('friend-request:cancelled / rejected / friend:removed cập nhật danh sách', async () => {
    renderApp('/');
    await feedLoaded();
    expect(screen.getAllByText('Người Mời').length).toBeGreaterThan(0);
    act(() => serverEmit('friend-request:cancelled', { requestId: 'r1' }));
    await waitFor(() => expect(screen.queryByText('Lời mời kết bạn')).toBeNull());
    expect(screen.getAllByText('Bạn Hai').length).toBeGreaterThan(0);
    act(() => serverEmit('friend:removed', { userId: 'f2' }));
    await waitFor(() => expect(screen.getByText('Người liên hệ (1)')).toBeTruthy());
  });

  it('friend_accept → người đó vào danh sách bạn bè ngay', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('notification:new', { id: 'na', userId: 'u1', actor: makeUser('s3', 'Người Được Mời'), type: 'friend_accept', content: 'đã chấp nhận lời mời', isRead: false, createdAt: new Date().toISOString() }));
    await waitFor(() => expect(screen.getByText('Người liên hệ (3)')).toBeTruthy());
  });

  it('story:new / story:delete cập nhật thanh story', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('story:new', { story: { ...db.stories[0], id: 'rs', user: makeUser('f2', 'Bạn Hai') } }));
    expect(await screen.findByRole('button', { name: 'Xem tin của Bạn Hai' })).toBeTruthy();
    act(() => serverEmit('story:delete', { storyId: 'rs' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Xem tin của Bạn Hai' })).toBeNull());
  });
});

describe('Sửa bình luận realtime và toast thông báo bấm được', () => {
  it('comment:update → nội dung bình luận đổi ngay khi khung bình luận đang mở; bài khác / chưa mở thì bỏ qua', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(within(post('p2')).getByRole('button', { name: 'Bình luận' }));
    await within(post('p2')).findByText('Bình luận đầu tiên');
    act(() => serverEmit('comment:update', { postId: 'p2', comment: { ...db.comments[0], content: 'Bình luận đã sửa' } }));
    expect(await within(post('p2')).findByText('Bình luận đã sửa')).toBeTruthy();
    expect(within(post('p2')).queryByText('Bình luận đầu tiên')).toBeNull();
    act(() => serverEmit('comment:update', { postId: 'p3', comment: { ...db.comments[0], content: 'Không liên quan' } }));
    expect(screen.queryByText('Không liên quan')).toBeNull();
  });

  it('bấm vào toast của thông báo bình luận → mở bài viết đó và toast biến mất', async () => {
    const { user, location } = renderApp('/notifications');
    await screen.findByText('Bạn có 2 thông báo chưa đọc');
    act(() => serverEmit('notification:new', { id: 'nt', userId: 'u1', actor: makeUser('f2', 'Bạn Hai'), type: 'comment', content: 'đã bình luận về bài viết của bạn: "hello..."', targetId: 'p2', targetType: 'post', isRead: false, createdAt: new Date().toISOString() }));
    await user.click(await screen.findByRole('button', { name: /Bạn Hai đã bình luận về bài viết của bạn/ }));
    await waitFor(() => expect(location()).toBe('/'));
    expect(screen.queryByRole('button', { name: /Bạn Hai đã bình luận về bài viết của bạn/ })).toBeNull();
  });
});

// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { render } from '@testing-library/react';
import { installBrowserStubs, renderApp, feedLoaded, post, triggerInfiniteScroll, screen, waitFor, within, fireEvent, act } from './harness';
import { db, calls, makeUser, serverEmit, apiModule, resetDb, setLoggedIn } from './fakeServer';
import App from '../../src/App';
import type { Message, Post } from '../../src/types';

// Lấp các nhánh còn lại của giao diện: App mặc định, cuộn vô hạn, lỗi không phải ApiError, realtime hiếm, đóng/mở lặp lại của menu...

beforeEach(() => installBrowserStubs());
const bulk = (n: number): Post[] => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, author: makeUser('f1', 'Bạn Một'), content: `Bài số ${i}`, privacy: 'public', createdAt: new Date(Date.now() - i * 60000).toISOString(), reactions: [], commentsCount: 0, sharesCount: 0 }));
const openChat = async () => {
  const ctx = renderApp('/');
  await feedLoaded();
  await ctx.user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
  await ctx.user.click(await screen.findByText('Bạn: Chào bạn'));
  await screen.findByPlaceholderText('Nhập tin nhắn...');
  return ctx;
};

describe('App mặc định (BrowserRouter thật)', () => {
  it('đã đăng nhập → vào bảng tin', async () => {
    resetDb();
    setLoggedIn(true);
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await feedLoaded()).toBeTruthy();
  });
});

describe('Cuộn vô hạn', () => {
  it('cuộn tới cuối → tải trang kế; kéo liên tục khi đang tải chỉ tải 1 lần', async () => {
    renderApp('/', { seed: () => void (db.posts = bulk(45)) });
    await screen.findByText('Bài số 0');
    await triggerInfiniteScroll();
    await triggerInfiniteScroll();
    await screen.findByText('Bài số 39');
    expect(calls.filter((c) => c.path.startsWith('/posts?limit=20&skip=20'))).toHaveLength(1);
  });

  it('đã hết bài → cuộn tới cuối không gọi thêm API', async () => {
    renderApp('/', { seed: () => void (db.posts = bulk(5)) });
    await screen.findByText('Bài số 0');
    const before = calls.length;
    await triggerInfiniteScroll();
    expect(calls.length).toBe(before);
  });

  it('chưa tới cuối (không giao nhau) → không tải', async () => {
    renderApp('/', { seed: () => void (db.posts = bulk(25)) });
    await screen.findByText('Bài số 0');
    await triggerInfiniteScroll(false);
    expect(calls.some((c) => c.path.includes('skip=20'))).toBe(false);
  });

  it('tải trang kế bị lỗi → không làm hỏng danh sách đang có', async () => {
    renderApp('/', { seed: () => void (db.posts = bulk(25)) });
    await screen.findByText('Bài số 0');
    const original = apiModule.api.get;
    apiModule.api.get = (p: string) => (p.includes('skip=20') ? Promise.reject(new Error('mạng')) : original(p));
    await triggerInfiniteScroll();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xem thêm bài viết' })).toBeTruthy());
    expect(screen.getByText('Bài số 0')).toBeTruthy();
    apiModule.api.get = original;
  });
});

describe('Lỗi KHÔNG phải ApiError → câu báo lỗi mặc định', () => {
  const failAll = () => {
    const keep = { ...apiModule.api };
    for (const m of ['post', 'patch', 'delete'] as const) apiModule.api[m] = () => Promise.reject(new Error('mất mạng'));
    return () => Object.assign(apiModule.api, keep);
  };

  it('đăng bài', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    const restore = failAll();
    await user.click(screen.getByText('Trần Xuân Hoàng ơi, bạn đang nghĩ gì thế?'));
    await user.type(screen.getByRole('textbox'), 'x');
    await user.click(screen.getByRole('button', { name: 'Đăng bài viết' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Không thể đăng bài viết.');
    restore();
  });

  it('đổi mật khẩu', async () => {
    const { user } = renderApp('/settings');
    await screen.findByText('Đổi mật khẩu', { selector: 'h2' });
    const restore = failAll();
    await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'secret123');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'matkhaumoi');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'matkhaumoi');
    await user.click(screen.getByRole('button', { name: 'Cập nhật mật khẩu' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Không thể đổi mật khẩu.');
    restore();
  });

  it('đặt lại mật khẩu', async () => {
    const { user } = renderApp('/reset-password?token=good-token&email=a%40b.vn', { loggedIn: false });
    const restore = failAll();
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'matkhaumoi');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'matkhaumoi');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Đã có lỗi xảy ra, vui lòng thử lại.');
    restore();
  });

  it('tải danh sách chặn / tải thêm thông báo bị lỗi → không sập', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, userId: 'u1', actor: makeUser('f1', 'Bạn Một'), type: 'system' as const, content: `tb ${i}`, isRead: true, createdAt: new Date().toISOString() }));
    const { user } = renderApp('/notifications', { seed: () => void (db.notifications = many) });
    await screen.findByText(/tb 0$/);
    const original = apiModule.api.get;
    apiModule.api.get = (p: string) => (p.includes('skip=') ? Promise.reject(new Error('mạng')) : original(p));
    await user.click(screen.getByRole('button', { name: 'Xem thêm thông báo' }));
    expect(screen.getByRole('button', { name: 'Xem thêm thông báo' })).toBeTruthy();
    apiModule.api.get = original;
  });
});

describe('Bình luận / bài viết — nhánh hiếm', () => {
  it('comment:new / comment:delete khi khung bình luận CHƯA mở vẫn cập nhật bộ đếm, không lỗi', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('comment:new', { postId: 'p1', comment: { id: 'z', postId: 'p1', author: makeUser('f2', 'Bạn Hai'), content: 'x', createdAt: new Date().toISOString(), likes: [] } }));
    expect(await within(post('p1')).findByText('1 bình luận')).toBeTruthy();
    act(() => serverEmit('comment:delete', { postId: 'p3', commentId: 'khong-co' }));
  });

  it('đóng rồi mở lại khung bình luận chỉ tải 1 lần', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    const btn = () => within(post('p2')).getByRole('button', { name: 'Bình luận' });
    await user.click(btn());
    await within(post('p2')).findByText('Bình luận đầu tiên');
    await user.click(btn());
    await user.click(btn());
    expect(calls.filter((c) => c.path === '/comments?postId=p2')).toHaveLength(1);
  });

  it('bình luận đã thích bởi mình hiển thị trạng thái đã thích', async () => {
    const { user } = renderApp('/', { seed: () => void (db.comments[0].likes = ['u1']) });
    await feedLoaded();
    await user.click(within(post('p2')).getByRole('button', { name: 'Bình luận' }));
    const liked = await within(post('p2')).findByRole('button', { name: '👍 Thích' });
    expect(liked.className).toContain('text-blue-600');
  });

  it('gửi bình luận / trả lời rỗng (bỏ qua nút khoá) → không gọi API', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(within(post('p2')).getByRole('button', { name: 'Bình luận' }));
    await within(post('p2')).findByText('Bình luận đầu tiên');
    fireEvent.submit(within(post('p2')).getByPlaceholderText(/Viết bình luận/).closest('form')!);
    await user.click(within(post('p2')).getByRole('button', { name: 'Trả lời' }));
    fireEvent.submit(within(post('p2')).getByPlaceholderText('Trả lời Bạn Một...').closest('form')!);
    expect(calls.some((c) => c.method === 'POST' && c.path === '/comments')).toBe(false);
  });

  it('bỏ ghim hiện toast "Đã bỏ ghim bài viết"; menu đóng/mở lặp lại', async () => {
    const { user } = renderApp('/', { seed: () => void (db.posts[1].pinned = true) });
    await feedLoaded();
    const menuBtn = () => within(post('p2')).getByRole('button', { name: 'Tuỳ chọn bài viết' });
    await user.click(menuBtn());
    await user.click(menuBtn());
    expect(within(post('p2')).queryByText('Bỏ ghim bài viết')).toBeNull();
    await user.click(menuBtn());
    await user.click(within(post('p2')).getByText('Bỏ ghim bài viết'));
    expect(await screen.findByText('Đã bỏ ghim bài viết')).toBeTruthy();
  });

  it('bài đã lưu → menu hiện "Bỏ lưu bài viết"; vừa có bình luận vừa có chia sẻ → dấu " · "; menu chia sẻ đóng/mở lặp lại', async () => {
    const { user } = renderApp('/', { seed: () => void Object.assign(db.posts[1], { isSaved: true, sharesCount: 3 }) });
    await feedLoaded();
    expect(post('p2').textContent).toContain('1 bình luận · 3 lượt chia sẻ');
    await user.click(within(post('p2')).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    expect(within(post('p2')).getAllByText('Bỏ lưu bài viết').length).toBeGreaterThan(0);
    const shareBtn = () => within(post('p2')).getByRole('button', { name: 'Chia sẻ' });
    await user.click(shareBtn());
    await user.click(shareBtn());
    expect(within(post('p2')).queryByText('Chia sẻ lên trang cá nhân')).toBeNull();
  });

  it('hộp thoại đăng bài: gửi rỗng (bỏ qua nút khoá) không gọi API; chọn trùng bạn bè không gắn thẻ 2 lần; mở/đóng panel lặp lại', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByText('Trần Xuân Hoàng ơi, bạn đang nghĩ gì thế?'));
    const dialog = screen.getByRole('dialog', { name: 'Đăng bài' });
    fireEvent.submit(dialog);
    expect(calls.some((c) => c.method === 'POST' && c.path === '/posts')).toBe(false);
    for (const title of ['Cảm xúc', 'Gắn thẻ bạn bè']) {
      await user.click(within(dialog).getByTitle(title));
      await user.click(within(dialog).getByTitle(title));
    }
    const box = within(dialog).getByRole('textbox');
    for (let i = 0; i < 2; i++) {
      await user.type(box, ' @Bạn');
      await user.click(await within(dialog).findByText('Bạn Một', { selector: 'span.text-xs.font-semibold' }));
    }
    await user.click(within(dialog).getByRole('button', { name: 'Đăng bài viết' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/posts')?.body).toMatchObject({ taggedUserIds: ['f1'] }));
  });

  it('sửa bài không có nút gắn thẻ', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(within(post('p2')).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
    await user.click(within(post('p2')).getByText('Chỉnh sửa bài viết'));
    expect(within(screen.getByRole('dialog', { name: 'Đăng bài' })).queryByTitle('Gắn thẻ bạn bè')).toBeNull();
  });
});

describe('Thông báo — nhánh hiếm', () => {
  it('thông báo hệ thống không có đích → không điều hướng, vẫn đánh dấu đã đọc', async () => {
    const { user, location } = renderApp('/notifications', { seed: () => void db.notifications.unshift({ id: 'sys', userId: 'u1', actor: makeUser('f1', 'Bạn Một'), type: 'system', content: 'thông báo hệ thống', targetType: 'system', isRead: false, createdAt: new Date().toISOString() }) });
    await user.click(await screen.findByText(/thông báo hệ thống/));
    expect(location()).toBe('/notifications');
    expect(calls.some((c) => c.path === '/notifications/sys/read')).toBe(true);
  });

  it('thông báo về bài chưa có trong bảng tin → tải bài đó từ server rồi mở', async () => {
    const { user, location } = renderApp('/notifications', {
      seed: () => {
        db.posts = bulk(25);
        db.notifications.unshift({ id: 'far', userId: 'u1', actor: makeUser('f1', 'Bạn Một'), type: 'like', content: 'thích bài cũ', targetId: 'b24', targetType: 'post', isRead: false, createdAt: new Date().toISOString() });
      },
    });
    await user.click(await screen.findByText(/thích bài cũ/));
    await waitFor(() => expect(location()).toBe('/'));
    expect(calls.some((c) => c.path === '/posts/b24')).toBe(true);
    expect(await screen.findByText('Bài số 24')).toBeTruthy();
  });

  it('thông báo về bài không còn tồn tại → vẫn về bảng tin, không lỗi', async () => {
    const { user, location } = renderApp('/notifications', { seed: () => void db.notifications.unshift({ id: 'gone', userId: 'u1', actor: makeUser('f1', 'Bạn Một'), type: 'like', content: 'thích bài đã xoá', targetId: 'khong-co', targetType: 'post', isRead: false, createdAt: new Date().toISOString() }) });
    await user.click(await screen.findByText(/thích bài đã xoá/));
    await waitFor(() => expect(location()).toBe('/'));
  });

  it('friend_request realtime → tải lại danh sách lời mời để có nút Chấp nhận', async () => {
    renderApp('/');
    await feedLoaded();
    db.requestsIn.push({ id: 'r9', sender: makeUser('s1', 'Người Lạ'), receiverId: 'u1', createdAt: new Date().toISOString() });
    act(() => serverEmit('notification:new', { id: 'nr', userId: 'u1', actor: makeUser('s1', 'Người Lạ'), type: 'friend_request', content: 'gửi lời mời', isRead: false, createdAt: new Date().toISOString() }));
    await waitFor(() => expect(screen.getAllByText('Người Lạ').length).toBeGreaterThan(1));
    expect(calls.filter((c) => c.path === '/friends/requests').length).toBeGreaterThanOrEqual(2);
  });

  it('menu thông báo trên Navbar bật/tắt lặp lại', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    const bell = screen.getByRole('button', { name: 'Thông báo' });
    await user.click(bell);
    expect(screen.getByText('Xem tất cả')).toBeTruthy();
    await user.click(bell);
    expect(screen.queryByText('Xem tất cả')).toBeNull();
  });
});

describe('Chat — nhánh hiếm', () => {
  it('tin nhắn đến trùng id với tin đang hiển thị → cập nhật tại chỗ, không nhân đôi', async () => {
    await openChat();
    const updated: Message = { ...db.messages.cv1[0], content: 'Xin chào (đã sửa)' };
    act(() => serverEmit('message:new', { conversationId: 'cv1', message: updated }));
    expect(await screen.findByText('Xin chào (đã sửa)', { selector: 'p.whitespace-pre-wrap' })).toBeTruthy();
    expect(screen.queryByText('Xin chào', { selector: 'p.whitespace-pre-wrap' })).toBeNull();
  });

  it('tin nhắn tới chỉ có tệp đính kèm → toast "Đã gửi một tệp đính kèm"', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('message:new', { conversationId: 'cv1', message: { id: 'att', conversationId: 'cv1', kind: 'text', senderId: 'f1', senderName: 'Bạn Một', senderAvatar: '', content: '', createdAt: new Date().toISOString(), isRead: false, attachments: [{ type: 'file', url: '/f.pdf', name: 'f.pdf' }] } }));
    expect(await screen.findByText('Bạn Một: Đã gửi một tệp đính kèm')).toBeTruthy();
  });

  it('tải tin nhắn thất bại → cửa sổ vẫn mở, không sập', async () => {
    const original = apiModule.api.get;
    apiModule.api.get = (p: string) => (p.endsWith('/messages') ? Promise.reject(new Error('mạng')) : original(p));
    const ctx = renderApp('/');
    await feedLoaded();
    await ctx.user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    await ctx.user.click(await screen.findByText('Bạn: Chào bạn'));
    expect(await screen.findByPlaceholderText('Nhập tin nhắn...')).toBeTruthy();
    apiModule.api.get = original;
  });

  it('danh sách chat: tin chỉ có tệp, tin của người kia không có "Bạn: ", hội thoại thiếu người đối diện', async () => {
    const { user } = renderApp('/', {
      seed: () => {
        db.conversations[0].lastMessage = { ...db.messages.cv1[0], content: '', attachments: [{ type: 'file', url: '/f', name: 'f' }] };
        db.conversations.push({ id: 'solo', isGroup: false, participants: [db.me], nicknames: {}, unreadCount: 0, updatedAt: new Date().toISOString() });
        db.messages.solo = [];
      },
    });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    expect(await screen.findByText('Đã gửi một tệp đính kèm')).toBeTruthy();
    expect(screen.queryByText(/Bạn: Đã gửi/)).toBeNull();
    expect(screen.getByText('Bắt đầu cuộc trò chuyện')).toBeTruthy();
  });

  it('đặt biệt danh khi có nhiều hội thoại → chỉ đổi đúng hội thoại', async () => {
    const { user } = renderApp('/', { seed: () => void db.conversations.push({ id: 'cv2', isGroup: false, participants: [db.me, db.users[2]], nicknames: {}, unreadCount: 0, updatedAt: new Date(Date.now() - 1e6).toISOString() }) });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    await user.click(await screen.findByText('Bạn: Chào bạn'));
    await user.click(await screen.findByRole('button', { name: 'Tuỳ chọn' }));
    await user.click(screen.getByText('Đặt biệt danh'));
    await user.type(screen.getByPlaceholderText(/Biệt danh cho/), 'BD');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(db.conversations[0].nicknames).toEqual({ f1: 'BD' }));
    expect(db.conversations[1].nicknames).toEqual({});
  });

  it('cửa sổ chat: gửi rỗng (bỏ qua nút khoá) không gọi API; bật/tắt các panel lặp lại; bấm ngoài đóng menu tuỳ chọn', async () => {
    const { user } = await openChat();
    fireEvent.submit(screen.getByPlaceholderText('Nhập tin nhắn...').closest('form')!);
    expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/messages'))).toBe(false);
    for (const name of ['Tuỳ chọn', 'Đính kèm', 'Emoji']) {
      await user.click(screen.getByRole('button', { name }));
      await user.click(screen.getByRole('button', { name }));
    }
    fireEvent.mouseDown(document.body); // khi menu đang đóng
    await user.click(screen.getByRole('button', { name: 'Tuỳ chọn' }));
    fireEvent.mouseDown(document.body); // khi menu đang mở
    expect(screen.queryByText('Màu chủ đề')).toBeNull();
  });

  it('tin có cảm xúc từ nhiều người hiện số lượng; thả cảm xúc lên tin của mình / của người khác', async () => {
    const { user } = renderApp('/', { seed: () => void (db.messages.cv1[0].reactions = { u1: '👍', f1: '❤️', x: '👍' }) });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    await user.click(await screen.findByText('Bạn: Chào bạn'));
    expect(await screen.findByText(/👍❤️\s*3/)).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: 'Thả cảm xúc' });
    await user.click(buttons[1]); // tin của mình → bảng cảm xúc căn phải
    expect(screen.getByRole('button', { name: '😂' }).parentElement!.className).toContain('right-0');
  });
});

describe('Story / hook — nhánh hiếm', () => {
  it('xoá story duy nhất của mình khi đang xem → trình xem tự đóng', async () => {
    const { user } = renderApp('/', {
      seed: () => {
        db.stories = [{ id: 'only', user: db.me, type: 'text', privacy: 'public', textContent: 'Tin duy nhất', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1e8).toISOString(), viewers: [] }];
      },
    });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Xem tin của Trần Xuân Hoàng' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Xem tin' })).getByRole('button', { name: 'Xóa tin' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Đồng ý' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Xem tin' })).toBeNull());
  });

  it('trả lời story rỗng (bỏ qua nút khoá) không gửi', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Xem tin của Bạn Một' }));
    const form = screen.getByPlaceholderText('Gửi tin nhắn cho Bạn Một...').closest('form')!;
    fireEvent.submit(form);
    expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/messages'))).toBe(false);
  });

  it('chọn tệp rỗng (huỷ hộp thoại chọn tệp) → không upload, không lỗi', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByText('Trần Xuân Hoàng ơi, bạn đang nghĩ gì thế?'));
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(screen.queryByText('Đang tải lên...')).toBeNull();
  });
});

describe('Trang — nhánh hiếm', () => {
  it('lời mời đã gửi thiếu thông tin người nhận → bỏ qua thẻ đó', async () => {
    const { user } = renderApp('/friends', { seed: () => void db.requestsOut.push({ id: 'ghost', sender: db.me, receiverId: 'gone', createdAt: new Date().toISOString() }) });
    await screen.findByText('2 bạn bè · 1 lời mời');
    await user.click(screen.getByRole('button', { name: /^Lời mời/ }));
    expect(screen.getByText('Lời mời đã gửi (2)')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Hủy lời mời' })).toHaveLength(1);
  });

  it('hồ sơ của mình khi chưa có bạn → tab Bạn bè trống', async () => {
    const { user } = renderApp('/profile/u1', { seed: () => void (db.friends = []) });
    await user.click(await screen.findByRole('button', { name: 'Bạn bè (0)' }));
    expect(screen.getByText('Chưa có bạn bè nào')).toBeTruthy();
  });

  it('website đã có http(s):// thì giữ nguyên liên kết', async () => {
    const { user } = renderApp('/profile/u1', { seed: () => void (db.me.website = 'http://trang.vn/a') });
    await user.click(await screen.findByRole('button', { name: 'Giới thiệu' }));
    expect(screen.getByRole('link', { name: 'http://trang.vn/a' }).getAttribute('href')).toBe('http://trang.vn/a');
  });

  it('sửa hồ sơ khi chưa có thông tin phụ → các ô trống', async () => {
    renderApp('/settings/profile', { seed: () => void Object.assign(db.me, { bio: undefined, workplace: undefined, education: undefined, location: undefined, website: undefined, coverImage: undefined }) });
    expect(((await screen.findByLabelText('Nơi làm việc')) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Website') as HTMLInputElement).value).toBe('');
    expect(screen.queryByAltText('Ảnh bìa')).toBeNull();
  });
});

afterEach(() => vi.useRealTimers());

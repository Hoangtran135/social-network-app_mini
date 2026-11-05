// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, screen, waitFor, within, fireEvent, act } from './harness';
import { db, calls, emitted, serverEmit, makeUser } from './fakeServer';
import type { Message } from '../../src/types';

// Chat: trạng thái online / lần cuối hoạt động, "đang gõ...", đã gửi / đã nhận / đã xem, "Xóa với tôi".

beforeEach(() => installBrowserStubs());
afterEach(() => vi.useRealTimers());

const openChat = async (seed?: () => void, fakeTimers = false) => {
  if (fakeTimers) vi.useFakeTimers({ shouldAdvanceTime: true });
  const ctx = renderApp('/', { seed });
  await feedLoaded();
  await ctx.user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
  await ctx.user.click(await screen.findByText('Bạn: Chào bạn'));
  await screen.findByPlaceholderText('Nhập tin nhắn...');
  return ctx;
};
const incoming = (over: Partial<Message> = {}) => ({
  conversationId: 'cv1',
  message: { id: 'in1', conversationId: 'cv1', kind: 'text', senderId: 'f1', senderName: 'Bạn Một', senderAvatar: '', content: 'Tin mới', createdAt: new Date().toISOString(), isRead: false, ...over },
});
const typingEvents = () => emitted.filter((e) => e.event === 'typing').map((e) => (e.payload as { isTyping: boolean }).isTyping);
const input = () => screen.getByPlaceholderText('Nhập tin nhắn...') as HTMLInputElement;

describe('Đã nhận (delivered)', () => {
  it('tin mới từ người khác → báo "message:delivered" lên server', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('message:new', incoming()));
    await waitFor(() => expect(emitted.filter((e) => e.event === 'message:delivered')).toEqual([{ event: 'message:delivered', payload: { conversationId: 'cv1', messageId: 'in1' } }]));
  });

  it('tin của chính mình / tin hệ thống → KHÔNG báo đã nhận', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('message:new', incoming({ senderId: 'u1', id: 'mine' })));
    act(() => serverEmit('message:new', incoming({ kind: 'system', id: 'sys' })));
    expect(emitted.filter((e) => e.event === 'message:delivered')).toEqual([]);
  });
});

describe('Trạng thái tin nhắn của mình', () => {
  const unread = () => void (db.messages.cv1[1].isRead = false); // tin của mình chưa ai đọc
  it('chỉ tin CUỐI của mình có nhãn; mặc định "Đã gửi"', async () => {
    await openChat(unread);
    expect(screen.getAllByText(/^Đã (gửi|nhận|xem)$/)).toHaveLength(1);
    expect(screen.getByText('Đã gửi')).toBeTruthy();
  });

  it('người nhận báo đã nhận → "Đã nhận"', async () => {
    await openChat(unread);
    act(() => serverEmit('message:delivered', { conversationId: 'cv1', messageId: 'm2', userId: 'f1' }));
    expect(await screen.findByText('Đã nhận')).toBeTruthy();
  });

  it('đã đọc → "Đã xem" (ưu tiên hơn đã nhận)', async () => {
    await openChat(() => void Object.assign(db.messages.cv1[1], { isRead: true, deliveredTo: ['f1'] }));
    expect(screen.getByText('Đã xem')).toBeTruthy();
    expect(screen.queryByText('Đã nhận')).toBeNull();
  });

  it('gửi tin mới → nhãn chuyển sang tin mới nhất ("Đã gửi")', async () => {
    const { user } = await openChat(() => void Object.assign(db.messages.cv1[1], { isRead: true }));
    expect(screen.getByText('Đã xem')).toBeTruthy();
    await user.type(input(), 'Tin tiếp theo');
    await user.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(await screen.findByText('Đã gửi')).toBeTruthy();
    expect(screen.queryByText('Đã xem')).toBeNull();
  });

  it('tin cuối của mình bị thu hồi → nhãn chuyển về tin trước đó', async () => {
    const { user } = await openChat();
    await user.type(input(), 'Tin sẽ thu hồi');
    await user.click(screen.getByRole('button', { name: 'Gửi' }));
    await screen.findByText('Tin sẽ thu hồi');
    const recallButtons = screen.getAllByTitle('Thu hồi');
    await user.click(recallButtons[recallButtons.length - 1]);
    await screen.findByText('Tin nhắn đã được thu hồi');
    expect(screen.getAllByText(/^Đã (gửi|nhận|xem)$/)).toHaveLength(1);
  });

  it('báo đã nhận cho tin không còn trong cửa sổ → không lỗi', async () => {
    await openChat(unread);
    act(() => serverEmit('message:delivered', { conversationId: 'khac', messageId: 'x', userId: 'f1' }));
    act(() => serverEmit('message:delivered', { conversationId: 'cv1', messageId: 'm2', userId: 'f1' }));
    act(() => serverEmit('message:delivered', { conversationId: 'cv1', messageId: 'm2', userId: 'f1' }));
    expect(await screen.findByText('Đã nhận')).toBeTruthy();
  });
});

describe('"Đang gõ..." — nhận', () => {
  it('người kia đang gõ → hiện "Bạn Một đang gõ..."; ngừng gõ → biến mất', async () => {
    await openChat();
    expect(screen.queryByText(/đang gõ/)).toBeNull();
    act(() => serverEmit('typing', { conversationId: 'cv1', userId: 'f1', isTyping: true }));
    expect(await screen.findByText(/Bạn Một đang gõ\.\.\./)).toBeTruthy();
    act(() => serverEmit('typing', { conversationId: 'cv1', userId: 'f1', isTyping: false }));
    await waitFor(() => expect(screen.queryByText(/đang gõ/)).toBeNull());
  });

  it('không có tín hiệu mới sau 5 giây → tự tắt (phòng mất mạng giữa chừng)', async () => {
    await openChat(undefined, true);
    act(() => serverEmit('typing', { conversationId: 'cv1', userId: 'f1', isTyping: true }));
    expect(await screen.findByText(/đang gõ/)).toBeTruthy();
    await act(async () => void vi.advanceTimersByTime(5200));
    expect(screen.queryByText(/đang gõ/)).toBeNull();
  });

  it('tín hiệu gõ liên tục làm mới bộ đếm 5 giây', async () => {
    await openChat(undefined, true);
    act(() => serverEmit('typing', { conversationId: 'cv1', userId: 'f1', isTyping: true }));
    await act(async () => void vi.advanceTimersByTime(3000));
    act(() => serverEmit('typing', { conversationId: 'cv1', userId: 'f1', isTyping: true }));
    await act(async () => void vi.advanceTimersByTime(3000));
    expect(screen.getByText(/đang gõ/)).toBeTruthy();
  });

  it('họ gửi tin xong thì hết "đang gõ"', async () => {
    await openChat();
    act(() => serverEmit('typing', { conversationId: 'cv1', userId: 'f1', isTyping: true }));
    await screen.findByText(/đang gõ/);
    act(() => serverEmit('message:new', incoming()));
    await waitFor(() => expect(screen.queryByText(/đang gõ/)).toBeNull());
  });

  it('hội thoại khác đang gõ không hiện ở cửa sổ này; nhóm hiện nhiều tên', async () => {
    await openChat();
    act(() => serverEmit('typing', { conversationId: 'khac', userId: 'f1', isTyping: true }));
    expect(screen.queryByText(/đang gõ/)).toBeNull();
  });

  it('nhóm chat: nhiều người cùng gõ → liệt kê tên', async () => {
    const { user } = renderApp('/', {
      seed: () => {
        db.conversations.unshift({ id: 'g1', isGroup: true, name: 'Nhóm lớp', avatar: '/g.png', participants: [db.me, db.users[1], db.users[2]], nicknames: {}, unreadCount: 0, updatedAt: new Date().toISOString() });
        db.messages.g1 = [];
      },
    });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    await user.click(await screen.findByText('Nhóm lớp'));
    await screen.findByPlaceholderText('Nhập tin nhắn...');
    act(() => serverEmit('typing', { conversationId: 'g1', userId: 'f1', isTyping: true }));
    act(() => serverEmit('typing', { conversationId: 'g1', userId: 'f2', isTyping: true }));
    expect(await screen.findByText(/Bạn Một, Bạn Hai đang gõ\.\.\./)).toBeTruthy();
  });
});

describe('"Đang gõ..." — gửi', () => {
  it('bắt đầu gõ → báo MỘT lần; gõ tiếp không báo lại', async () => {
    const { user } = await openChat(undefined, true);
    await user.type(input(), 'abc');
    expect(typingEvents()).toEqual([true]);
    expect(emitted.find((e) => e.event === 'typing')?.payload).toEqual({ conversationId: 'cv1', isTyping: true });
  });

  it('ngừng gõ 2,5 giây → báo ngừng', async () => {
    const { user } = await openChat(undefined, true);
    await user.type(input(), 'abc');
    await act(async () => void vi.advanceTimersByTime(2700));
    expect(typingEvents()).toEqual([true, false]);
  });

  it('xoá hết chữ → báo ngừng ngay', async () => {
    const { user } = await openChat(undefined, true);
    await user.type(input(), 'ab');
    await user.clear(input());
    expect(typingEvents()).toEqual([true, false]);
  });

  it('gửi tin → báo ngừng', async () => {
    const { user } = await openChat(undefined, true);
    await user.type(input(), 'xin chào');
    await user.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(typingEvents()).toEqual([true, false]);
  });

  it('đóng cửa sổ khi đang gõ → báo ngừng', async () => {
    const { user } = await openChat(undefined, true);
    await user.type(input(), 'dở dang');
    await user.click(screen.getByRole('button', { name: 'Đóng cuộc trò chuyện' }));
    expect(typingEvents()).toEqual([true, false]);
  });

  it('chỉ gõ khoảng trắng → không báo "đang gõ"', async () => {
    const { user } = await openChat(undefined, true);
    await user.type(input(), '   ');
    expect(typingEvents()).toEqual([]);
  });

  it('gõ lại sau khi đã ngừng → báo bắt đầu lần nữa', async () => {
    const { user } = await openChat(undefined, true);
    await user.type(input(), 'a');
    await act(async () => void vi.advanceTimersByTime(2700));
    await user.type(input(), 'b');
    expect(typingEvents()).toEqual([true, false, true]);
  });
});

describe('Online / lần cuối hoạt động', () => {
  it('người kia đang online → "Đang hoạt động"; không có lastActive → "Không hoạt động"', async () => {
    await openChat();
    expect(screen.getByText('Đang hoạt động', { selector: 'div.opacity-80' })).toBeTruthy();
    expect(screen.queryByText(/^Hoạt động /)).toBeNull();
  });

  it('presence:update offline kèm lastActive → "Hoạt động 5 phút trước" + danh sách bạn "Ngoại tuyến"', async () => {
    await openChat();
    act(() => serverEmit('presence:update', { userId: 'f1', isOnline: false, lastActive: new Date(Date.now() - 5 * 60000).toISOString() }));
    expect(await screen.findByText('Hoạt động 5 phút trước')).toBeTruthy();
    const contacts = screen.getByText(/Người liên hệ/).closest('.card') as HTMLElement;
    await waitFor(() => expect(within(contacts).getAllByText('Ngoại tuyến')).toHaveLength(2));
  });

  it('online trở lại → "Đang hoạt động" và chấm xanh', async () => {
    await openChat(() => void Object.assign(db.users[1], { isOnline: false, lastActive: new Date(Date.now() - 3600000).toISOString() }));
    expect(screen.getByText('Hoạt động 1 giờ trước')).toBeTruthy();
    act(() => serverEmit('presence:update', { userId: 'f1', isOnline: true }));
    expect(await screen.findByText('Đang hoạt động', { selector: 'div.opacity-80' })).toBeTruthy();
    expect(screen.queryByText(/^Hoạt động /)).toBeNull();
  });

  it('bạn bè offline xếp sau bạn bè online ở danh sách liên hệ', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('presence:update', { userId: 'f2', isOnline: true }));
    act(() => serverEmit('presence:update', { userId: 'f1', isOnline: false, lastActive: new Date().toISOString() }));
    const contacts = screen.getByText(/Người liên hệ/).closest('.card') as HTMLElement;
    await waitFor(() => expect(within(contacts).getAllByRole('button')[0].textContent).toContain('Bạn Hai'));
  });

  it('sự kiện của người lạ (không trong danh sách) → bỏ qua, không lỗi', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('presence:update', { userId: 'khong-quen', isOnline: true }));
    expect(screen.getByText('Người liên hệ (2)')).toBeTruthy();
  });

  it('người đang theo dõi cũng cập nhật trạng thái', async () => {
    renderApp('/', { seed: () => void (db.following = ['s1']) });
    await feedLoaded();
    act(() => serverEmit('presence:update', { userId: 's1', isOnline: true }));
    expect(screen.getByText('Người liên hệ (2)')).toBeTruthy();
  });
});

describe('"Xóa với tôi"', () => {
  it('mỗi tin (của mình và của người khác) đều có nút "Xóa với tôi"', async () => {
    await openChat();
    expect(screen.getAllByTitle('Xóa với tôi')).toHaveLength(2);
  });

  it('xoá tin của người khác → biến mất khỏi cửa sổ, gọi đúng API', async () => {
    const { user } = await openChat();
    await user.click(screen.getAllByTitle('Xóa với tôi')[0]);
    await waitFor(() => expect(screen.queryByText('Xin chào', { selector: 'p.whitespace-pre-wrap' })).toBeNull());
    expect(calls.some((c) => c.method === 'POST' && c.path === '/messages/conversations/cv1/messages/m1/delete-for-me')).toBe(true);
    expect(screen.getByText('Chào bạn', { selector: 'p.whitespace-pre-wrap' })).toBeTruthy();
  });

  it('xoá tin của mình khác với thu hồi: không hiện "đã được thu hồi"', async () => {
    const { user } = await openChat();
    await user.click(screen.getAllByTitle('Xóa với tôi')[1]);
    await waitFor(() => expect(screen.queryByText('Chào bạn', { selector: 'p.whitespace-pre-wrap' })).toBeNull());
    expect(screen.queryByText('Tin nhắn đã được thu hồi')).toBeNull();
  });

  it('xoá tin cuối → tin cuối trong danh sách chat lùi về tin trước đó', async () => {
    const { user } = await openChat();
    await user.click(screen.getAllByTitle('Xóa với tôi')[1]); // xoá "Chào bạn"
    await waitFor(() => expect(screen.queryByText('Chào bạn', { selector: 'p.whitespace-pre-wrap' })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    expect(await screen.findByText('Xin chào', { selector: 'p.truncate' })).toBeTruthy();
  });

  it('xoá hết tin → danh sách chat hiện "Bắt đầu cuộc trò chuyện"', async () => {
    const { user } = await openChat();
    await user.click(screen.getAllByTitle('Xóa với tôi')[0]);
    await user.click(screen.getAllByTitle('Xóa với tôi')[0]);
    await waitFor(() => expect(screen.queryAllByTitle('Xóa với tôi')).toHaveLength(0));
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    expect(await screen.findByText('Bắt đầu cuộc trò chuyện')).toBeTruthy();
  });

  it('server lỗi → toast lỗi và tin vẫn còn', async () => {
    const { user } = await openChat();
    db.failNext.add('POST /messages/conversations/cv1/messages/m1/delete-for-me');
    await user.click(screen.getAllByTitle('Xóa với tôi')[0]);
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(screen.getByText('Xin chào', { selector: 'p.whitespace-pre-wrap' })).toBeTruthy();
  });

  it('tin đã thu hồi vẫn có nút xoá với tôi nhưng không còn nút thả cảm xúc / thu hồi', async () => {
    const { user } = await openChat();
    await user.click(screen.getByTitle('Thu hồi'));
    await screen.findByText('Tin nhắn đã được thu hồi');
    expect(screen.queryByTitle('Thu hồi')).toBeNull();
    expect(screen.getAllByTitle('Xóa với tôi').length).toBeGreaterThan(0);
    void makeUser; void fireEvent;
  });
});

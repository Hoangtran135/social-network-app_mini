// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, screen, waitFor, within, fireEvent, act } from './harness';
import { db, calls, makeUser, serverEmit, apiModule } from './fakeServer';

// Chat (danh sách + cửa sổ), story (tạo + xem), Navbar (menu thả xuống), sidebar phải.

beforeEach(() => installBrowserStubs());
type Ctx = ReturnType<typeof renderApp>;
const confirmDialog = async (user: Ctx['user'], button = 'Đồng ý') => user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: button }));

/** Mở bảng tin rồi mở cửa sổ chat với Bạn Một qua menu tin nhắn trên Navbar. */
async function openChat() {
  const ctx = renderApp('/');
  await feedLoaded();
  await ctx.user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
  await ctx.user.click(await screen.findByText('Bạn: Chào bạn'));
  await screen.findByPlaceholderText('Nhập tin nhắn...');
  return ctx;
}
const sendText = async (user: Ctx['user'], text: string) => {
  await user.type(screen.getByPlaceholderText('Nhập tin nhắn...'), text);
  await user.click(screen.getByRole('button', { name: 'Gửi' }));
};

describe('Danh sách đoạn chat (menu tin nhắn)', () => {
  it('huy hiệu số tin chưa đọc trên nút Tin nhắn', async () => {
    renderApp('/');
    await feedLoaded();
    expect(within(screen.getByRole('button', { name: 'Tin nhắn' })).getByText('2')).toBeTruthy();
  });

  it('mở menu: thấy hội thoại, tin cuối ("Bạn: ..."), số chưa đọc', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    expect(await screen.findByText('Đoạn chat')).toBeTruthy();
    expect(screen.getByText('Bạn: Chào bạn')).toBeTruthy();
  });

  it('tìm kiếm cuộc trò chuyện; không có → thông báo', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    await user.type(await screen.findByPlaceholderText('Tìm kiếm cuộc trò chuyện'), 'zzz');
    expect(screen.getByText('Không tìm thấy cuộc trò chuyện nào')).toBeTruthy();
    await user.clear(screen.getByPlaceholderText('Tìm kiếm cuộc trò chuyện'));
    await user.type(screen.getByPlaceholderText('Tìm kiếm cuộc trò chuyện'), 'một');
    expect(screen.getByText('Bạn: Chào bạn')).toBeTruthy();
  });

  it('bấm hội thoại → mở cửa sổ chat, menu đóng, số chưa đọc về 0', async () => {
    await openChat();
    expect(screen.queryByText('Đoạn chat')).toBeNull();
    expect(screen.getByText('Xin chào')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: 'Tin nhắn' })).queryByText('2')).toBeNull();
  });

  it('tạo chat 1-1: chọn 1 bạn → "Bắt đầu trò chuyện"', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    await user.click(await screen.findByRole('button', { name: 'Tin nhắn mới' }));
    await user.click(within(screen.getByRole('banner')).getByText('Bạn Hai'));
    await user.click(screen.getByRole('button', { name: 'Bắt đầu trò chuyện' }));
    expect(await screen.findByPlaceholderText('Nhập tin nhắn...')).toBeTruthy();
  });

  it('tạo nhóm: chọn 2 bạn bắt buộc có tên nhóm', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    await user.click(await screen.findByRole('button', { name: 'Tin nhắn mới' }));
    await user.click(within(screen.getByRole('banner')).getByText('Bạn Một'));
    await user.click(within(screen.getByRole('banner')).getByText('Bạn Hai'));
    const create = screen.getByRole('button', { name: 'Tạo nhóm (2 người)' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    await user.type(screen.getByPlaceholderText('Đặt tên nhóm chat...'), 'Nhóm đồ án');
    expect(create.disabled).toBe(false);
    await user.click(create);
    expect(await screen.findByText('Nhóm đồ án')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST' && c.path === '/messages/conversations')?.body).toMatchObject({ participantIds: ['f1', 'f2'], name: 'Nhóm đồ án' });
  });

  it('chưa chọn ai → nút bắt đầu bị khoá; bấm "+" lần nữa quay lại danh sách', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    await user.click(await screen.findByRole('button', { name: 'Tin nhắn mới' }));
    expect((screen.getByRole('button', { name: 'Bắt đầu trò chuyện' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Quay lại danh sách' }));
    expect(screen.getByPlaceholderText('Tìm kiếm cuộc trò chuyện')).toBeTruthy();
  });
});

describe('Cửa sổ chat', () => {
  it('hiện tên, trạng thái online, lịch sử tin nhắn', async () => {
    await openChat();
    expect(screen.getAllByText('Bạn Một').length).toBeGreaterThan(0);
    expect(screen.getByText('Đang hoạt động', { selector: 'div.opacity-80' })).toBeTruthy();
    expect(screen.getByText('Xin chào')).toBeTruthy();
    expect(screen.getByText('Chào bạn')).toBeTruthy();
  });

  it('gửi tin nhắn → hiện ngay, ô nhập được xoá', async () => {
    const { user } = await openChat();
    await sendText(user, 'Tin mới của tôi');
    expect(await screen.findByText('Tin mới của tôi')).toBeTruthy();
    expect((screen.getByPlaceholderText('Nhập tin nhắn...') as HTMLInputElement).value).toBe('');
    expect(calls.find((c) => c.method === 'POST' && c.path === '/messages/conversations/cv1/messages')?.body).toMatchObject({ content: 'Tin mới của tôi' });
  });

  it('nút gửi khoá khi trống / chỉ khoảng trắng; Enter cũng gửi', async () => {
    const { user } = await openChat();
    const send = screen.getByRole('button', { name: 'Gửi' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await user.type(screen.getByPlaceholderText('Nhập tin nhắn...'), '   ');
    expect(send.disabled).toBe(true);
    await user.clear(screen.getByPlaceholderText('Nhập tin nhắn...'));
    await user.type(screen.getByPlaceholderText('Nhập tin nhắn...'), 'Gửi bằng Enter{Enter}');
    expect(await screen.findByText('Gửi bằng Enter')).toBeTruthy();
  });

  it('chọn emoji nhanh chèn vào ô nhập', async () => {
    const { user } = await openChat();
    await user.type(screen.getByPlaceholderText('Nhập tin nhắn...'), 'chào');
    await user.click(screen.getByRole('button', { name: 'Emoji' }));
    await user.click(screen.getByRole('button', { name: '🔥' }));
    expect((screen.getByPlaceholderText('Nhập tin nhắn...') as HTMLInputElement).value).toBe('chào🔥');
  });

  it('đính kèm ảnh: xem trước, gửi kèm tin', async () => {
    const { user } = await openChat();
    await user.click(screen.getByRole('button', { name: 'Đính kèm' }));
    await user.click(screen.getByRole('button', { name: 'Hình ảnh' }));
    const input = document.querySelectorAll('input[type=file]')[0] as HTMLInputElement;
    await user.upload(input, new File(['x'], 'anh.png', { type: 'image/png' }));
    await waitFor(() => expect(document.querySelector('img[src="/uploads/anh.png"]')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/messages/conversations/cv1/messages' && c.method === 'POST')?.body).toMatchObject({ attachments: [{ type: 'image', url: '/uploads/anh.png' }] }));
  });

  it('đính kèm tệp: hiện tên tệp thành link', async () => {
    const { user } = await openChat();
    await user.click(screen.getByRole('button', { name: 'Đính kèm' }));
    await user.click(screen.getByRole('button', { name: 'Tệp' }));
    const input = document.querySelectorAll('input[type=file]')[1] as HTMLInputElement;
    await user.upload(input, new File(['pdf'], 'bao-cao.pdf', { type: 'application/pdf' }));
    await user.click(await screen.findByRole('button', { name: 'Gửi' }));
    expect(await screen.findByRole('link', { name: /bao-cao\.pdf/ })).toBeTruthy();
  });

  it('upload lỗi → toast "Tải tệp lên thất bại"', async () => {
    const { user } = await openChat();
    const original = apiModule.uploadFile;
    apiModule.uploadFile = () => Promise.reject(new Error('lỗi'));
    await user.upload(document.querySelectorAll('input[type=file]')[0] as HTMLInputElement, new File(['x'], 'a.png', { type: 'image/png' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Tải tệp lên thất bại');
    apiModule.uploadFile = original;
  });

  it('thu hồi tin của mình; tin người khác không có nút thu hồi', async () => {
    const { user } = await openChat();
    expect(screen.getAllByTitle('Thu hồi')).toHaveLength(1);
    await user.click(screen.getByTitle('Thu hồi'));
    expect(await screen.findByText('Tin nhắn đã được thu hồi')).toBeTruthy();
    expect(screen.queryByTitle('Thu hồi')).toBeNull();
  });

  it('thả cảm xúc lên tin nhắn; bấm lại cùng emoji thì bỏ', async () => {
    const { user } = await openChat();
    await user.click(screen.getAllByRole('button', { name: 'Thả cảm xúc' })[0]);
    await user.click(screen.getByRole('button', { name: '👍' }));
    expect(await screen.findByText('👍', { selector: 'div.mt-1' })).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Thả cảm xúc' })[0]);
    await user.click(screen.getByRole('button', { name: '👍' }));
    await waitFor(() => expect(db.messages.cv1[0].reactions).toBeUndefined());
  });

  it('đặt biệt danh → đổi tên hiển thị + tin nhắn hệ thống', async () => {
    const { user } = await openChat();
    await user.click(screen.getByRole('button', { name: 'Tuỳ chọn' }));
    await user.click(screen.getByText('Đặt biệt danh'));
    await user.type(screen.getByPlaceholderText(/Biệt danh cho Bạn Một/), 'Bạn thân');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Bạn thân', { selector: 'div.font-bold' })).toBeTruthy();
    expect(screen.getByText(/đã đặt biệt danh "Bạn thân"/)).toBeTruthy();
  });

  it('menu tuỳ chọn: link xem trang cá nhân; đổi màu chủ đề được lưu trên trình duyệt', async () => {
    const { user, location } = await openChat();
    await user.click(screen.getByRole('button', { name: 'Tuỳ chọn' }));
    const swatches = document.querySelectorAll('.grid-cols-8 button');
    expect(swatches).toHaveLength(8);
    await user.click(swatches[3]);
    expect(localStorage.getItem('chatTheme:cv1')).toBe('#dc2626');
    await user.click(screen.getByRole('link', { name: 'Xem trang cá nhân' }));
    expect(location()).toBe('/profile/f1');
  });

  it('thu nhỏ → thanh nhỏ; bấm thanh → bung lại; đóng → biến mất', async () => {
    const { user } = await openChat();
    await user.click(screen.getByRole('button', { name: 'Thu nhỏ' }));
    expect(screen.queryByPlaceholderText('Nhập tin nhắn...')).toBeNull();
    await user.click(document.querySelector('div[class*="w-[280px]"]') as HTMLElement);
    expect(screen.getByPlaceholderText('Nhập tin nhắn...')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Đóng cuộc trò chuyện' }));
    expect(screen.queryByPlaceholderText('Nhập tin nhắn...')).toBeNull();
  });

  it('đóng từ thanh thu nhỏ không làm bung cửa sổ (không lan sự kiện)', async () => {
    const { user } = await openChat();
    await user.click(screen.getByRole('button', { name: 'Thu nhỏ' }));
    await user.click(screen.getByRole('button', { name: 'Đóng cuộc trò chuyện' }));
    expect(screen.queryByPlaceholderText('Nhập tin nhắn...')).toBeNull();
  });

  it('tin chia sẻ bài viết (không kèm chữ) hiện nhãn riêng', async () => {
    const { user } = renderApp('/', { seed: () => void db.messages.cv1.push({ id: 'ms', conversationId: 'cv1', kind: 'text', senderId: 'f1', senderName: 'Bạn Một', senderAvatar: '', content: '', sharedPostId: 'p1', createdAt: new Date().toISOString(), isRead: true }) });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    await user.click(await screen.findByText('Bạn: Chào bạn'));
    expect(await screen.findByText('📄 Đã chia sẻ một bài viết')).toBeTruthy();
  });

  it('mở chat nhóm hiện tên nhóm; không có trạng thái online', async () => {
    const { user } = renderApp('/', {
      seed: () => {
        db.conversations.unshift({ id: 'g1', isGroup: true, name: 'Nhóm lớp', avatar: '/g.png', participants: [db.me, db.users[1], db.users[2]], nicknames: {}, unreadCount: 0, updatedAt: new Date().toISOString() });
        db.messages.g1 = [];
      },
    });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    await user.click(await screen.findByText('Nhóm lớp'));
    expect(await screen.findByText('Hãy gửi lời chào để bắt đầu trò chuyện!')).toBeTruthy();
    expect(screen.queryByText('Không hoạt động')).toBeNull();
    expect(screen.queryByText('Xem trang cá nhân')).toBeNull();
  });
});

describe('Chat realtime', () => {
  const incoming = (content: string, conversationId = 'cv1', senderId = 'f1') => ({
    conversationId,
    message: { id: `rt-${content}`, conversationId, kind: 'text', senderId, senderName: 'Bạn Một', senderAvatar: '', content, createdAt: new Date().toISOString(), isRead: false },
  });

  it('tin mới từ bạn → toast, cửa sổ chat tự bật và hiện tin', async () => {
    renderApp('/');
    await feedLoaded();
    db.messages.cv1.push(incoming('Tin realtime').message as never);
    act(() => serverEmit('message:new', incoming('Tin realtime')));
    expect(await screen.findByText('Bạn Một: Tin realtime')).toBeTruthy();
    expect(await screen.findByPlaceholderText('Nhập tin nhắn...')).toBeTruthy();
    expect(await screen.findByText('Tin realtime', { selector: 'p.whitespace-pre-wrap' })).toBeTruthy();
  });

  it('NGƯỜI LẠ nhắn lần đầu → hội thoại được tải về và cửa sổ chat bật lên', async () => {
    renderApp('/');
    await feedLoaded();
    db.conversations.unshift({ id: 'cvX', isGroup: false, participants: [db.me, db.users[3]], nicknames: {}, unreadCount: 1, updatedAt: new Date().toISOString() });
    db.messages.cvX = [incoming('Chào, mình là người lạ', 'cvX', 's1').message as never];
    act(() => serverEmit('message:new', incoming('Chào, mình là người lạ', 'cvX', 's1')));
    expect(await screen.findByPlaceholderText('Nhập tin nhắn...')).toBeTruthy();
    expect(await screen.findByText('Người Lạ', { selector: 'div.font-bold' })).toBeTruthy();
    expect(await screen.findByText('Chào, mình là người lạ', { selector: 'p.whitespace-pre-wrap' })).toBeTruthy();
    expect(calls.filter((c) => c.path === '/messages/conversations' && c.method === 'GET').length).toBeGreaterThanOrEqual(2);
  });

  it('tin của chính mình (tab khác) → không toast, không tăng số chưa đọc', async () => {
    renderApp('/');
    await feedLoaded();
    act(() => serverEmit('message:new', incoming('Từ tab khác', 'cv1', 'u1')));
    expect(screen.queryByText(/Từ tab khác/)).toBeNull();
    expect(within(screen.getByRole('button', { name: 'Tin nhắn' })).getByText('2')).toBeTruthy();
  });

  it('tin thu hồi → không toast', async () => {
    renderApp('/');
    await feedLoaded();
    const payload = incoming('x');
    act(() => serverEmit('message:new', { ...payload, message: { ...payload.message, isRecalled: true } }));
    expect(screen.queryByText(/Bạn Một: x/)).toBeNull();
  });

  it('tin tới khi cửa sổ đang mở cập nhật ngay trong cửa sổ', async () => {
    await openChat();
    act(() => serverEmit('message:new', incoming('Đang chat thì có tin')));
    expect(await screen.findByText('Đang chat thì có tin', { selector: 'p.whitespace-pre-wrap' })).toBeTruthy();
  });
});

describe('Story — tạo', () => {
  const open = async () => {
    const ctx = renderApp('/');
    await feedLoaded();
    await ctx.user.click(screen.getByText('Tạo tin'));
    return { ...ctx, dialog: screen.getByRole('dialog', { name: 'Tạo tin mới' }) };
  };

  it('tạo tin chữ → toast + thẻ story của mình xuất hiện', async () => {
    const { user, dialog } = await open();
    await user.type(within(dialog).getByPlaceholderText('Gõ suy nghĩ của bạn...'), 'Hôm nay vui');
    await user.click(within(dialog).getByRole('button', { name: 'Chia sẻ lên Tin' }));
    expect(await screen.findByText('Đã đăng Story mới!')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Xem tin của Trần Xuân Hoàng' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Tạo tin mới' })).toBeNull();
  });

  it('nút chia sẻ khoá khi chưa có nội dung; khung xem trước phản ánh chữ gõ', async () => {
    const { user, dialog } = await open();
    expect((within(dialog).getByRole('button', { name: 'Chia sẻ lên Tin' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText('Nội dung tin của bạn...')).toBeTruthy();
    await user.type(within(dialog).getByPlaceholderText('Gõ suy nghĩ của bạn...'), 'Xem trước');
    expect(within(dialog).getAllByText('Xem trước').length).toBeGreaterThan(0);
  });

  it('chọn màu nền + "Chỉ bạn bè" → gửi đúng lên server', async () => {
    const { user, dialog } = await open();
    await user.click(within(dialog).getAllByRole('button', { name: 'Chọn màu nền' })[2]);
    await user.click(within(dialog).getByRole('button', { name: 'Chỉ bạn bè' }));
    await user.type(within(dialog).getByPlaceholderText('Gõ suy nghĩ của bạn...'), 'Riêng tư');
    await user.click(within(dialog).getByRole('button', { name: 'Chia sẻ lên Tin' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/stories')?.body).toMatchObject({ type: 'text', privacy: 'friends', textContent: 'Riêng tư', backgroundGradient: 'from-emerald-400 via-teal-500 to-cyan-600' }));
  });

  it('tin dạng ảnh: chọn ảnh từ máy → xem trước → chia sẻ', async () => {
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Tin dạng ảnh' }));
    expect(within(dialog).getByText('Chưa chọn hình ảnh')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Chia sẻ lên Tin' }) as HTMLButtonElement).disabled).toBe(true);
    await user.upload(dialog.querySelector('input[type=file]') as HTMLInputElement, new File(['x'], 'story.png', { type: 'image/png' }));
    await waitFor(() => expect(dialog.querySelector('img[src="/uploads/story.png"]')).toBeTruthy());
    await user.click(within(dialog).getByRole('button', { name: 'Chia sẻ lên Tin' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/stories')?.body).toMatchObject({ type: 'image', mediaUrl: '/uploads/story.png' }));
  });

  it('đóng bằng nút X, Esc, nền mờ', async () => {
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog', { name: 'Tạo tin mới' })).toBeNull();
    await user.click(screen.getByText('Tạo tin'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Tạo tin mới' })).toBeNull();
    await user.click(screen.getByText('Tạo tin'));
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'Tạo tin mới' }).parentElement!);
    expect(screen.queryByRole('dialog', { name: 'Tạo tin mới' })).toBeNull();
  });

  it('server lỗi → toast lỗi', async () => {
    const { user, dialog } = await open();
    db.failNext.add('POST /stories');
    await user.type(within(dialog).getByPlaceholderText('Gõ suy nghĩ của bạn...'), 'Lỗi');
    await user.click(within(dialog).getByRole('button', { name: 'Chia sẻ lên Tin' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
  });
});

describe('Story — xem', () => {
  afterEach(() => vi.useRealTimers());
  const two = () => void db.stories.push({ ...db.stories[0], id: 'st2', user: makeUser('f2', 'Bạn Hai'), textContent: 'Story của bạn hai' });
  const openStory = async (name = 'Bạn Một', seed?: () => void, fakeTimers = false) => {
    if (fakeTimers) vi.useFakeTimers({ shouldAdvanceTime: true }); // phải bật TRƯỚC khi mở story để bộ đếm 5 giây của story dùng đồng hồ giả
    const ctx = renderApp('/', { seed });
    await feedLoaded();
    await ctx.user.click(screen.getByRole('button', { name: `Xem tin của ${name}` }));
    return { ...ctx, dialog: screen.getByRole('dialog', { name: 'Xem tin' }) };
  };

  it('mở story → hiện nội dung, tên, ghi nhận đã xem', async () => {
    const { dialog } = await openStory();
    expect(within(dialog).getByText('Story của bạn một')).toBeTruthy();
    expect(within(dialog).getByText('Bạn Một')).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/stories/st1/view')).toBe(true));
  });

  it('đóng bằng nút X và phím Esc', async () => {
    const { user, dialog } = await openStory();
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog', { name: 'Xem tin' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Xem tin của Bạn Một' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Xem tin' })).toBeNull();
  });

  it('phím → sang story sau, ← quay lại; ở story cuối bấm → thì đóng', async () => {
    const { user, dialog } = await openStory('Bạn Một', two);
    await user.keyboard('{ArrowRight}');
    expect(await within(dialog).findByText('Story của bạn hai')).toBeTruthy();
    await user.keyboard('{ArrowLeft}');
    expect(await within(dialog).findByText('Story của bạn một')).toBeTruthy();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.queryByRole('dialog', { name: 'Xem tin' })).toBeNull();
  });

  it('bấm nửa phải = tiến, 1/3 trái = lùi', async () => {
    const { dialog } = await openStory('Bạn Một', two);
    fireEvent.click(dialog.querySelector('.w-2\\/3')!);
    expect(await within(dialog).findByText('Story của bạn hai')).toBeTruthy();
    fireEvent.click(dialog.querySelector('.w-1\\/3')!);
    expect(await within(dialog).findByText('Story của bạn một')).toBeTruthy();
  });

  it('tự chuyển sau 5 giây; hết story thì đóng', async () => {
    const { dialog } = await openStory('Bạn Một', two, true);
    await act(async () => void vi.advanceTimersByTime(5300));
    expect(within(dialog).getByText('Story của bạn hai')).toBeTruthy();
    await act(async () => void vi.advanceTimersByTime(5300));
    expect(screen.queryByRole('dialog', { name: 'Xem tin' })).toBeNull();
  });

  it('giữ chuột thì tạm dừng, thả ra thì chạy tiếp', async () => {
    const { dialog } = await openStory('Bạn Một', undefined, true);
    const card = dialog.querySelector('.rounded-3xl, .relative.flex.flex-col') as HTMLElement;
    fireEvent.mouseDown(card);
    await act(async () => void vi.advanceTimersByTime(8000));
    expect(screen.getByRole('dialog', { name: 'Xem tin' })).toBeTruthy();
    fireEvent.mouseUp(card);
    await act(async () => void vi.advanceTimersByTime(5300));
    expect(screen.queryByRole('dialog', { name: 'Xem tin' })).toBeNull();
  });

  it('đang gõ trả lời thì tạm dừng', async () => {
    const { dialog } = await openStory('Bạn Một', undefined, true);
    const input = within(dialog).getByPlaceholderText('Gửi tin nhắn cho Bạn Một...');
    fireEvent.focus(input);
    await act(async () => void vi.advanceTimersByTime(8000));
    expect(screen.getByRole('dialog', { name: 'Xem tin' })).toBeTruthy();
    fireEvent.blur(input);
    await act(async () => void vi.advanceTimersByTime(5300));
    expect(screen.queryByRole('dialog', { name: 'Xem tin' })).toBeNull();
  });

  it('thả cảm xúc nhanh → lưu cảm xúc lên story + toast', async () => {
    const { user, dialog } = await openStory();
    await user.click(within(dialog).getByRole('button', { name: 'Phản hồi ❤️' }));
    expect(await screen.findByText('Đã gửi cảm xúc ❤️ tới Bạn Một')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST' && c.path === '/stories/st1/react')?.body).toEqual({ emoji: '❤️' });
  });

  it('trả lời story bằng chữ; ô trống thì không gửi', async () => {
    const { user, dialog } = await openStory();
    const before = calls.length;
    await user.type(within(dialog).getByPlaceholderText('Gửi tin nhắn cho Bạn Một...'), '   {Enter}');
    expect(calls.length).toBe(before);
    await user.type(within(dialog).getByPlaceholderText('Gửi tin nhắn cho Bạn Một...'), 'Hay quá{Enter}');
    expect(await screen.findByText('Đã gửi tới Bạn Một')).toBeTruthy();
    expect(calls.some((c) => JSON.stringify(c.body ?? '').includes('Trả lời Story: \\"Hay quá\\"'))).toBe(true);
  });

  const mine = () =>
    void db.stories.unshift({ id: 'mine', user: db.me, type: 'text', privacy: 'public', textContent: 'Tin của tôi', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1e8).toISOString(), viewers: [{ userId: 'f1', userName: 'Bạn Một', avatar: '', viewedAt: new Date().toISOString() }] });

  it('story của mình: xem ai đã xem, không có ô trả lời', async () => {
    const { user, dialog } = await openStory('Trần Xuân Hoàng', mine);
    expect(within(dialog).queryByPlaceholderText(/Gửi tin nhắn cho/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: /người đã xem/ }));
    expect(within(dialog).getAllByText('Bạn Một').length).toBeGreaterThan(0);
  });

  it('chưa ai xem → thông báo', async () => {
    const { user, dialog } = await openStory('Trần Xuân Hoàng', () => { mine(); db.stories[0].viewers = []; });
    await user.click(within(dialog).getByRole('button', { name: /người đã xem/ }));
    expect(within(dialog).getByText('Chưa có ai xem tin này.')).toBeTruthy();
  });

  it('xoá story của mình có xác nhận → biến mất khỏi thanh story', async () => {
    const { user, dialog } = await openStory('Trần Xuân Hoàng', mine);
    await user.click(within(dialog).getByRole('button', { name: 'Xóa tin' }));
    await confirmDialog(user);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Xem tin của Trần Xuân Hoàng' })).toBeNull());
    expect(screen.getByText('Đã xóa Story!')).toBeTruthy();
  });

  it('story ảnh hiển thị ảnh', async () => {
    const { dialog } = await openStory('Bạn Một', () => void Object.assign(db.stories[0], { type: 'image', mediaUrl: '/s.png', textContent: undefined }));
    expect(dialog.querySelector('img[src="/s.png"]')).toBeTruthy();
  });
});

describe('Navbar & sidebar', () => {
  it('menu thông báo: danh sách + "Xem tất cả"; bấm một thông báo → đóng menu và điều hướng', async () => {
    const { user, location } = renderApp('/friends');
    await screen.findByText('2 bạn bè · 1 lời mời');
    await user.click(screen.getByRole('button', { name: 'Thông báo' }));
    expect(screen.getByText('Xem tất cả')).toBeTruthy();
    await user.click(within(screen.getByRole('banner')).getByText(/đã gửi lời mời kết bạn/));
    await waitFor(() => expect(location()).toBe('/profile/s2'));
    expect(screen.queryByText('Xem tất cả')).toBeNull();
  });

  it('menu thông báo trống', async () => {
    const { user } = renderApp('/', { seed: () => void (db.notifications = []) });
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Thông báo' }));
    expect(screen.getByText('Không có thông báo mới')).toBeTruthy();
  });

  it('chỉ mở một menu tại một thời điểm; Esc và bấm ngoài đều đóng', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tin nhắn' }));
    expect(screen.getByText('Đoạn chat')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    expect(screen.queryByText('Đoạn chat')).toBeNull();
    expect(screen.getByText('Cài đặt tài khoản', { selector: 'a' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('link', { name: 'Đăng xuất' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
  });

  it('menu tài khoản: đủ mục; bấm "Trang cá nhân" điều hướng', async () => {
    const { user, location } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    for (const t of ['Bài viết đã lưu', 'Kỷ niệm', 'Cài đặt tài khoản']) expect(screen.getByText(t, { selector: 'a' })).toBeTruthy();
    await user.click(screen.getAllByRole('link', { name: 'Trang cá nhân' }).at(-1)!);
    expect(location()).toBe('/profile/u1');
  });

  it('đăng xuất → về /login, gọi API logout, xoá dữ liệu', async () => {
    const { user, location } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(location()).toBe('/login'));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/auth/logout')).toBe(true);
  });

  it('ô tìm kiếm trên Navbar: gõ → kết quả → mở hồ sơ', async () => {
    const { user, location } = renderApp('/');
    await feedLoaded();
    await user.type(screen.getByRole('searchbox'), 'Lạ');
    await user.click(await screen.findByRole('link', { name: /Người Lạ/ }));
    expect(location()).toBe('/profile/s1');
  });

  it('huy hiệu thông báo chưa đọc ở Navbar và thanh điều hướng mobile', async () => {
    renderApp('/');
    await feedLoaded();
    expect(within(screen.getByRole('button', { name: 'Thông báo' })).getByText('2')).toBeTruthy();
    expect(within(screen.getByRole('link', { name: 'Thông báo' })).getByText('2')).toBeTruthy();
  });

  it('sidebar phải: lời mời kết bạn → Xác nhận / Xoá', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    const card = screen.getByText('Lời mời kết bạn').closest('.card') as HTMLElement;
    expect(within(card).getByText('Người Mời')).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Đã chấp nhận lời mời kết bạn!')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Lời mời kết bạn')).toBeNull());
    expect(screen.getByText('Người liên hệ (3)')).toBeTruthy();
  });

  it('sidebar phải: từ chối lời mời', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(screen.queryByText('Lời mời kết bạn')).toBeNull());
  });

  it('sidebar phải: người liên hệ online xếp trước; bấm → mở chat', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    const list = screen.getByText('Người liên hệ (2)').closest('.card') as HTMLElement;
    const names = within(list).getAllByRole('button').map((b) => b.textContent);
    expect(names[0]).toContain('Bạn Một');
    expect(names[0]).toContain('Đang hoạt động');
    expect(names[1]).toContain('Ngoại tuyến');
    await user.click(within(list).getByText('Bạn Hai'));
    expect(await screen.findByPlaceholderText('Nhập tin nhắn...')).toBeTruthy();
  });

  it('sidebar phải: chưa có bạn → lối tắt tìm bạn', async () => {
    renderApp('/', { seed: () => void (db.friends = []) });
    await feedLoaded();
    expect(screen.getByText(/Chưa có người liên hệ nào/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tìm bạn bè' })).toBeTruthy();
  });

  it('sidebar phải chỉ có ở bảng tin, các trang khác thì không', async () => {
    renderApp('/saved');
    await screen.findByText('Chưa có bài viết nào được lưu');
    expect(screen.queryByText(/Người liên hệ/)).toBeNull();
  });

  it('nút đăng bài ở thanh mobile mở hộp thoại', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    await user.click(within(nav).getByRole('button', { name: 'Đăng bài' }));
    expect(screen.getByRole('dialog', { name: 'Đăng bài' })).toBeTruthy();
  });

  it('chuyển trang → cuộn lên đầu', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    (window.scrollTo as ReturnType<typeof vi.fn>).mockClear();
    await user.click(screen.getAllByRole('link', { name: /Bạn bè/ })[0]);
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith(0, 0));
  });
});

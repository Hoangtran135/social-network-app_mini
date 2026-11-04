// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Test ô tìm kiếm trên Navbar và logic tự mở hộp thoại chat khi có tin nhắn tới (kể cả từ người lạ).

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  return {
    apiGet: vi.fn(),
    friends: [] as { id: string }[],
    socket: {
      on: (event: string, fn: (payload: unknown) => void) => void (handlers.get(event) ?? handlers.set(event, new Set()).get(event)!).add(fn),
      off: (event: string, fn: (payload: unknown) => void) => void handlers.get(event)?.delete(fn),
    },
    emit: (event: string, payload: unknown) => handlers.get(event)?.forEach((fn) => fn(payload)),
    listenerCount: (event: string) => handlers.get(event)?.size ?? 0,
    me: { id: 'me' } as { id: string } | null,
  };
});

vi.mock('../../src/utils/api', () => ({ api: { get: mocks.apiGet } }));
vi.mock('../../src/utils/socket', () => ({ getSocket: () => mocks.socket }));
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ currentUser: mocks.me }) }));
vi.mock('../../src/context/SocialContext', () => ({ useSocial: () => ({ friends: mocks.friends }) }));

import { SearchBox } from '../../src/layout/SearchBox';
import { ChatWindowsProvider, useChatWindows } from '../../src/context/ChatWindowsContext';

const person = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, username: name.toLowerCase().replace(/\s/g, ''), avatar: '/a.png', ...extra });

beforeEach(() => {
  mocks.apiGet.mockReset();
  mocks.friends = [];
  mocks.me = { id: 'me' };
});

describe('SearchBox', () => {
  const setup = () => {
    render(<MemoryRouter><SearchBox /></MemoryRouter>);
    return screen.getByRole('searchbox') as HTMLInputElement;
  };
  const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });

  it('chưa gõ gì → không gọi API, không hiện bảng kết quả', () => {
    setup();
    expect(mocks.apiGet).not.toHaveBeenCalled();
    expect(screen.queryByText('Mọi người')).toBeNull();
  });

  it('gõ → gọi GET /users?q=... (mã hoá URL, limit=8) rồi hiện kết quả', async () => {
    mocks.apiGet.mockResolvedValue({ users: [person('1', 'Nguyễn Văn An')] });
    type(setup(), 'Văn An');
    await screen.findByText('Nguyễn Văn An');
    expect(mocks.apiGet).toHaveBeenCalledWith(`/users?q=${encodeURIComponent('Văn An')}&limit=8`);
    expect(screen.getByText('@nguyễnvănan')).toBeTruthy();
  });

  it('mỗi kết quả là link tới trang cá nhân', async () => {
    mocks.apiGet.mockResolvedValue({ users: [person('abc123', 'Lan')] });
    type(setup(), 'Lan');
    const link = await screen.findByRole('link', { name: /Lan/ });
    expect(link.getAttribute('href')).toBe('/profile/abc123');
  });

  it('gõ liên tục chỉ gọi API 1 lần sau khi ngừng gõ (debounce)', async () => {
    mocks.apiGet.mockResolvedValue({ users: [] });
    const input = setup();
    for (const v of ['a', 'an', 'anh', 'anh ']) type(input, v);
    await screen.findByText(/Không tìm thấy/);
    expect(mocks.apiGet).toHaveBeenCalledTimes(1);
    expect(mocks.apiGet).toHaveBeenCalledWith(`/users?q=${encodeURIComponent('anh')}&limit=8`);
  });

  it('không có kết quả → thông báo "Không tìm thấy"', async () => {
    mocks.apiGet.mockResolvedValue({ users: [] });
    type(setup(), 'zzz');
    expect((await screen.findByText(/Không tìm thấy/)).textContent).toContain('zzz');
  });

  it('API lỗi → coi như không có kết quả, không treo "Đang tìm..."', async () => {
    mocks.apiGet.mockRejectedValue(new Error('mạng lỗi'));
    type(setup(), 'abc');
    await screen.findByText(/Không tìm thấy/);
    expect(screen.queryByText('Đang tìm...')).toBeNull();
  });

  it('chỉ gồm khoảng trắng → coi như rỗng, không gọi API', async () => {
    type(setup(), '    ');
    await new Promise((r) => setTimeout(r, 400));
    expect(mocks.apiGet).not.toHaveBeenCalled();
  });

  it('kết quả cũ trả về chậm KHÔNG ghi đè kết quả của lần gõ mới hơn', async () => {
    let resolveOld!: (v: unknown) => void;
    mocks.apiGet
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockImplementationOnce(() => Promise.resolve({ users: [person('2', 'Kết Quả Mới')] }));
    const input = setup();
    type(input, 'cu');
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(1));
    type(input, 'moi');
    await screen.findByText('Kết Quả Mới');
    await act(async () => resolveOld({ users: [person('1', 'Kết Quả Cũ')] }));
    expect(screen.queryByText('Kết Quả Cũ')).toBeNull();
    expect(screen.getByText('Kết Quả Mới')).toBeTruthy();
  });

  it('đánh dấu "Bạn bè" cho người đã là bạn', async () => {
    mocks.friends = [{ id: '1' }];
    mocks.apiGet.mockResolvedValue({ users: [person('1', 'Bạn Thân'), person('2', 'Người Lạ')] });
    type(setup(), 'a');
    await screen.findByText('Bạn Thân');
    expect(screen.getAllByText('Bạn bè')).toHaveLength(1);
  });

  it('nút xoá (X) xoá ô tìm và ẩn bảng kết quả', async () => {
    mocks.apiGet.mockResolvedValue({ users: [person('1', 'An')] });
    const input = setup();
    type(input, 'an');
    await screen.findByText('An');
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(input.value).toBe('');
    expect(screen.queryByText('Mọi người')).toBeNull();
  });

  it('nhấn Esc đóng bảng kết quả; bấm kết quả thì đóng và xoá ô tìm', async () => {
    mocks.apiGet.mockResolvedValue({ users: [person('1', 'An')] });
    const input = setup();
    type(input, 'an');
    await screen.findByText('An');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Mọi người')).toBeNull();

    type(input, 'ann');
    fireEvent.click(await screen.findByRole('link', { name: /An/ }));
    expect(input.value).toBe('');
  });

  it('bấm ra ngoài đóng bảng kết quả', async () => {
    mocks.apiGet.mockResolvedValue({ users: [person('1', 'An')] });
    type(setup(), 'an');
    await screen.findByText('An');
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Mọi người')).toBeNull();
  });

  it('Enter trong ô tìm không tải lại trang (form bị chặn submit mặc định)', async () => {
    mocks.apiGet.mockResolvedValue({ users: [] });
    const input = setup();
    type(input, 'an');
    const notPrevented = fireEvent.submit(input.closest('form')!);
    expect(notPrevented).toBe(false); // false = preventDefault đã được gọi
  });

  it('có nút kính lúp cho điện thoại; bấm → hiện nút "Huỷ" để thoát', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
  });
});

describe('Tự mở hộp thoại chat khi có tin nhắn tới', () => {
  const setViewport = (desktop: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: desktop && query.includes('min-width'), media: query, addEventListener() {}, removeEventListener() {} }));
  const msg = (over: Record<string, unknown> = {}) => ({ conversationId: 'c1', message: { senderId: 'stranger', isRecalled: false, kind: 'text', ...over } });
  const setup = () => renderHook(() => useChatWindows(), { wrapper: ({ children }) => <ChatWindowsProvider>{children}</ChatWindowsProvider> });

  beforeEach(() => setViewport(true));

  it('NGƯỜI LẠ nhắn tới → cửa sổ chat của hội thoại đó tự mở (không thu nhỏ)', () => {
    const { result } = setup();
    expect(result.current.windows).toEqual([]);
    act(() => mocks.emit('message:new', msg()));
    expect(result.current.windows).toEqual([{ conversationId: 'c1', minimized: false }]);
  });

  it('tin của CHÍNH MÌNH (gửi từ tab khác) không bật hộp thoại', () => {
    const { result } = setup();
    act(() => mocks.emit('message:new', msg({ senderId: 'me' })));
    expect(result.current.windows).toEqual([]);
  });

  it('tin hệ thống / tin đã thu hồi không bật hộp thoại', () => {
    const { result } = setup();
    act(() => mocks.emit('message:new', msg({ kind: 'system' })));
    act(() => mocks.emit('message:new', msg({ isRecalled: true })));
    expect(result.current.windows).toEqual([]);
  });

  it('cửa sổ đã mở (kể cả đang thu nhỏ) thì giữ nguyên, không bật lại / không mở trùng', () => {
    const { result } = setup();
    act(() => mocks.emit('message:new', msg()));
    act(() => result.current.toggleMinimize('c1'));
    act(() => mocks.emit('message:new', msg()));
    expect(result.current.windows).toEqual([{ conversationId: 'c1', minimized: true }]);
  });

  it('nhiều hội thoại: tối đa 2 cửa sổ, cửa sổ cũ nhất bị đóng', () => {
    const { result } = setup();
    for (const id of ['c1', 'c2', 'c3']) act(() => mocks.emit('message:new', { ...msg(), conversationId: id }));
    expect(result.current.windows.map((w) => w.conversationId)).toEqual(['c2', 'c3']);
  });

  it('điện thoại (màn hình hẹp) → KHÔNG tự bật (chat sẽ chiếm cả màn hình)', () => {
    setViewport(false);
    const { result } = setup();
    act(() => mocks.emit('message:new', msg()));
    expect(result.current.windows).toEqual([]);
  });

  it('chưa đăng nhập → không lắng nghe; unmount → gỡ lắng nghe (không rò rỉ)', () => {
    mocks.me = null;
    const loggedOut = setup();
    expect(mocks.listenerCount('message:new')).toBe(0);
    loggedOut.unmount();

    mocks.me = { id: 'me' };
    const { unmount } = setup();
    expect(mocks.listenerCount('message:new')).toBe(1);
    unmount();
    expect(mocks.listenerCount('message:new')).toBe(0);
  });

  it('openChat / closeChat / toggleMinimize vẫn hoạt động; mở lại cửa sổ đang thu nhỏ thì bung ra', () => {
    const { result } = setup();
    act(() => result.current.openChat('a'));
    act(() => result.current.openChat('b'));
    act(() => result.current.toggleMinimize('a'));
    expect(result.current.windows).toEqual([{ conversationId: 'a', minimized: true }, { conversationId: 'b', minimized: false }]);
    act(() => result.current.openChat('a'));
    expect(result.current.windows).toEqual([{ conversationId: 'b', minimized: false }, { conversationId: 'a', minimized: false }]);
    act(() => result.current.closeChat('b'));
    expect(result.current.windows.map((w) => w.conversationId)).toEqual(['a']);
  });
});

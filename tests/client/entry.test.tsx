// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Điểm vào của giao diện: kết nối Socket.io dùng chung, main.tsx gắn app vào #root, và App mặc định (BrowserRouter thật).

const sockets: { auth: unknown; disconnect: ReturnType<typeof vi.fn> }[] = [];
const ioMock = vi.fn((opts?: { auth: unknown }) => {
  const socket = { auth: opts?.auth, disconnect: vi.fn() };
  sockets.push(socket);
  return socket;
});
vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => (ioMock as (...a: unknown[]) => unknown)(...args) }));

beforeEach(() => {
  sockets.length = 0;
  ioMock.mockClear();
  vi.resetModules();
  localStorage.clear();
});

describe('utils/socket — một kết nối dùng chung', () => {
  it('getSocket tạo kết nối MỘT lần với token hiện tại, gọi lại dùng lại kết nối đó', async () => {
    localStorage.setItem('authToken', 'tok-1');
    const { getSocket } = await import('../../src/utils/socket');
    const a = getSocket();
    const b = getSocket();
    expect(a).toBe(b);
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock.mock.calls[0][0]).toEqual({ auth: { token: 'tok-1' } });
  });

  it('luôn cập nhật token mới nhất cho lần kết nối lại', async () => {
    localStorage.setItem('authToken', 'tok-1');
    const { getSocket } = await import('../../src/utils/socket');
    const { setToken } = await import('../../src/utils/api');
    getSocket();
    setToken('tok-2');
    expect(getSocket().auth).toEqual({ token: 'tok-2' });
  });

  it('disconnectSocket ngắt kết nối; lần sau tạo kết nối mới', async () => {
    const { getSocket, disconnectSocket } = await import('../../src/utils/socket');
    const first = getSocket();
    disconnectSocket();
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(getSocket()).not.toBe(first);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });

  it('disconnectSocket khi chưa có kết nối thì không lỗi', async () => {
    const { disconnectSocket } = await import('../../src/utils/socket');
    expect(() => disconnectSocket()).not.toThrow();
  });
});

describe('main.tsx', () => {
  it('gắn <App /> vào #root bên trong React.StrictMode', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const render = vi.fn();
    const createRoot = vi.fn(() => ({ render }));
    vi.doMock('react-dom/client', () => ({ default: { createRoot }, createRoot }));
    vi.doMock('../../src/App', () => ({ default: () => null }));
    await import('../../src/main');
    expect(createRoot).toHaveBeenCalledWith(document.getElementById('root'));
    const tree = render.mock.calls[0][0] as React.ReactElement;
    expect(tree.type).toBe(React.StrictMode);
  });
});

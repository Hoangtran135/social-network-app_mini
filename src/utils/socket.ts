import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

// Kết nối Socket.io tới server để nhận sự kiện realtime (tin nhắn, thông báo, bài viết mới...).
// Cả ứng dụng chỉ dùng MỘT kết nối; server kiểm tra token lúc kết nối.

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) socket = io({ auth: { token: getToken() } });
  // Luôn dùng token mới nhất cho lần kết nối (lại) tiếp theo
  socket.auth = { token: getToken() };
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

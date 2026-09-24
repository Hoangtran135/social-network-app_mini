import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { getUserIdFromToken } from './jwtAuth';

// Realtime bằng Socket.io: server chủ động "đẩy" sự kiện tới trình duyệt
// (tin nhắn mới, thông báo, bài viết mới...) mà không cần trình duyệt hỏi lại.
// Mỗi người dùng có một "phòng" riêng tên "user:<id>"; gửi vào phòng đó thì mọi tab của họ đều nhận.

let io: Server | null = null;

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToUsers(userIds: string[], event: string, payload: unknown) {
  if (userIds.length > 0) io?.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
}

/** Gửi cho tất cả mọi người, trừ excludeUserId (nếu có). */
export function emitToEveryone(event: string, payload: unknown, excludeUserId?: string) {
  if (excludeUserId) io?.except(`user:${excludeUserId}`).emit(event, payload);
  else io?.emit(event, payload);
}

/** Gắn Socket.io vào HTTP server. Client phải gửi token khi kết nối: io(url, { auth: { token } }). */
export function setupSocketServer(httpServer: HttpServer) {
  io = new Server(httpServer, { cors: { origin: true, credentials: true } });

  // Kiểm tra token một lần lúc kết nối
  io.use((socket, next) => {
    const userId = getUserIdFromToken(socket.handshake.auth?.token);
    if (!userId) return next(new Error('Phiên đăng nhập không hợp lệ.'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => socket.join(`user:${socket.data.userId}`));
}

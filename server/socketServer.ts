import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { getUserIdFromToken } from './jwtAuth';
import { UserModel } from './models/User';
import { ConversationModel } from './models/Conversation';
import { MessageModel } from './models/Message';

// Realtime bằng Socket.io: server chủ động "đẩy" sự kiện tới trình duyệt
// (tin nhắn mới, thông báo, bài viết mới...) mà không cần trình duyệt hỏi lại.
// Mỗi người dùng có một "phòng" riêng tên "user:<id>"; gửi vào phòng đó thì mọi tab của họ đều nhận.
//
// Ngoài ra socket còn lo 3 việc của chat:
// - Hiện diện (online / lần cuối hoạt động): kết nối đầu tiên → online; đóng tab CUỐI CÙNG → offline + lastActive. Báo cho mọi người bằng "presence:update".
// - "Đang gõ...": client gửi "typing" { conversationId, isTyping } → server chuyển cho các thành viên khác của hội thoại.
// - "Đã nhận": client gửi "message:delivered" { conversationId, messageId } khi tin về tới máy → server ghi lại và báo cho người gửi.

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

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const dbReady = () => mongoose.connection.readyState === 1;
const isId = (value: unknown): value is string => typeof value === 'string' && OBJECT_ID.test(value);

/** Số kết nối (tab) đang mở của từng người: chỉ khi về 0 mới coi là offline. */
const connections = new Map<string, number>();

async function setPresence(userId: string, online: boolean) {
  if (!isId(userId) || !dbReady()) return;
  try {
    const lastActive = online ? undefined : new Date();
    await UserModel.updateOne({ _id: userId }, online ? { isOnline: true, $unset: { lastActive: 1 } } : { isOnline: false, lastActive });
    io?.emit('presence:update', { userId, isOnline: online, lastActive: lastActive?.toISOString() });
  } catch {
    // lỗi database không được làm sập kết nối realtime
  }
}

/**
 * Tạo bộ gói handler cho MỘT kết nối: các sự kiện của kết nối đó được xử lý TUẦN TỰ đúng thứ tự gửi
 * (nếu chạy song song, "bắt đầu gõ" rồi "ngừng gõ" có thể tới máy người kia đảo ngược → chỉ báo "đang gõ" bị kẹt).
 * Payload sai định dạng hoặc lỗi database thì bỏ qua, không sập server.
 */
const serialHandlers = () => {
  let tail: Promise<void> = Promise.resolve();
  return <T>(handler: (payload: T) => Promise<void>) =>
    (payload: T) => {
      tail = tail.then(async () => {
        try {
          if (dbReady()) await handler(payload);
        } catch {
          // bỏ qua
        }
      });
    };
};

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

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;
    socket.join(`user:${userId}`);

    const safe = serialHandlers();
    const open = (connections.get(userId) ?? 0) + 1;
    connections.set(userId, open);
    if (open === 1) void setPresence(userId, true);

    socket.on(
      'typing',
      safe(async (payload: { conversationId?: unknown; isTyping?: unknown }) => {
        if (!isId(payload?.conversationId)) return;
        const conversation = await ConversationModel.findOne({ _id: payload.conversationId, participants: userId }).select('participants');
        if (!conversation) return; // không phải thành viên → bỏ qua
        const others = conversation.participants.map(String).filter((id: string) => id !== userId);
        emitToUsers(others, 'typing', { conversationId: payload.conversationId, userId, isTyping: !!payload.isTyping });
      })
    );

    socket.on(
      'message:delivered',
      safe(async (payload: { conversationId?: unknown; messageId?: unknown }) => {
        if (!isId(payload?.conversationId) || !isId(payload?.messageId)) return;
        if (!(await ConversationModel.exists({ _id: payload.conversationId, participants: userId }))) return;
        const message = await MessageModel.findOneAndUpdate(
          { _id: payload.messageId, conversation: payload.conversationId, sender: { $ne: userId } },
          { $addToSet: { deliveredTo: userId } }
        );
        if (message?.sender) emitToUser(message.sender.toString(), 'message:delivered', { conversationId: payload.conversationId, messageId: payload.messageId, userId });
      })
    );

    socket.on('disconnect', () => {
      const left = (connections.get(userId) ?? 1) - 1;
      if (left > 0) return void connections.set(userId, left);
      connections.delete(userId);
      void setPresence(userId, false);
    });
  });
}

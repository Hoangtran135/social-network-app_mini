import { Router, Request, Response, NextFunction } from 'express';
import { ConversationModel } from '../models/Conversation';
import { MessageModel } from '../models/Message';
import { UserModel } from '../models/User';
import { PostModel } from '../models/Post';
import { requireAuth } from '../jwtAuth';
import {
  validate,
  createConversationSchema,
  setNicknameSchema,
  sendMessageSchema,
  reactMessageSchema,
  sharePostToChatSchema,
} from '../validation';
import { conversationToJson, messageToJson, Doc } from '../formatResponse';
import { emitToUser } from '../socketServer';
import { isBlockedBetween } from '../privacyRules';

// API tin nhắn (/api/messages): danh sách hội thoại, tạo chat 1-1 / nhóm, đặt biệt danh,
// đọc / gửi / thu hồi tin nhắn, thả cảm xúc, chia sẻ bài viết vào chat.
// Tin nhắn mới hoặc vừa thay đổi được đẩy realtime tới các thành viên bằng sự kiện "message:new".

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

const getMemberIds = (conv: Doc): string[] => conv.participants.map(String);

/** Gửi tin nhắn tới các thành viên qua realtime (trừ exceptUserId nếu có). */
function broadcastMessage(conv: Doc, message: unknown, exceptUserId?: string) {
  getMemberIds(conv)
    .filter((id) => id !== exceptUserId)
    .forEach((id) => emitToUser(id, 'message:new', { conversationId: conv.id, message }));
}

/** Tin nhắn hệ thống (vd "A đã đổi biệt danh..."), không có người gửi. */
async function createSystemMessage(conversationId: string, content: string) {
  const message = await MessageModel.create({ conversation: conversationId, kind: 'system', content });
  await ConversationModel.findByIdAndUpdate(conversationId, { updatedAt: new Date() });
  return message;
}

/** Middleware: người dùng phải là thành viên của hội thoại :id. Hợp lệ thì gắn hội thoại vào res.locals.conv. */
async function requireMember(req: Request, res: Response, next: NextFunction) {
  const conv = await ConversationModel.findById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Không tìm thấy cuộc trò chuyện.' });
  if (!getMemberIds(conv).includes(req.userId)) return res.status(403).json({ error: 'Bạn không phải là thành viên của cuộc trò chuyện này.' });
  res.locals.conv = conv;
  next();
}

/** Middleware: chat 1-1 mà hai bên đang chặn nhau thì không cho gửi tin (nhóm chat bỏ qua). */
async function requireNotBlocked(req: Request, res: Response, next: NextFunction) {
  const conv = res.locals.conv;
  const otherId = getMemberIds(conv).find((id) => id !== req.userId);
  if (!conv.isGroup && (await isBlockedBetween(req.userId, otherId))) return res.status(403).json({ error: 'Không thể nhắn tin với người dùng này.' });
  next();
}

/** Tạo tin nhắn của người dùng, đẩy hội thoại lên đầu danh sách và gửi realtime cho các thành viên khác. */
async function createAndBroadcastMessage(req: Request, res: Response, data: Record<string, unknown>) {
  const conv = res.locals.conv;
  const message = await MessageModel.create({ conversation: conv._id, sender: req.userId, readBy: [req.userId], ...data });
  await message.populate('sender');
  await ConversationModel.findByIdAndUpdate(conv._id, { updatedAt: new Date() });
  const json = messageToJson(message, getMemberIds(conv));
  broadcastMessage(conv, json, req.userId);
  res.json({ message: json });
}

/** Tìm tin nhắn :messageId trong đúng hội thoại :id. */
const findMessage = (req: Request) => MessageModel.findOne({ _id: req.params.messageId, conversation: req.params.id });

/** Lưu tin nhắn vừa sửa (thu hồi / cảm xúc) rồi gửi bản mới cho TẤT CẢ thành viên (để các tab khác cũng cập nhật). */
async function saveMessageAndBroadcast(res: Response, message: Doc) {
  await message.save();
  await message.populate('sender');
  const json = messageToJson(message, getMemberIds(res.locals.conv));
  broadcastMessage(res.locals.conv, json);
  res.json({ message: json });
}

/** GET /api/messages/conversations — hội thoại của mình, kèm tin nhắn cuối và số tin chưa đọc. */
messagesRouter.get('/conversations', async (req, res) => {
  const conversations = await ConversationModel.find({ participants: req.userId }).sort({ updatedAt: -1 }).populate('participants');
  const result = await Promise.all(
    conversations.map(async (c: Doc) => {
      const [last, unread] = await Promise.all([
        MessageModel.findOne({ conversation: c._id }).sort({ createdAt: -1 }).populate('sender'),
        MessageModel.countDocuments({ conversation: c._id, sender: { $ne: req.userId }, readBy: { $ne: req.userId } }),
      ]);
      return conversationToJson(c, last, unread);
    })
  );
  res.json({ conversations: result });
});

/** POST /api/messages/conversations — từ 3 người trở lên tạo nhóm (bắt buộc có tên); 2 người thì lấy chat 1-1 cũ hoặc tạo mới. */
messagesRouter.post('/conversations', validate(createConversationSchema), async (req, res) => {
  const { participantId, participantIds, name } = req.body;
  const ids: string[] = [...new Set<string>([...(participantIds || [participantId]), req.userId])].filter(Boolean);

  if (ids.length >= 3) {
    if (!name) return res.status(400).json({ error: 'Nhóm chat cần có tên khi có từ 3 thành viên trở lên.' });
    const conv = await ConversationModel.create({
      isGroup: true,
      name,
      avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=group${Math.ceil(Math.random() * 5)}`,
      participants: ids,
    });
    const creator = await UserModel.findById(req.userId);
    await createSystemMessage(conv.id, `${creator?.name || 'Ai đó'} đã tạo nhóm "${name}".`);
    await conv.populate('participants');
    return res.json({ conversation: conversationToJson(conv) });
  }

  const otherId = ids.find((id) => id !== req.userId);
  let conv = await ConversationModel.findOne({ isGroup: false, participants: { $all: [req.userId, otherId], $size: 2 } });
  if (!conv) {
    if (await isBlockedBetween(req.userId, otherId)) return res.status(403).json({ error: 'Không thể nhắn tin với người dùng này.' });
    conv = await ConversationModel.create({ isGroup: false, participants: [req.userId, otherId] });
  }
  await conv.populate('participants');
  res.json({ conversation: conversationToJson(conv) });
});

/** PATCH /api/messages/conversations/:id/nickname — đặt biệt danh (chuỗi rỗng = xoá) và thêm tin nhắn hệ thống. */
messagesRouter.patch('/conversations/:id/nickname', validate(setNicknameSchema), requireMember, async (req, res) => {
  const { userId, nickname } = req.body;
  const conv = res.locals.conv;
  if (nickname) conv.nicknames.set(userId, nickname);
  else conv.nicknames.delete(userId);
  await conv.save();
  await conv.populate('participants');

  const [actor, target] = await Promise.all([UserModel.findById(req.userId), UserModel.findById(userId)]);
  const who = userId === req.userId ? 'mình' : target?.name || 'thành viên';
  const text = nickname
    ? `${actor?.name} đã đặt biệt danh của ${who} là "${nickname}".`
    : `${actor?.name} đã xóa biệt danh của ${who}.`;
  const systemMessage = await createSystemMessage(conv.id, text);
  res.json({ conversation: conversationToJson(conv), systemMessage: messageToJson(systemMessage) });
});

/** GET /api/messages/conversations/:id/messages — tin nhắn cũ nhất trước; mở hội thoại = đánh dấu đã đọc. */
messagesRouter.get('/conversations/:id/messages', requireMember, async (req, res) => {
  const messages = await MessageModel.find({ conversation: req.params.id }).sort({ createdAt: 1 }).limit(500).populate('sender');
  await MessageModel.updateMany({ conversation: req.params.id, sender: { $ne: req.userId } }, { $addToSet: { readBy: req.userId } });
  const ids = getMemberIds(res.locals.conv);
  res.json({ messages: messages.map((m: Doc) => messageToJson(m, ids)) });
});

/** POST /api/messages/conversations/:id/messages — gửi tin nhắn chữ và / hoặc tệp đính kèm. */
messagesRouter.post('/conversations/:id/messages', validate(sendMessageSchema), requireMember, requireNotBlocked, (req, res) =>
  createAndBroadcastMessage(req, res, { content: req.body.content, attachments: req.body.attachments })
);

/** POST /api/messages/conversations/:id/share-post — gửi một bài viết vào chat (client hiển thị bài theo sharedPostId). */
messagesRouter.post('/conversations/:id/share-post', validate(sharePostToChatSchema), requireMember, requireNotBlocked, async (req, res) => {
  if (!(await PostModel.exists({ _id: req.body.postId }))) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  await createAndBroadcastMessage(req, res, { content: req.body.message || '', sharedPostId: req.body.postId });
});

/** DELETE /api/messages/conversations/:id/messages/:messageId — thu hồi tin của chính mình. */
messagesRouter.delete('/conversations/:id/messages/:messageId', requireMember, async (req, res) => {
  const message = await findMessage(req);
  if (!message) return res.status(404).json({ error: 'Không tìm thấy tin nhắn.' });
  if (message.sender?.toString() !== req.userId) return res.status(403).json({ error: 'Bạn chỉ có thể thu hồi tin nhắn của chính mình.' });

  Object.assign(message, { isRecalled: true, content: '', attachments: [], reactions: new Map() });
  await saveMessageAndBroadcast(res, message);
});

/** POST .../messages/:messageId/react — mỗi người 1 cảm xúc; bấm lại đúng emoji đang có (hoặc gửi rỗng) = bỏ. */
messagesRouter.post('/conversations/:id/messages/:messageId/react', validate(reactMessageSchema), requireMember, async (req, res) => {
  const message = await findMessage(req);
  if (!message) return res.status(404).json({ error: 'Không tìm thấy tin nhắn.' });

  const { emoji } = req.body;
  if (!emoji || message.reactions.get(req.userId) === emoji) message.reactions.delete(req.userId);
  else message.reactions.set(req.userId, emoji);
  await saveMessageAndBroadcast(res, message);
});

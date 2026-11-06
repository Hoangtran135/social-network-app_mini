import { Router, Request, Response, NextFunction } from 'express';
import { ConversationModel } from '../models/Conversation';
import { MessageModel } from '../models/Message';
import { UserModel } from '../models/User';
import { PostModel } from '../models/Post';
import { requireAuth } from '../jwtAuth';
import {
  validate,
  createConversationSchema,
  setNicknameSchema, setThemeSchema,
  sendMessageSchema,
  reactMessageSchema,
  sharePostToChatSchema,
} from '../validation';
import { conversationToJson, messageToJson, Doc, getId } from '../formatResponse';
import { emitToUser } from '../socketServer';
import { isBlockedBetween } from '../privacyRules';

// API tin nhắn (/api/messages): danh sách hội thoại, tạo chat 1-1 / nhóm, đặt biệt danh,
// đọc / gửi / thu hồi tin nhắn, thả cảm xúc, chia sẻ bài viết vào chat.
// Tin nhắn mới hoặc vừa thay đổi được đẩy realtime tới các thành viên bằng sự kiện "message:new".

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

const getMemberIds = (conv: Doc): string[] => conv.participants.map(getId); // getId: đúng cả khi participants đã populate

/** Gửi tin nhắn realtime tới các thành viên */
function broadcastMessage(conv: Doc, message: unknown, exceptUserId?: string) {
  getMemberIds(conv)
    .filter((id) => id !== exceptUserId)
    .forEach((id) => emitToUser(id, 'message:new', { conversationId: conv.id, message }));
}

/** Báo cho mọi thành viên (trừ người vừa đổi) thông tin hội thoại mới: biệt danh, màu chủ đề... để cả hai bên thấy giống nhau ngay. */
function broadcastConversationUpdate(conv: Doc, exceptUserId: string) {
  const conversation = conversationToJson(conv);
  getMemberIds(conv)
    .filter((id) => id !== exceptUserId)
    .forEach((id) => emitToUser(id, 'conversation:update', { conversation }));
}

/** Tạo tin nhắn hệ thống */
async function createSystemMessage(conversationId: string, content: string) {
  const message = await MessageModel.create({ conversation: conversationId, kind: 'system', content });
  await ConversationModel.findByIdAndUpdate(conversationId, { updatedAt: new Date() });
  return message;
}

/** Middleware: kiểm tra là thành viên hội thoại */
async function requireMember(req: Request, res: Response, next: NextFunction) {
  const conv = await ConversationModel.findById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Không tìm thấy cuộc trò chuyện.' });
  if (!getMemberIds(conv).includes(req.userId)) return res.status(403).json({ error: 'Bạn không phải là thành viên của cuộc trò chuyện này.' });
  res.locals.conv = conv;
  next();
}

/** Middleware: chặn gửi tin khi hai bên chặn nhau */
async function requireNotBlocked(req: Request, res: Response, next: NextFunction) {
  const conv = res.locals.conv;
  const otherId = getMemberIds(conv).find((id) => id !== req.userId);
  if (!conv.isGroup && (await isBlockedBetween(req.userId, otherId))) return res.status(403).json({ error: 'Không thể nhắn tin với người dùng này.' });
  next();
}

/** Tạo và gửi tin nhắn */
async function createAndBroadcastMessage(req: Request, res: Response, data: Record<string, unknown>) {
  const conv = res.locals.conv;
  const message = await MessageModel.create({ conversation: conv._id, sender: req.userId, readBy: [req.userId], ...data });
  await message.populate('sender');
  await ConversationModel.findByIdAndUpdate(conv._id, { updatedAt: new Date() });
  const json = messageToJson(message, getMemberIds(conv));
  broadcastMessage(conv, json, req.userId);
  res.json({ message: json });
}

/** Tìm tin nhắn trong hội thoại */
const findMessage = (req: Request) => MessageModel.findOne({ _id: req.params.messageId, conversation: req.params.id });

/** Lưu tin nhắn đã sửa và gửi realtime */
async function saveMessageAndBroadcast(res: Response, message: Doc) {
  await message.save();
  await message.populate('sender');
  const json = messageToJson(message, getMemberIds(res.locals.conv));
  broadcastMessage(res.locals.conv, json);
  res.json({ message: json });
}

/** Lấy danh sách hội thoại */
messagesRouter.get('/conversations', async (req, res) => {
  const conversations = await ConversationModel.find({ participants: req.userId }).sort({ updatedAt: -1 }).populate('participants');
  const result = await Promise.all(
    conversations.map(async (c: Doc) => {
      const [last, unread] = await Promise.all([
        MessageModel.findOne({ conversation: c._id, deletedFor: { $ne: req.userId } }).sort({ createdAt: -1 }).populate('sender'),
        MessageModel.countDocuments({ conversation: c._id, sender: { $ne: req.userId }, readBy: { $ne: req.userId }, deletedFor: { $ne: req.userId } }),
      ]);
      return conversationToJson(c, last, unread);
    })
  );
  res.json({ conversations: result });
});

/** Tạo hội thoại 1-1 hoặc nhóm */
messagesRouter.post('/conversations', validate(createConversationSchema), async (req, res) => {
  const { participantId, participantIds, name } = req.body;
  const ids: string[] = [...new Set<string>([...(participantIds || [participantId]), req.userId])].filter(Boolean);

  if ((await UserModel.countDocuments({ _id: { $in: ids } })) !== ids.length) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
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
  if (!otherId) return res.status(400).json({ error: 'Không thể tạo cuộc trò chuyện với chính mình.' });
  let conv = await ConversationModel.findOne({ isGroup: false, participants: { $all: [req.userId, otherId], $size: 2 } });
  if (!conv) {
    if (await isBlockedBetween(req.userId, otherId)) return res.status(403).json({ error: 'Không thể nhắn tin với người dùng này.' });
    conv = await ConversationModel.create({ isGroup: false, participants: [req.userId, otherId] });
  }
  await conv.populate('participants');
  res.json({ conversation: conversationToJson(conv) });
});

/** Đặt biệt danh */
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
  broadcastConversationUpdate(conv, req.userId);
  broadcastMessage(conv, messageToJson(systemMessage, getMemberIds(conv)), req.userId);
});

/** Đổi màu chủ đề (áp dụng cho mọi thành viên của cuộc trò chuyện) */
messagesRouter.patch('/conversations/:id/theme', validate(setThemeSchema), requireMember, async (req, res) => {
  const conv = res.locals.conv;
  conv.themeColor = req.body.color;
  await conv.save();
  await conv.populate('participants');
  const actor = await UserModel.findById(req.userId);
  const systemMessage = await createSystemMessage(conv.id, `${actor?.name} đã đổi màu chủ đề của cuộc trò chuyện.`);
  res.json({ conversation: conversationToJson(conv), systemMessage: messageToJson(systemMessage) });
  broadcastConversationUpdate(conv, req.userId);
  broadcastMessage(conv, messageToJson(systemMessage, getMemberIds(conv)), req.userId);
});

/** Lấy tin nhắn của hội thoại */
messagesRouter.get('/conversations/:id/messages', requireMember, async (req, res) => {
  const messages = await MessageModel.find({ conversation: req.params.id, deletedFor: { $ne: req.userId } }).sort({ createdAt: 1 }).limit(500).populate('sender');
  await MessageModel.updateMany({ conversation: req.params.id, sender: { $ne: req.userId } }, { $addToSet: { readBy: req.userId } });
  const ids = getMemberIds(res.locals.conv);
  res.json({ messages: messages.map((m: Doc) => messageToJson(m, ids)) });
});

/** Gửi tin nhắn */
messagesRouter.post('/conversations/:id/messages', validate(sendMessageSchema), requireMember, requireNotBlocked, (req, res) =>
  createAndBroadcastMessage(req, res, { content: req.body.content, attachments: req.body.attachments })
);

/** Chia sẻ bài viết vào chat */
messagesRouter.post('/conversations/:id/share-post', validate(sharePostToChatSchema), requireMember, requireNotBlocked, async (req, res) => {
  const post = await PostModel.findById(req.body.postId).select('group');
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  if (post.group) return res.status(400).json({ error: 'Không thể chia sẻ bài viết trong nhóm qua tin nhắn.' });
  await createAndBroadcastMessage(req, res, { content: req.body.message || '', sharedPostId: req.body.postId });
});

/** Thu hồi tin nhắn */
messagesRouter.delete('/conversations/:id/messages/:messageId', requireMember, async (req, res) => {
  const message = await findMessage(req);
  if (!message) return res.status(404).json({ error: 'Không tìm thấy tin nhắn.' });
  if (message.sender?.toString() !== req.userId) return res.status(403).json({ error: 'Bạn chỉ có thể thu hồi tin nhắn của chính mình.' });

  Object.assign(message, { isRecalled: true, content: '', attachments: [], reactions: new Map() });
  await saveMessageAndBroadcast(res, message);
});

/** "Xóa với tôi": ẩn tin nhắn khỏi phía mình, người khác vẫn thấy (khác với thu hồi) */
messagesRouter.post('/conversations/:id/messages/:messageId/delete-for-me', requireMember, async (req, res) => {
  const message = await findMessage(req);
  if (!message) return res.status(404).json({ error: 'Không tìm thấy tin nhắn.' });
  await MessageModel.updateOne({ _id: message._id }, { $addToSet: { deletedFor: req.userId } });
  res.json({ ok: true });
});

/** Thả cảm xúc tin nhắn */
messagesRouter.post('/conversations/:id/messages/:messageId/react', validate(reactMessageSchema), requireMember, async (req, res) => {
  const message = await findMessage(req);
  if (!message) return res.status(404).json({ error: 'Không tìm thấy tin nhắn.' });

  const { emoji } = req.body;
  if (!emoji || message.reactions.get(req.userId) === emoji) message.reactions.delete(req.userId);
  else message.reactions.set(req.userId, emoji);
  await saveMessageAndBroadcast(res, message);
});

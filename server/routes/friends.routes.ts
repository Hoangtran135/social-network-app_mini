import { Router } from 'express';
import { FriendRequestModel } from '../models/FriendRequest';
import { FriendshipModel } from '../models/Friendship';
import { UserModel } from '../models/User';
import { createNotification } from '../createNotification';
import { requireAuth } from '../jwtAuth';
import { validate, sendFriendRequestSchema } from '../validation';
import { friendRequestToJson, userToJson, Doc } from '../formatResponse';
import { emitToUser } from '../socketServer';
import { isBlockedBetween, getBlockedIds, getFriendIds } from '../privacyRules';

// API bạn bè (/api/friends): danh sách bạn, gợi ý kết bạn, gửi / chấp nhận / từ chối / huỷ lời mời, huỷ kết bạn.

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

/** Danh sách bạn bè (dạng JSON) của một người. */
async function getFriendList(userId: string) {
  const friendships = await FriendshipModel.find({ $or: [{ userA: userId }, { userB: userId }] }).populate(['userA', 'userB']);
  return friendships.map((f: Doc) => userToJson(f.userA.id === userId ? f.userB : f.userA));
}

/** Tìm lời mời mà người dùng có liên quan (role = 'sender' hoặc 'receiver'); không đúng người thì trả null. */
async function findRequestOfUser(id: string, userId: string, role: 'sender' | 'receiver') {
  const request = await FriendRequestModel.findById(id);
  return request && request[role].toString() === userId ? request : null;
}

/** GET /api/friends — bạn bè của mình. */
friendsRouter.get('/', async (req, res) => {
  res.json({ friends: await getFriendList(req.userId) });
});

/** GET /api/friends/of/:userId — bạn bè của một người bất kỳ. */
friendsRouter.get('/of/:userId', async (req, res) => {
  res.json({ friends: await getFriendList(req.params.userId) });
});

/** GET /api/friends/suggestions — gợi ý: bỏ chính mình, bạn bè, người bị chặn và những người đang có lời mời qua lại. */
friendsRouter.get('/suggestions', async (req, res) => {
  const me = req.userId;
  const [friendIds, blockedIds, pending] = await Promise.all([
    getFriendIds(me),
    getBlockedIds(me),
    FriendRequestModel.find({ $or: [{ sender: me }, { receiver: me }] }),
  ]);
  const pendingIds = pending.map((r: Doc) => (r.sender.toString() === me ? r.receiver : r.sender).toString());
  const excludeIds = [me, ...friendIds, ...blockedIds, ...pendingIds];
  const users = await UserModel.find({ _id: { $nin: excludeIds } })
    .sort({ joinDate: -1 })
    .limit(Math.min(Number(req.query.limit) || 12, 30));
  res.json({ users: users.map(userToJson) });
});

/** GET /api/friends/requests — lời mời gửi đến mình. */
friendsRouter.get('/requests', async (req, res) => {
  const requests = await FriendRequestModel.find({ receiver: req.userId }).populate('sender');
  res.json({ requests: requests.map((r: Doc) => friendRequestToJson(r)) });
});

/** GET /api/friends/requests/sent — lời mời mình đã gửi. */
friendsRouter.get('/requests/sent', async (req, res) => {
  const requests = await FriendRequestModel.find({ sender: req.userId }).populate(['sender', 'receiver']);
  res.json({ requests: requests.map((r: Doc) => friendRequestToJson(r)) });
});

/** POST /api/friends/requests — gửi lời mời và báo cho người nhận. */
friendsRouter.post('/requests', validate(sendFriendRequestSchema), async (req, res) => {
  const me = req.userId;
  const { targetUserId } = req.body;
  if (targetUserId === me) return res.status(400).json({ error: 'Không thể gửi lời mời cho chính mình.' });
  if (await FriendRequestModel.exists({ sender: me, receiver: targetUserId })) return res.status(409).json({ error: 'Đã gửi lời mời trước đó.' });
  if (await isBlockedBetween(me, targetUserId)) return res.status(403).json({ error: 'Không thể gửi lời mời kết bạn cho người dùng này.' });

  const request = await FriendRequestModel.create({ sender: me, receiver: targetUserId });
  await request.populate('sender');
  await createNotification({ user: targetUserId, actor: me, type: 'friend_request', content: 'đã gửi cho bạn một lời mời kết bạn.', targetId: me, targetType: 'profile' });
  res.json({ request: friendRequestToJson(request) });
});

/** POST /api/friends/requests/:id/accept — tạo quan hệ bạn bè, xoá lời mời, báo cho người gửi. */
friendsRouter.post('/requests/:id/accept', async (req, res) => {
  const request = await findRequestOfUser(req.params.id, req.userId, 'receiver');
  if (!request) return res.status(404).json({ error: 'Không tìm thấy lời mời.' });

  const senderId = request.sender.toString();
  await FriendshipModel.create({ userA: req.userId, userB: senderId });
  await request.deleteOne();
  await createNotification({ user: senderId, actor: req.userId, type: 'friend_accept', content: 'đã chấp nhận lời mời kết bạn của bạn.', targetId: req.userId, targetType: 'profile' });
  res.json({ ok: true });
});

/** POST /api/friends/requests/:id/reject — người nhận từ chối (chỉ báo realtime, không tạo thông báo). */
friendsRouter.post('/requests/:id/reject', async (req, res) => {
  const request = await findRequestOfUser(req.params.id, req.userId, 'receiver');
  if (!request) return res.status(404).json({ error: 'Không tìm thấy lời mời.' });
  await request.deleteOne();
  res.json({ ok: true });
  emitToUser(request.sender.toString(), 'friend-request:rejected', { requestId: request.id });
});

/** DELETE /api/friends/requests/:id — người gửi huỷ lời mời của mình. */
friendsRouter.delete('/requests/:id', async (req, res) => {
  const request = await findRequestOfUser(req.params.id, req.userId, 'sender');
  if (!request) return res.status(404).json({ error: 'Không tìm thấy lời mời.' });
  await request.deleteOne();
  res.json({ ok: true });
  emitToUser(request.receiver.toString(), 'friend-request:cancelled', { requestId: request.id });
});

/** DELETE /api/friends/:userId — huỷ kết bạn (mình có thể là A hoặc B trong quan hệ). */
friendsRouter.delete('/:userId', async (req, res) => {
  const me = req.userId;
  const other = req.params.userId;
  await FriendshipModel.deleteOne({ $or: [{ userA: me, userB: other }, { userA: other, userB: me }] });
  res.json({ ok: true });
  emitToUser(other, 'friend:removed', { userId: me });
});

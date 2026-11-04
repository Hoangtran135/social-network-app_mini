import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { io as connect, Socket } from 'socket.io-client';
import type { Express } from 'express';
import { setupSocketServer } from '../../server/socketServer';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, createPost, TestUser } from './helpers';

// Test realtime (Socket.io): xác thực kết nối, và các sự kiện server đẩy tới đúng người (tin nhắn, thông báo, bài viết, story...).
// Đặc biệt kiểm tra: người lạ nhắn tới thì NGƯỜI NHẬN nhận được sự kiện "message:new" (để giao diện bật hộp thoại chat).

let app: Express;
let server: http.Server;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
  server = http.createServer(app);
  setupSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise((resolve) => server.close(resolve));
  await disconnectTestDb();
});

/** Kết nối socket với token của user và chờ đến khi đã vào phòng riêng. */
async function listen(user: TestUser, events: string[]) {
  const socket = connect(url, { auth: { token: user.token }, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  const received: Record<string, unknown[]> = Object.fromEntries(events.map((e) => [e, []]));
  events.forEach((e) => socket.on(e, (payload) => received[e].push(payload)));
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
  await new Promise((r) => setTimeout(r, 60)); // đợi server xử lý join phòng
  return received;
}
const settle = () => new Promise((r) => setTimeout(r, 250));

describe('Kết nối', () => {
  it('token hợp lệ → kết nối được', async () => {
    const a = await signUp(app);
    await expect(listen(a, [])).resolves.toBeDefined();
  });

  it('không có token / token sai → bị từ chối', async () => {
    for (const token of [undefined, 'rac.rac.rac']) {
      const socket = connect(url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
      sockets.push(socket);
      const err = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
      expect(err.message).toMatch(/Phiên đăng nhập/);
    }
  });
});

describe('Tin nhắn realtime', () => {
  it('NGƯỜI LẠ chưa kết bạn nhắn tới → người nhận nhận ngay sự kiện message:new với conversationId (để bật hộp thoại)', async () => {
    const stranger = await signUp(app);
    const me = await signUp(app);
    const inbox = await listen(me, ['message:new']);
    const conv = (await as(app, stranger).post('/api/messages/conversations').send({ participantId: me.id })).body.conversation;
    await as(app, stranger).post(`/api/messages/conversations/${conv.id}/messages`).send({ content: 'Xin chào' });
    await settle();
    expect(inbox['message:new']).toHaveLength(1);
    expect(inbox['message:new'][0]).toMatchObject({ conversationId: conv.id, message: { content: 'Xin chào', senderId: stranger.id, senderName: stranger.name } });
  });

  it('người gửi KHÔNG nhận lại tin của chính mình; người ngoài hội thoại không nhận', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const outsider = await signUp(app);
    const inboxA = await listen(a, ['message:new']);
    const inboxOutsider = await listen(outsider, ['message:new']);
    const conv = (await as(app, a).post('/api/messages/conversations').send({ participantId: b.id })).body.conversation.id;
    await as(app, a).post(`/api/messages/conversations/${conv}/messages`).send({ content: 'x' });
    await settle();
    expect(inboxA['message:new']).toHaveLength(0);
    expect(inboxOutsider['message:new']).toHaveLength(0);
  });

  it('thu hồi / thả cảm xúc cũng được đẩy tới các thành viên', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const inboxB = await listen(b, ['message:new']);
    const conv = (await as(app, a).post('/api/messages/conversations').send({ participantId: b.id })).body.conversation.id;
    const msg = (await as(app, a).post(`/api/messages/conversations/${conv}/messages`).send({ content: 'x' })).body.message;
    await as(app, a).delete(`/api/messages/conversations/${conv}/messages/${msg.id}`);
    await settle();
    const events = inboxB['message:new'] as { message: { isRecalled: boolean } }[];
    expect(events).toHaveLength(2);
    expect(events[1].message.isRecalled).toBe(true);
  });

  it('nhóm chat: mọi thành viên khác người gửi đều nhận', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    const inboxB = await listen(b, ['message:new']);
    const inboxC = await listen(c, ['message:new']);
    const conv = (await as(app, a).post('/api/messages/conversations').send({ participantIds: [b.id, c.id], name: 'G' })).body.conversation.id;
    await as(app, a).post(`/api/messages/conversations/${conv}/messages`).send({ content: 'cả nhóm' });
    await settle();
    expect(inboxB['message:new']).toHaveLength(1);
    expect(inboxC['message:new']).toHaveLength(1);
  });

  it('nhiều tab của cùng một người đều nhận', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const tab1 = await listen(b, ['message:new']);
    const tab2 = await listen(b, ['message:new']);
    const conv = (await as(app, a).post('/api/messages/conversations').send({ participantId: b.id })).body.conversation.id;
    await as(app, a).post(`/api/messages/conversations/${conv}/messages`).send({ content: 'x' });
    await settle();
    expect(tab1['message:new']).toHaveLength(1);
    expect(tab2['message:new']).toHaveLength(1);
  });
});

describe('Thông báo realtime', () => {
  it('lời mời kết bạn / chấp nhận / thích bài đều đẩy notification:new tới đúng người', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const inboxA = await listen(a, ['notification:new']);
    const inboxB = await listen(b, ['notification:new']);
    await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
    await settle();
    expect(inboxB['notification:new']).toHaveLength(1);
    expect(inboxB['notification:new'][0]).toMatchObject({ type: 'friend_request', actor: { id: a.id } });
    expect(inboxA['notification:new']).toHaveLength(0);
  });
});

describe('Bài viết / story realtime tuân theo quyền riêng tư', () => {
  it('bài công khai → mọi người online nhận post:new (trừ tác giả)', async () => {
    const a = await signUp(app);
    const stranger = await signUp(app);
    const inboxA = await listen(a, ['post:new']);
    const inboxS = await listen(stranger, ['post:new']);
    const post = await createPost(app, a, { privacy: 'public' });
    await settle();
    expect(inboxS['post:new']).toHaveLength(1);
    expect((inboxS['post:new'][0] as { post: { id: string } }).post.id).toBe(post.id);
    expect(inboxA['post:new']).toHaveLength(0);
  });

  it('bài "bạn bè" → chỉ bạn bè nhận, người lạ KHÔNG nhận', async () => {
    const a = await signUp(app);
    const friend = await signUp(app);
    const stranger = await signUp(app);
    await befriend(app, a, friend);
    const inboxF = await listen(friend, ['post:new']);
    const inboxS = await listen(stranger, ['post:new']);
    await createPost(app, a, { privacy: 'friends' });
    await settle();
    expect(inboxF['post:new']).toHaveLength(1);
    expect(inboxS['post:new']).toHaveLength(0);
  });

  it('bài "chỉ mình tôi" → không ai nhận', async () => {
    const a = await signUp(app);
    const friend = await signUp(app);
    await befriend(app, a, friend);
    const inboxF = await listen(friend, ['post:new']);
    await createPost(app, a, { privacy: 'only_me' });
    await settle();
    expect(inboxF['post:new']).toHaveLength(0);
  });

  it('xoá bài → người xem nhận post:delete', async () => {
    const a = await signUp(app);
    const viewer = await signUp(app);
    const inbox = await listen(viewer, ['post:delete']);
    const post = await createPost(app, a);
    await as(app, a).delete(`/api/posts/${post.id}`);
    await settle();
    expect(inbox['post:delete']).toEqual([{ postId: post.id }]);
  });

  it('story "bạn bè" chỉ gửi cho bạn bè', async () => {
    const a = await signUp(app);
    const friend = await signUp(app);
    const stranger = await signUp(app);
    await befriend(app, a, friend);
    const inboxF = await listen(friend, ['story:new']);
    const inboxS = await listen(stranger, ['story:new']);
    await as(app, a).post('/api/stories').send({ type: 'text', textContent: 'x', privacy: 'friends' });
    await settle();
    expect(inboxF['story:new']).toHaveLength(1);
    expect(inboxS['story:new']).toHaveLength(0);
  });

  it('huỷ lời mời / từ chối / huỷ kết bạn đẩy sự kiện tương ứng', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const inboxA = await listen(a, ['friend-request:rejected', 'friend:removed']);
    const inboxB = await listen(b, ['friend-request:cancelled']);
    const req1 = (await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id })).body.request.id;
    await as(app, a).delete(`/api/friends/requests/${req1}`);
    const req2 = (await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id })).body.request.id;
    await as(app, b).post(`/api/friends/requests/${req2}/reject`);
    await befriend(app, a, b);
    await as(app, b).delete(`/api/friends/${a.id}`);
    await settle();
    expect(inboxB['friend-request:cancelled']).toEqual([{ requestId: req1 }]);
    expect(inboxA['friend-request:rejected']).toEqual([{ requestId: req2 }]);
    expect(inboxA['friend:removed']).toEqual([{ userId: b.id }]);
  });
});

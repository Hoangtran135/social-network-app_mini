import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { io as connect, Socket } from 'socket.io-client';
import type { Express } from 'express';
import { setupSocketServer } from '../../server/socketServer';
import { UserModel } from '../../server/models/User';
import { MessageModel } from '../../server/models/Message';
import { vi } from 'vitest';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, bogusId, TestUser } from './helpers';

// Chat: hiện diện (online / lần cuối hoạt động), "đang gõ...", đã nhận (delivered), và "Xóa với tôi".

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

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

async function open(user: TestUser, events: string[] = []) {
  const socket = connect(url, { auth: { token: user.token }, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  const got: Record<string, any[]> = Object.fromEntries(events.map((e) => [e, []])); // eslint-disable-line @typescript-eslint/no-explicit-any
  events.forEach((e) => socket.on(e, (p) => got[e].push(p)));
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
  await settle(80);
  return { socket, got };
}
const dbUser = (u: TestUser) => UserModel.findById(u.id);
const chat = async (a: TestUser, b: TestUser) => (await as(app, a).post('/api/messages/conversations').send({ participantId: b.id })).body.conversation.id as string;
const send = async (u: TestUser, conv: string, content = 'xin chào') => (await as(app, u).post(`/api/messages/conversations/${conv}/messages`).send({ content })).body.message as { id: string; [k: string]: unknown };

describe('Hiện diện: online / lần cuối hoạt động', () => {
  it('kết nối → online (xoá lastActive); đóng kết nối → offline + lastActive', async () => {
    const a = await signUp(app);
    await as(app, a).post('/api/auth/logout'); // đặt offline + lastActive trước
    expect((await dbUser(a))!.isOnline).toBe(false);
    const { socket } = await open(a);
    await settle();
    const online = await dbUser(a);
    expect(online!.isOnline).toBe(true);
    expect(online!.lastActive).toBeUndefined();
    socket.disconnect();
    await settle(400);
    const offline = await dbUser(a);
    expect(offline!.isOnline).toBe(false);
    expect(offline!.lastActive).toBeInstanceOf(Date);
  });

  it('nhiều tab: chỉ offline khi đóng tab CUỐI CÙNG', async () => {
    const a = await signUp(app);
    const t1 = await open(a);
    const t2 = await open(a);
    t1.socket.disconnect();
    await settle(400);
    expect((await dbUser(a))!.isOnline).toBe(true);
    t2.socket.disconnect();
    await settle(400);
    expect((await dbUser(a))!.isOnline).toBe(false);
  });

  it('người khác nhận "presence:update" khi có người online / offline', async () => {
    const a = await signUp(app);
    const watcher = await signUp(app);
    const w = await open(watcher, ['presence:update']);
    const t = await open(a);
    await settle();
    t.socket.disconnect();
    await settle(400);
    const events = (w.got['presence:update'] as { userId: string; isOnline: boolean; lastActive?: string }[]).filter((e) => e.userId === a.id);
    expect(events.map((e) => e.isOnline)).toEqual([true, false]);
    expect(events[1].lastActive).toBeTruthy();
    expect(events[0].lastActive).toBeUndefined();
  });

  it('mở lại sau khi offline → xoá lastActive cũ', async () => {
    const a = await signUp(app);
    const first = await open(a);
    first.socket.disconnect();
    await settle(400);
    expect((await dbUser(a))!.lastActive).toBeInstanceOf(Date);
    await open(a);
    await settle();
    expect((await dbUser(a))!.lastActive).toBeUndefined();
  });

  it('database lỗi khi cập nhật hiện diện → bỏ qua, kết nối realtime vẫn sống', async () => {
    const a = await signUp(app);
    const spy = vi.spyOn(UserModel, 'updateOne').mockRejectedValueOnce(new Error('database sập'));
    const { socket } = await open(a);
    await settle();
    expect(spy).toHaveBeenCalled();
    expect(socket.connected).toBe(true);
    spy.mockRestore();
  });

  it('API người dùng / bạn bè trả đúng isOnline và lastActive', async () => {
    const a = await signUp(app);
    const viewer = await signUp(app);
    const t = await open(a);
    await settle();
    expect((await as(app, viewer).get(`/api/users/${a.id}`)).body.user.isOnline).toBe(true);
    t.socket.disconnect();
    await settle(400);
    const user = (await as(app, viewer).get(`/api/users/${a.id}`)).body.user;
    expect(user.isOnline).toBe(false);
    expect(user.lastActive).toBeTruthy();
  });
});

describe('"Đang gõ..."', () => {
  it('thành viên khác nhận "typing" với đúng conversationId, userId, isTyping; người gõ thì không', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    const A = await open(a, ['typing']);
    const B = await open(b, ['typing']);
    A.socket.emit('typing', { conversationId: conv, isTyping: true });
    A.socket.emit('typing', { conversationId: conv, isTyping: false });
    await settle();
    expect(B.got.typing).toEqual([{ conversationId: conv, userId: a.id, isTyping: true }, { conversationId: conv, userId: a.id, isTyping: false }]);
    expect(A.got.typing).toEqual([]);
  });

  it('nhóm chat: mọi thành viên khác đều nhận', async () => {
    const [a, b, c] = await Promise.all([signUp(app), signUp(app), signUp(app)]);
    const conv = (await as(app, a).post('/api/messages/conversations').send({ participantIds: [b.id, c.id], name: 'G' })).body.conversation.id;
    const A = await open(a);
    const B = await open(b, ['typing']);
    const C = await open(c, ['typing']);
    A.socket.emit('typing', { conversationId: conv, isTyping: true });
    await settle();
    expect(B.got.typing).toHaveLength(1);
    expect(C.got.typing).toHaveLength(1);
  });

  it('NGƯỜI NGOÀI hội thoại gửi "typing" → bị bỏ qua (không ai nhận)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const outsider = await signUp(app);
    const conv = await chat(a, b);
    const B = await open(b, ['typing']);
    const O = await open(outsider);
    O.socket.emit('typing', { conversationId: conv, isTyping: true });
    await settle();
    expect(B.got.typing).toEqual([]);
  });

  it.each([
    ['thiếu payload', undefined],
    ['conversationId sai định dạng', { conversationId: 'abc', isTyping: true }],
    ['conversationId không tồn tại', { conversationId: bogusId, isTyping: true }],
    ['conversationId là object', { conversationId: { $ne: null }, isTyping: true }],
    ['conversationId là số', { conversationId: 5 }],
    ['payload là chuỗi', 'rác'],
  ])('payload xấu (%s) → bỏ qua, server vẫn sống', async (_l, payload) => {
    const a = await signUp(app);
    const b = await signUp(app);
    await chat(a, b);
    const A = await open(a);
    const B = await open(b, ['typing']);
    A.socket.emit('typing', payload);
    await settle(150);
    expect(B.got.typing).toEqual([]);
    expect(A.socket.connected).toBe(true);
  });

  it('nhiều sự kiện liên tiếp tới nơi theo ĐÚNG THỨ TỰ gửi (không bị đảo khi xử lý song song)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    const A = await open(a);
    const B = await open(b, ['typing']);
    const sent = Array.from({ length: 40 }, (_, i) => i % 2 === 0);
    sent.forEach((isTyping) => A.socket.emit('typing', { conversationId: conv, isTyping }));
    await settle(800);
    expect(B.got.typing.map((t: { isTyping: boolean }) => t.isTyping)).toEqual(sent);
  });

  it('isTyping không phải boolean được ép về boolean', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    const A = await open(a);
    const B = await open(b, ['typing']);
    A.socket.emit('typing', { conversationId: conv, isTyping: 'có' });
    A.socket.emit('typing', { conversationId: conv });
    await settle();
    expect(B.got.typing.map((t: { isTyping: boolean }) => t.isTyping)).toEqual([true, false]);
  });
});

describe('Đã gửi / đã nhận / đã xem', () => {
  it('tin mới: chưa ai nhận (deliveredTo rỗng) và chưa đọc', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    const msg = await send(a, conv);
    expect(msg.deliveredTo).toEqual([]);
    expect(msg.isRead).toBe(false);
  });

  it('người nhận báo "message:delivered" → ghi vào DB và người gửi nhận sự kiện', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    const A = await open(a, ['message:delivered']);
    const B = await open(b);
    const msg = await send(a, conv);
    B.socket.emit('message:delivered', { conversationId: conv, messageId: msg.id });
    await settle();
    expect(A.got['message:delivered']).toEqual([{ conversationId: conv, messageId: msg.id, userId: b.id }]);
    const history = (await as(app, a).get(`/api/messages/conversations/${conv}/messages`)).body.messages;
    expect(history[0].deliveredTo).toEqual([b.id]);
    expect(history[0].isRead).toBe(false); // đã nhận ≠ đã xem
  });

  it('báo nhiều lần chỉ ghi một lần', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    const B = await open(b);
    const msg = await send(a, conv);
    for (let i = 0; i < 3; i++) B.socket.emit('message:delivered', { conversationId: conv, messageId: msg.id });
    await settle();
    expect((await MessageModel.findById(msg.id))!.deliveredTo).toHaveLength(1);
  });

  it('người gửi KHÔNG tự đánh dấu "đã nhận" tin của mình', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    const A = await open(a, ['message:delivered']);
    const msg = await send(a, conv);
    A.socket.emit('message:delivered', { conversationId: conv, messageId: msg.id });
    await settle();
    expect(A.got['message:delivered']).toEqual([]);
    expect((await MessageModel.findById(msg.id))!.deliveredTo).toHaveLength(0);
  });

  it('người NGOÀI hội thoại không đánh dấu được', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const outsider = await signUp(app);
    const conv = await chat(a, b);
    const O = await open(outsider);
    const msg = await send(a, conv);
    O.socket.emit('message:delivered', { conversationId: conv, messageId: msg.id });
    await settle();
    expect((await MessageModel.findById(msg.id))!.deliveredTo).toHaveLength(0);
  });

  it('messageId thuộc hội thoại khác / không tồn tại / sai định dạng → bỏ qua', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    const conv1 = await chat(a, b);
    const conv2 = await chat(a, c);
    const B = await open(b);
    const msgInConv2 = await send(a, conv2);
    for (const messageId of [msgInConv2.id, bogusId, 'abc', 5, null]) B.socket.emit('message:delivered', { conversationId: conv1, messageId });
    B.socket.emit('message:delivered', undefined);
    B.socket.emit('message:delivered', { conversationId: 'abc', messageId: msgInConv2.id });
    await settle();
    expect((await MessageModel.findById(msgInConv2.id))!.deliveredTo).toHaveLength(0);
    expect(B.socket.connected).toBe(true);
  });

  it('nhóm chat: nhiều người cùng báo đã nhận', async () => {
    const [a, b, c] = await Promise.all([signUp(app), signUp(app), signUp(app)]);
    const conv = (await as(app, a).post('/api/messages/conversations').send({ participantIds: [b.id, c.id], name: 'G' })).body.conversation.id;
    const A = await open(a, ['message:delivered']);
    const B = await open(b);
    const C = await open(c);
    const msg = await send(a, conv);
    B.socket.emit('message:delivered', { conversationId: conv, messageId: msg.id });
    C.socket.emit('message:delivered', { conversationId: conv, messageId: msg.id });
    await settle();
    expect(A.got['message:delivered']).toHaveLength(2);
    expect((await MessageModel.findById(msg.id))!.deliveredTo.map(String).sort()).toEqual([b.id, c.id].sort());
  });

  it('mở hội thoại (đọc) → isRead = true với người gửi', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    await send(a, conv);
    await as(app, b).get(`/api/messages/conversations/${conv}/messages`);
    expect((await as(app, a).get(`/api/messages/conversations/${conv}/messages`)).body.messages[0].isRead).toBe(true);
  });
});

describe('"Xóa với tôi"', () => {
  const del = (u: TestUser, conv: string, id: string) => as(app, u).post(`/api/messages/conversations/${conv}/messages/${id}/delete-for-me`);
  const texts = async (u: TestUser, conv: string) => ((await as(app, u).get(`/api/messages/conversations/${conv}/messages`)).body.messages as { content: string }[]).map((m) => m.content);

  it('ẩn với mình, người kia vẫn thấy', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    const m1 = await send(a, conv, 'một');
    await send(a, conv, 'hai');
    expect((await del(b, conv, m1.id)).status).toBe(200);
    expect(await texts(b, conv)).toEqual(['hai']);
    expect(await texts(a, conv)).toEqual(['một', 'hai']);
  });

  it('người gửi cũng xoá được tin của mình phía mình (không thu hồi)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    const m = await send(a, conv, 'của a');
    await del(a, conv, m.id);
    expect(await texts(a, conv)).toEqual([]);
    expect(await texts(b, conv)).toEqual(['của a']);
  });

  it('xoá nhiều lần không lỗi, không trùng', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    const m = await send(a, conv);
    for (let i = 0; i < 3; i++) expect((await del(b, conv, m.id)).status).toBe(200);
    expect((await MessageModel.findById(m.id))!.deletedFor).toHaveLength(1);
  });

  it('danh sách hội thoại: tin cuối và số chưa đọc bỏ qua tin đã xoá phía mình', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    await send(a, conv, 'cũ');
    const last = await send(a, conv, 'mới nhất');
    expect((await as(app, b).get('/api/messages/conversations')).body.conversations[0].unreadCount).toBe(2);
    await del(b, conv, last.id);
    const c = (await as(app, b).get('/api/messages/conversations')).body.conversations[0];
    expect(c.unreadCount).toBe(1);
    expect(c.lastMessage.content).toBe('cũ');
    expect((await as(app, a).get('/api/messages/conversations')).body.conversations[0].lastMessage.content).toBe('mới nhất');
  });

  it('người ngoài hội thoại → 403; tin không tồn tại → 404; tin của hội thoại khác → 404; id sai → 400; chưa đăng nhập → 401', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const outsider = await signUp(app);
    const c = await signUp(app);
    const conv = await chat(a, b);
    const other = await chat(a, c);
    const m = await send(a, conv);
    const inOther = await send(a, other);
    expect((await del(outsider, conv, m.id)).status).toBe(403);
    expect((await del(a, conv, bogusId)).status).toBe(404);
    expect((await del(a, conv, inOther.id)).status).toBe(404);
    expect((await del(a, conv, 'abc')).status).toBe(400);
    const { default: request } = await import('supertest');
    expect((await request(app).post(`/api/messages/conversations/${conv}/messages/${m.id}/delete-for-me`)).status).toBe(401);
  });

  it('khác thu hồi: tin xoá phía mình không đổi thành "đã thu hồi" với người kia', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await chat(a, b);
    const m = await send(a, conv, 'giữ');
    await del(a, conv, m.id);
    const seen = (await as(app, b).get(`/api/messages/conversations/${conv}/messages`)).body.messages[0];
    expect(seen).toMatchObject({ content: 'giữ', isRecalled: false });
  });
});

import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import { createToken } from '../../server/jwtAuth';
import { emitToEveryone, emitToUser, emitToUsers, setupSocketServer } from '../../server/socketServer';
import { getBlockedIds, isBlockedBetween } from '../../server/privacyRules';
import { userToJson, meToJson, postToJson, commentToJson, storyToJson, conversationToJson, messageToJson, friendRequestToJson, notificationToJson } from '../../server/formatResponse';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, createPost, bogusId } from './helpers';

// Lấp các nhánh còn lại: xử lý lỗi chung, cấu hình production / CORS / JWT, socket phát cho tất cả,
// hàm định dạng với dữ liệu THIẾU trường, và vài tình huống hiếm của route.

afterEach(() => vi.restoreAllMocks());

describe('errorHandler (xử lý lỗi chung)', () => {
  const buildWithRoutes = async (env: 'development' | 'production') => {
    vi.resetModules();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = env;
    process.env.JWT_SECRET = 'test-secret';
    const { createApp, errorHandler } = await import('../../server/app');
    process.env.NODE_ENV = previous;
    const app = createApp({ rateLimits: false });
    app.get('/boom', () => {
      throw new Error('chi tiết nội bộ nhạy cảm');
    });
    app.get('/teapot', () => {
      throw Object.assign(new Error('ấm trà'), { status: 418 });
    });
    app.get('/partial', (_req, res) => {
      res.write('{"a":');
      throw new Error('lỗi giữa chừng');
    });
    app.use(errorHandler);
    return app;
  };

  it('môi trường phát triển: trả 500 kèm nội dung lỗi để dễ gỡ lỗi', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(await buildWithRoutes('development')).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('chi tiết nội bộ nhạy cảm');
  });

  it('production: KHÔNG lộ chi tiết lỗi nội bộ', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(await buildWithRoutes('production')).get('/boom');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('nhạy cảm');
    expect(res.body.error).toBe('Đã có lỗi xảy ra, vui lòng thử lại sau.');
    expect(log).toHaveBeenCalled(); // vẫn ghi log phía server
  });

  it('giữ nguyên mã trạng thái của lỗi (vd 418)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request(await buildWithRoutes('development')).get('/teapot')).status).toBe(418);
  });

  it('lỗi sau khi đã gửi một phần phản hồi → kết nối được đóng (không treo), server vẫn sống', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = await buildWithRoutes('development');
    const outcome = await Promise.race([
      request(app).get('/partial').then(() => 'đã kết thúc', () => 'đã kết thúc (lỗi kết nối)'),
      new Promise((resolve) => setTimeout(() => resolve('TREO'), 5000)),
    ]);
    expect(outcome).not.toBe('TREO');
    expect((await request(app).get('/boom')).status).toBe(500);
  });

  it('CORS: khi cấu hình CORS_ORIGIN chỉ cho phép đúng nguồn đó', async () => {
    vi.resetModules();
    process.env.CORS_ORIGIN = 'https://a.example.com, https://b.example.com';
    const { createApp } = await import('../../server/app');
    const app = createApp({ rateLimits: false });
    delete process.env.CORS_ORIGIN; // createApp đọc biến này lúc dựng app nên chỉ xoá SAU khi dựng
    const allowed = await request(app).get('/api/health').set('Origin', 'https://b.example.com');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://b.example.com');
    const denied = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('CORS: không cấu hình thì cho phép mọi nguồn (môi trường phát triển)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/health').set('Origin', 'https://bat-ky.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://bat-ky.example.com');
  });
});

describe('jwtAuth — cấu hình production', () => {
  it('production mà thiếu JWT_SECRET → từ chối khởi động', async () => {
    vi.resetModules();
    const keep = { ...process.env };
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    await expect(import('../../server/jwtAuth')).rejects.toThrow('JWT_SECRET must be set in production');
    Object.assign(process.env, keep);
  });

  it('production có JWT_SECRET → hoạt động bình thường', async () => {
    vi.resetModules();
    const keep = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'bi-mat-rat-dai';
    const mod = await import('../../server/jwtAuth');
    expect(mod.getUserIdFromToken(mod.createToken('abc'))).toBe('abc');
    Object.assign(process.env, keep);
  });
});

describe('socketServer — phát sự kiện', () => {
  let server: http.Server;
  let url: string;
  let ids: string[];
  beforeAll(async () => {
    await connectTestDb(); // socket kiểm tra tài khoản trong DB → cần người dùng thật
    const app = buildApp();
    ids = (await Promise.all(['a1', 'b1', 'a2', 'b2'].map((l) => signUp(app, l)))).map((u) => u.id);
    server = http.createServer();
    setupSocketServer(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDb();
  });

  const idOf = (label: string) => ids[['a1', 'b1', 'a2', 'b2'].indexOf(label)];
  const client = async (label: string) => {
    const socket = connect(url, { auth: { token: createToken(idOf(label)) }, transports: ['websocket'], forceNew: true });
    const got: unknown[] = [];
    socket.on('hello', (p) => got.push(p));
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    await new Promise((r) => setTimeout(r, 60));
    return { socket, got };
  };

  it('emitToEveryone không loại trừ ai → tất cả đều nhận; có loại trừ → người đó không nhận', async () => {
    const a = await client('a1');
    const b = await client('b1');
    emitToEveryone('hello', 1);
    emitToEveryone('hello', 2, idOf('a1'));
    await new Promise((r) => setTimeout(r, 150));
    expect(a.got).toEqual([1]);
    expect(b.got).toEqual([1, 2]);
    a.socket.disconnect();
    b.socket.disconnect();
  });

  it('emitToUser / emitToUsers chỉ tới đúng người; danh sách rỗng không lỗi', async () => {
    const a = await client('a2');
    const b = await client('b2');
    emitToUser(idOf('a2'), 'hello', 'riêng a');
    emitToUsers([idOf('b2')], 'hello', 'riêng b');
    emitToUsers([], 'hello', 'không ai');
    await new Promise((r) => setTimeout(r, 150));
    expect(a.got).toEqual(['riêng a']);
    expect(b.got).toEqual(['riêng b']);
    a.socket.disconnect();
    b.socket.disconnect();
  });
});

describe('formatResponse — dữ liệu thiếu trường', () => {
  it('meToJson(null) → null; userToJson thiếu friendsCount → 0', () => {
    expect(meToJson(null)).toBeNull();
    expect(userToJson({ _id: 'u', name: 'A' })).toMatchObject({ id: 'u', friendsCount: 0 });
    expect(meToJson({ _id: 'u', name: 'A' })?.blockedUserIds).toEqual([]);
  });

  it('postToJson thiếu mọi mảng → mặc định rỗng; reaction chưa populate vẫn có userId', () => {
    const json = postToJson({ _id: 'p', author: { _id: 'u' }, content: 'x' });
    expect(json).toMatchObject({ reactions: [], taggedUsers: [], commentsCount: 0, sharesCount: 0, isSaved: false });
    const withReaction = postToJson({ _id: 'p', author: { _id: 'u' }, reactions: [{ type: 'like', userId: 'u2' }], wallOwner: { _id: 'w', name: 'Chủ tường' } });
    expect(withReaction.reactions[0]).toEqual({ type: 'like', userId: 'u2', userName: undefined });
    expect(withReaction).toMatchObject({ wallOwnerId: 'w', wallOwnerName: 'Chủ tường' });
  });

  it('commentToJson thiếu mảng; có parent', () => {
    expect(commentToJson({ _id: 'c', post: 'p', author: { _id: 'u' } })).toMatchObject({ likes: [], taggedUsers: [], parentId: undefined });
    expect(commentToJson({ _id: 'c', post: 'p', author: { _id: 'u' }, parent: 'c0' }).parentId).toBe('c0');
  });

  it('storyToJson: privacy mặc định public; không có viewers', () => {
    expect(storyToJson({ _id: 's', user: { _id: 'u' }, type: 'text' })).toMatchObject({ privacy: 'public', viewers: [] });
    expect(storyToJson({ _id: 's', user: { _id: 'u' }, viewers: [{ user: { _id: 'v', name: 'V', avatar: 'a' }, viewedAt: 'x' }] }).viewers[0]).toMatchObject({ userId: 'v', userName: 'V' });
  });

  it('conversationToJson: thiếu participants / nicknames; có nicknames kiểu Map', () => {
    expect(conversationToJson({ _id: 'c' })).toMatchObject({ participants: [], nicknames: {}, unreadCount: 0, lastMessage: undefined });
    expect(conversationToJson({ _id: 'c', nicknames: new Map([['u', 'bí danh']]) }).nicknames).toEqual({ u: 'bí danh' });
  });

  it('messageToJson: thiếu readBy; có sharedPostId; reactions rỗng → undefined', () => {
    const json = messageToJson({ _id: 'm', conversation: 'c', sender: { _id: 's' }, sharedPostId: 'p1', reactions: new Map() }, ['s', 'r']);
    expect(json).toMatchObject({ sharedPostId: 'p1', isRead: false, reactions: undefined, kind: 'text', isRecalled: false });
  });

  it('friendRequestToJson / notificationToJson', () => {
    expect(friendRequestToJson({ _id: 'r', sender: { _id: 's' }, receiver: 'rc' })).toMatchObject({ receiverId: 'rc', receiver: undefined });
    expect(friendRequestToJson({ _id: 'r', sender: { _id: 's' }, receiver: { _id: 'rc', name: 'Rc' } }).receiver).toMatchObject({ id: 'rc' });
    expect(notificationToJson({ _id: 'n', user: 'u', actor: { _id: 'a' }, type: 'like', isRead: false })).toMatchObject({ userId: 'u', isRead: false });
  });
});

describe('Route — các trường hợp hiếm', () => {
  let app: express.Express;
  beforeAll(async () => {
    await connectTestDb();
    app = buildApp();
  });
  afterAll(disconnectTestDb);

  it('privacyRules: người dùng không tồn tại → không bị chặn ai; tự chặn mình / thiếu đối phương → false', async () => {
    expect([...(await getBlockedIds(bogusId))]).toEqual([]);
    expect(await isBlockedBetween('x', undefined)).toBe(false);
    expect(await isBlockedBetween('x', 'x')).toBe(false);
  });

  it('gợi ý kết bạn không truyền limit → mặc định 12', async () => {
    const me = await signUp(app);
    for (let i = 0; i < 14; i++) await signUp(app);
    expect((await as(app, me).get('/api/friends/suggestions')).body.users).toHaveLength(12);
  });

  it('lọc người dùng đang online', async () => {
    const me = await signUp(app, 'Online');
    const res = await as(app, me).get('/api/users?online=true');
    expect(res.body.users.every((u: { isOnline: boolean }) => u.isOnline)).toBe(true);
    expect(res.body.users.some((u: { id: string }) => u.id === me.id)).toBe(true); // vừa đăng ký = online
    await as(app, me).post('/api/auth/logout');
    const after = await as(app, me).get('/api/users?online=true');
    expect(after.body.users.some((u: { id: string }) => u.id === me.id)).toBe(false);
  });

  it('token hợp lệ nhưng người dùng đã bị xoá → 401', async () => {
    const res = await as(app, { token: createToken(bogusId) }).get('/api/users/me/blocked');
    expect(res.status).toBe(401);
  });

  it('ghim bài không tồn tại → 404', async () => {
    const me = await signUp(app);
    expect((await as(app, me).post(`/api/posts/${bogusId}/pin`)).status).toBe(404);
  });

  it('bài viết rỗng hoàn toàn bị từ chối; chỉ có ảnh hoặc chỉ có video thì được', async () => {
    const me = await signUp(app);
    expect((await as(app, me).post('/api/posts').send({})).status).toBe(400);
    expect((await as(app, me).post('/api/posts').send({ content: '   ' })).status).toBe(400);
    expect((await as(app, me).post('/api/posts').send({ content: '', images: ['/a.png'] })).status).toBe(200);
    expect((await as(app, me).post('/api/posts').send({ content: '', video: '/v.mp4' })).status).toBe(200);
    expect((await createPost(app, me, { content: 'x' })).id).toBeTruthy();
  });

  it('biệt danh cho chính mình / cho người không tồn tại → tin nhắn hệ thống phù hợp', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = (await as(app, a).post('/api/messages/conversations').send({ participantId: b.id })).body.conversation.id;
    const self = await as(app, a).patch(`/api/messages/conversations/${conv}/nickname`).send({ userId: a.id, nickname: 'Tôi' });
    expect(self.body.systemMessage.content).toContain('của mình');
    const ghost = await as(app, a).patch(`/api/messages/conversations/${conv}/nickname`).send({ userId: bogusId, nickname: 'Ma' });
    expect(ghost.body.systemMessage.content).toContain('thành viên');
    const removed = await as(app, a).patch(`/api/messages/conversations/${conv}/nickname`).send({ userId: b.id });
    expect(removed.body.systemMessage.content).toContain('xóa biệt danh');
  });

  it('thả cảm xúc tin nhắn không kèm emoji → gỡ cảm xúc của mình', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = (await as(app, a).post('/api/messages/conversations').send({ participantId: b.id })).body.conversation.id;
    const msg = (await as(app, a).post(`/api/messages/conversations/${conv}/messages`).send({ content: 'x' })).body.message;
    const url = `/api/messages/conversations/${conv}/messages/${msg.id}/react`;
    await as(app, b).post(url).send({ emoji: '👍' });
    const res = await as(app, b).post(url).send({});
    expect(res.body.message.reactions).toBeUndefined();
  });
});

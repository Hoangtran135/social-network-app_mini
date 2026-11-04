import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, bogusId } from './helpers';

// Test bạn bè: gửi / chấp nhận / từ chối / huỷ lời mời, huỷ kết bạn, gợi ý, danh sách, thông báo kèm theo.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe('Gửi lời mời kết bạn', () => {
  it('gửi thành công → người nhận thấy trong "lời mời đã nhận", người gửi thấy trong "đã gửi"', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const res = await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
    expect(res.status).toBe(200);
    expect(res.body.request.sender.id).toBe(a.id);

    const received = await as(app, b).get('/api/friends/requests');
    expect(received.body.requests).toHaveLength(1);
    expect(received.body.requests[0].sender.id).toBe(a.id);
    const sent = await as(app, a).get('/api/friends/requests/sent');
    expect(sent.body.requests).toHaveLength(1);
    expect(sent.body.requests[0].receiverId).toBe(b.id);
  });

  it('người nhận được thông báo "friend_request" trỏ tới trang cá nhân người gửi', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
    const notifs = await as(app, b).get('/api/notifications');
    expect(notifs.body.notifications[0]).toMatchObject({ type: 'friend_request', targetType: 'profile', targetId: a.id, isRead: false });
    expect(notifs.body.notifications[0].actor.id).toBe(a.id);
  });

  it('gửi lại lần 2 → 409, không tạo lời mời trùng', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
    expect((await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id })).status).toBe(409);
    expect((await as(app, b).get('/api/friends/requests')).body.requests).toHaveLength(1);
  });

  it('không thể gửi cho chính mình → 400', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post('/api/friends/requests').send({ targetUserId: a.id })).status).toBe(400);
  });

  it('gửi cho người không tồn tại → 404', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post('/api/friends/requests').send({ targetUserId: bogusId })).status).toBe(404);
  });

  it('id sai định dạng / thiếu id → 400', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post('/api/friends/requests').send({ targetUserId: 'abc' })).status).toBe(400);
    expect((await as(app, a).post('/api/friends/requests').send({})).status).toBe(400);
  });

  it('đã là bạn bè thì không gửi lời mời nữa → 409', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await befriend(app, a, b);
    expect((await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id })).status).toBe(409);
    expect((await as(app, b).post('/api/friends/requests').send({ targetUserId: a.id })).status).toBe(409);
  });

  it('người kia đã gửi lời mời cho mình rồi thì không tạo thêm lời mời ngược chiều → 409', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
    expect((await as(app, b).post('/api/friends/requests').send({ targetUserId: a.id })).status).toBe(409);
  });
});

describe('Chấp nhận / từ chối / huỷ', () => {
  it('chấp nhận → thành bạn bè 2 chiều, lời mời biến mất, người gửi nhận thông báo friend_accept', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const sent = await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
    const res = await as(app, b).post(`/api/friends/requests/${sent.body.request.id}/accept`);
    expect(res.status).toBe(200);
    expect(ids((await as(app, a).get('/api/friends')).body.friends)).toEqual([b.id]);
    expect(ids((await as(app, b).get('/api/friends')).body.friends)).toEqual([a.id]);
    expect((await as(app, b).get('/api/friends/requests')).body.requests).toEqual([]);
    expect((await as(app, a).get('/api/friends/requests/sent')).body.requests).toEqual([]);
    const notifs = await as(app, a).get('/api/notifications');
    expect(notifs.body.notifications.some((n: { type: string }) => n.type === 'friend_accept')).toBe(true);
  });

  it('chấp nhận lời mời 2 lần → lần 2 là 404, không tạo quan hệ bạn bè trùng', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const sent = await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
    await as(app, b).post(`/api/friends/requests/${sent.body.request.id}/accept`);
    expect((await as(app, b).post(`/api/friends/requests/${sent.body.request.id}/accept`)).status).toBe(404);
    expect((await as(app, a).get('/api/friends')).body.friends).toHaveLength(1);
  });

  it('chỉ người NHẬN mới được chấp nhận / từ chối (người gửi và người thứ ba → 404)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    const sent = await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
    const id = sent.body.request.id;
    expect((await as(app, a).post(`/api/friends/requests/${id}/accept`)).status).toBe(404);
    expect((await as(app, c).post(`/api/friends/requests/${id}/accept`)).status).toBe(404);
    expect((await as(app, c).post(`/api/friends/requests/${id}/reject`)).status).toBe(404);
    expect((await as(app, a).get('/api/friends')).body.friends).toEqual([]);
  });

  it('từ chối → không thành bạn, lời mời mất, có thể gửi lại sau đó', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const sent = await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
    expect((await as(app, b).post(`/api/friends/requests/${sent.body.request.id}/reject`)).status).toBe(200);
    expect((await as(app, a).get('/api/friends')).body.friends).toEqual([]);
    expect((await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id })).status).toBe(200);
  });

  it('người gửi huỷ lời mời → mất; người nhận không huỷ được lời mời của người khác', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const sent = await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
    const id = sent.body.request.id;
    expect((await as(app, b).delete(`/api/friends/requests/${id}`)).status).toBe(404);
    expect((await as(app, a).delete(`/api/friends/requests/${id}`)).status).toBe(200);
    expect((await as(app, b).get('/api/friends/requests')).body.requests).toEqual([]);
  });

  it('lời mời không tồn tại / id sai định dạng', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post(`/api/friends/requests/${bogusId}/accept`)).status).toBe(404);
    expect((await as(app, a).post('/api/friends/requests/abc/accept')).status).toBe(400);
  });
});

describe('Huỷ kết bạn & danh sách', () => {
  it('huỷ kết bạn → cả hai không còn là bạn; huỷ lần nữa vẫn ok', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await befriend(app, a, b);
    expect((await as(app, a).delete(`/api/friends/${b.id}`)).status).toBe(200);
    expect((await as(app, a).get('/api/friends')).body.friends).toEqual([]);
    expect((await as(app, b).get('/api/friends')).body.friends).toEqual([]);
    expect((await as(app, a).delete(`/api/friends/${b.id}`)).status).toBe(200);
  });

  it('sau khi huỷ kết bạn có thể kết bạn lại', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await befriend(app, a, b);
    await as(app, a).delete(`/api/friends/${b.id}`);
    await befriend(app, b, a);
    expect(ids((await as(app, a).get('/api/friends')).body.friends)).toEqual([b.id]);
  });

  it('xem bạn bè của người khác', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    await befriend(app, b, c);
    const res = await as(app, a).get(`/api/friends/of/${b.id}`);
    expect(ids(res.body.friends)).toEqual([c.id]);
  });

  it('xem bạn bè với id sai định dạng → 400', async () => {
    const a = await signUp(app);
    expect((await as(app, a).get('/api/friends/of/abc')).status).toBe(400);
  });

  it('mỗi người có nhiều bạn: danh sách đủ và không lẫn người khác', async () => {
    const a = await signUp(app);
    const friends = [await signUp(app), await signUp(app), await signUp(app)];
    const stranger = await signUp(app);
    for (const f of friends) await befriend(app, a, f);
    const list = ids((await as(app, a).get('/api/friends')).body.friends);
    expect(list.sort()).toEqual(friends.map((f) => f.id).sort());
    expect(list).not.toContain(stranger.id);
  });
});

describe('Gợi ý kết bạn', () => {
  it('không gợi ý chính mình, bạn bè, người đang có lời mời (cả 2 chiều) và người bị chặn', async () => {
    const me = await signUp(app, 'Me');
    const friend = await signUp(app);
    const invited = await signUp(app);
    const inviter = await signUp(app);
    const blocked = await signUp(app);
    const stranger = await signUp(app);
    await befriend(app, me, friend);
    await as(app, me).post('/api/friends/requests').send({ targetUserId: invited.id });
    await as(app, inviter).post('/api/friends/requests').send({ targetUserId: me.id });
    await as(app, me).post(`/api/users/${blocked.id}/block`);

    const res = await as(app, me).get('/api/friends/suggestions?limit=30');
    const list = ids(res.body.users);
    expect(list).toContain(stranger.id);
    for (const excluded of [me, friend, invited, inviter, blocked]) expect(list).not.toContain(excluded.id);
  });

  it('limit được giới hạn tối đa 30', async () => {
    const me = await signUp(app);
    const res = await as(app, me).get('/api/friends/suggestions?limit=500');
    expect(res.body.users.length).toBeLessThanOrEqual(30);
  });
});

describe('Yêu cầu đăng nhập', () => {
  it('mọi API bạn bè trả 401 khi chưa đăng nhập', async () => {
    const { default: request } = await import('supertest');
    for (const [method, url] of [['get', '/api/friends'], ['get', '/api/friends/requests'], ['get', '/api/friends/suggestions'], ['post', '/api/friends/requests']] as const) {
      expect((await request(app)[method](url)).status, `${method} ${url}`).toBe(401);
    }
  });
});

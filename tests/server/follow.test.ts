import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, bogusId } from './helpers';

// Theo dõi (follow) một chiều, không cần kết bạn.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const stats = async (viewer: { token: string }, id: string) => (await as(app, viewer).get(`/api/users/${id}/follow-stats`)).body;

describe('Theo dõi / bỏ theo dõi', () => {
  it('theo dõi người lạ (chưa kết bạn) → thành công, đếm đúng 2 chiều', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const res = await as(app, a).post(`/api/users/${b.id}/follow`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, isFollowing: true, followersCount: 1 });
    expect(await stats(a, b.id)).toEqual({ followersCount: 1, followingCount: 0, isFollowing: true });
    expect(await stats(a, a.id)).toEqual({ followersCount: 0, followingCount: 1, isFollowing: false });
    expect(await stats(b, b.id)).toMatchObject({ followersCount: 1, isFollowing: false });
  });

  it('theo dõi là MỘT chiều: b không tự động theo dõi a, và không thành bạn bè', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/follow`);
    expect((await stats(b, a.id)).isFollowing).toBe(false);
    expect((await as(app, a).get('/api/friends')).body.friends).toEqual([]);
  });

  it('theo dõi lại nhiều lần → không trùng, chỉ 1 thông báo', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    for (let i = 0; i < 3; i++) expect((await as(app, a).post(`/api/users/${b.id}/follow`)).status).toBe(200);
    expect((await stats(a, b.id)).followersCount).toBe(1);
    const notifs = (await as(app, b).get('/api/notifications')).body.notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ type: 'system', targetType: 'profile', targetId: a.id });
    expect(notifs[0].content).toContain('theo dõi');
  });

  it('theo dõi song song 6 lần → vẫn chỉ 1 bản ghi và 1 thông báo', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const results = await Promise.all(Array.from({ length: 6 }, () => as(app, a).post(`/api/users/${b.id}/follow`)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await stats(a, b.id)).followersCount).toBe(1);
    expect((await as(app, b).get('/api/notifications')).body.notifications).toHaveLength(1);
  });

  it('bỏ theo dõi → số đếm giảm; bỏ khi chưa theo dõi không lỗi', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/follow`);
    const res = await as(app, a).delete(`/api/users/${b.id}/follow`);
    expect(res.body).toEqual({ ok: true, isFollowing: false, followersCount: 0 });
    expect((await as(app, a).delete(`/api/users/${b.id}/follow`)).status).toBe(200);
    expect((await stats(a, b.id)).isFollowing).toBe(false);
  });

  it('nhiều người cùng theo dõi một người', async () => {
    const star = await signUp(app);
    const fans = await Promise.all(Array.from({ length: 5 }, () => signUp(app)));
    await Promise.all(fans.map((f) => as(app, f).post(`/api/users/${star.id}/follow`)));
    expect((await stats(star, star.id)).followersCount).toBe(5);
  });

  it('không tự theo dõi mình → 400; không tồn tại → 404; id sai → 400; chưa đăng nhập → 401', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post(`/api/users/${a.id}/follow`)).status).toBe(400);
    expect((await as(app, a).post(`/api/users/${bogusId}/follow`)).status).toBe(404);
    expect((await as(app, a).post('/api/users/abc/follow')).status).toBe(400);
    const { default: request } = await import('supertest');
    expect((await request(app).post(`/api/users/${a.id}/follow`)).status).toBe(401);
    expect((await request(app).get('/api/users/me/following')).status).toBe(401);
  });

  it('có quan hệ chặn (cả hai chiều) → không theo dõi được → 403', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/block`);
    await as(app, c).post(`/api/users/${a.id}/block`);
    expect((await as(app, a).post(`/api/users/${b.id}/follow`)).status).toBe(403);
    expect((await as(app, a).post(`/api/users/${c.id}/follow`)).status).toBe(403);
  });

  it('chặn người đang theo dõi (hoặc đang bị theo dõi) → huỷ theo dõi cả hai chiều', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/follow`);
    await as(app, b).post(`/api/users/${a.id}/follow`);
    await as(app, a).post(`/api/users/${b.id}/block`);
    await as(app, a).delete(`/api/users/${b.id}/block`);
    expect((await stats(a, b.id)).followersCount).toBe(0);
    expect((await stats(a, a.id)).followersCount).toBe(0);
    expect((await as(app, a).get('/api/users/me/following')).body.users).toEqual([]);
  });
});

describe('Danh sách đang theo dõi', () => {
  it('trả về người mình theo dõi, mới nhất trước; không lộ mật khẩu', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/follow`);
    await new Promise((r) => setTimeout(r, 15));
    await as(app, a).post(`/api/users/${c.id}/follow`);
    const res = await as(app, a).get('/api/users/me/following');
    expect(res.body.users.map((u: { id: string }) => u.id)).toEqual([c.id, b.id]);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  it('người theo dõi KHÔNG xuất hiện trong danh sách "đang theo dõi" của người kia', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/follow`);
    expect((await as(app, b).get('/api/users/me/following')).body.users).toEqual([]);
  });

  it('ẩn người có quan hệ chặn khỏi danh sách', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/follow`);
    await as(app, b).post(`/api/users/${a.id}/block`); // b chặn a: xoá follow, nhưng dữ liệu follow mới thêm sau đó cũng bị từ chối
    expect((await as(app, a).get('/api/users/me/following')).body.users).toEqual([]);
  });

  it('bạn bè và theo dõi độc lập nhau', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await befriend(app, a, b);
    expect((await as(app, a).get('/api/users/me/following')).body.users).toEqual([]);
    await as(app, a).post(`/api/users/${b.id}/follow`);
    await as(app, a).delete(`/api/friends/${b.id}`);
    expect((await as(app, a).get('/api/users/me/following')).body.users).toHaveLength(1);
  });
});

describe('follow-stats', () => {
  it('người không tồn tại / bị chặn → 404; id sai → 400', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    expect((await as(app, a).get(`/api/users/${bogusId}/follow-stats`)).status).toBe(404);
    expect((await as(app, a).get('/api/users/abc/follow-stats')).status).toBe(400);
    await as(app, a).post(`/api/users/${b.id}/block`);
    expect((await as(app, a).get(`/api/users/${b.id}/follow-stats`)).status).toBe(404);
  });

  it('người mới chưa có ai theo dõi', async () => {
    const a = await signUp(app);
    expect(await stats(a, a.id)).toEqual({ followersCount: 0, followingCount: 0, isFollowing: false });
  });
});

describe('Kết bạn tự động theo dõi', () => {
  it('chấp nhận lời mời → hai người theo dõi nhau (đếm người theo dõi / đang theo dõi đúng)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await befriend(app, a, b);
    expect(await stats(a, b.id)).toEqual({ followersCount: 1, followingCount: 1, isFollowing: true });
    expect(await stats(b, a.id)).toEqual({ followersCount: 1, followingCount: 1, isFollowing: true });
    const following = (await as(app, a).get('/api/users/me/following')).body.users as { id: string }[];
    expect(following.map((u) => u.id)).toEqual([b.id]);
  });

  it('đã theo dõi từ trước → kết bạn không tạo theo dõi trùng', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/follow`);
    await befriend(app, a, b);
    expect(await stats(a, b.id)).toMatchObject({ followersCount: 1, isFollowing: true });
    expect(await stats(b, a.id)).toMatchObject({ followersCount: 1, isFollowing: true });
  });

  it('huỷ kết bạn → vẫn còn theo dõi (bỏ theo dõi là việc riêng); bỏ theo dõi xong vẫn là bạn bè', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await befriend(app, a, b);
    await as(app, a).delete(`/api/users/${b.id}/follow`);
    expect((await stats(a, b.id)).isFollowing).toBe(false);
    expect(((await as(app, a).get('/api/friends')).body.friends as unknown[]).length).toBe(1);
    await as(app, a).delete(`/api/friends/${b.id}`);
    expect((await stats(b, a.id)).isFollowing).toBe(true);
  });
});

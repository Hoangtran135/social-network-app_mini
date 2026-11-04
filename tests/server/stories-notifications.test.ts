import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { StoryModel } from '../../server/models/Story';
import { NotificationModel } from '../../server/models/Notification';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, createPost, bogusId, TestUser } from './helpers';

// Test story (tin 24 giờ) và thông báo.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const storyIds = async (viewer: TestUser) => ((await as(app, viewer).get('/api/stories')).body.stories as { id: string }[]).map((s) => s.id);
const textStory = async (user: TestUser, data: Record<string, unknown> = {}) =>
  (await as(app, user).post('/api/stories').send({ type: 'text', textContent: 'Hôm nay vui', backgroundGradient: 'from-a to-b', ...data })).body.story as { id: string; [k: string]: unknown };

describe('Story', () => {
  it('đăng story chữ: hết hạn sau ~24 giờ, mặc định công khai', async () => {
    const a = await signUp(app);
    const story = await textStory(a);
    expect(story).toMatchObject({ type: 'text', textContent: 'Hôm nay vui', privacy: 'public', viewers: [] });
    const ms = new Date(story.expiresAt as string).getTime() - Date.now();
    expect(ms).toBeGreaterThan(23.9 * 3600 * 1000);
    expect(ms).toBeLessThanOrEqual(24 * 3600 * 1000);
  });

  it('đăng story ảnh', async () => {
    const a = await signUp(app);
    const res = await as(app, a).post('/api/stories').send({ type: 'image', mediaUrl: '/uploads/a.png' });
    expect(res.status).toBe(200);
    expect(res.body.story.mediaUrl).toBe('/uploads/a.png');
  });

  it.each([
    ['loại không hợp lệ', { type: 'video' }],
    ['quyền riêng tư không hợp lệ', { type: 'text', privacy: 'only_me' }],
    ['chữ quá 500 ký tự', { type: 'text', textContent: 'x'.repeat(501) }],
  ])('từ chối: %s → 400', async (_l, body) => {
    const a = await signUp(app);
    expect((await as(app, a).post('/api/stories').send(body)).status).toBe(400);
  });

  it('story hết hạn không hiện', async () => {
    const a = await signUp(app);
    const story = await textStory(a);
    await StoryModel.updateOne({ _id: story.id }, { expiresAt: new Date(Date.now() - 1000) });
    expect(await storyIds(a)).not.toContain(story.id);
  });

  it('story "bạn bè": bạn thấy, người lạ không thấy', async () => {
    const a = await signUp(app);
    const friend = await signUp(app);
    const stranger = await signUp(app);
    await befriend(app, a, friend);
    const story = await textStory(a, { privacy: 'friends' });
    expect(await storyIds(friend)).toContain(story.id);
    expect(await storyIds(stranger)).not.toContain(story.id);
    expect((await as(app, stranger).post(`/api/stories/${story.id}/view`)).status).toBe(404);
  });

  it('story bị chặn thì ẩn', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const story = await textStory(b);
    await as(app, a).post(`/api/users/${b.id}/block`);
    expect(await storyIds(a)).not.toContain(story.id);
  });

  it('xem story → ghi nhận người xem 1 lần duy nhất dù xem nhiều lần', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const story = await textStory(a);
    await as(app, b).post(`/api/stories/${story.id}/view`);
    await as(app, b).post(`/api/stories/${story.id}/view`);
    const res = await as(app, b).post(`/api/stories/${story.id}/view`);
    expect(res.body.story.viewers).toHaveLength(1);
    expect(res.body.story.viewers[0]).toMatchObject({ userId: b.id, userName: b.name });
  });

  it('nhiều người xem đồng thời đều được ghi nhận, không trùng', async () => {
    const a = await signUp(app);
    const viewers = [await signUp(app), await signUp(app), await signUp(app)];
    const story = await textStory(a);
    await Promise.all([...viewers, ...viewers].map((v) => as(app, v).post(`/api/stories/${story.id}/view`)));
    const fresh = (await as(app, a).get('/api/stories')).body.stories.find((s: { id: string }) => s.id === story.id);
    expect(fresh.viewers).toHaveLength(3);
  });

  it('chủ story xem tin của chính mình KHÔNG bị tính là người xem', async () => {
    const a = await signUp(app);
    const story = await textStory(a);
    const res = await as(app, a).post(`/api/stories/${story.id}/view`);
    expect(res.status).toBe(200);
    expect(res.body.story.viewers).toEqual([]);
  });

  it('xem story không tồn tại → 404', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post(`/api/stories/${bogusId}/view`)).status).toBe(404);
  });

  it('xoá story: chỉ chủ story; người khác → 403', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const story = await textStory(a);
    expect((await as(app, b).delete(`/api/stories/${story.id}`)).status).toBe(403);
    expect((await as(app, a).delete(`/api/stories/${story.id}`)).status).toBe(200);
    expect(await storyIds(a)).not.toContain(story.id);
    expect((await as(app, a).delete(`/api/stories/${story.id}`)).status).toBe(404);
  });

  it('mới nhất xếp trước; chưa đăng nhập → 401', async () => {
    const a = await signUp(app);
    const s1 = await textStory(a, { textContent: 'cũ' });
    const s2 = await textStory(a, { textContent: 'mới' });
    const ids = await storyIds(a);
    expect(ids.indexOf(s2.id)).toBeLessThan(ids.indexOf(s1.id));
    expect((await request(app).get('/api/stories')).status).toBe(401);
  });
});

describe('Thông báo', () => {
  it('chỉ thấy thông báo của chính mình', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'like' });
    expect((await as(app, a).get('/api/notifications')).body.notifications).toHaveLength(1);
    expect((await as(app, b).get('/api/notifications')).body.notifications).toHaveLength(0);
  });

  it('mới nhất trước, có actor, mặc định chưa đọc', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    const post = await createPost(app, a);
    await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'like' });
    await new Promise((r) => setTimeout(r, 15));
    await as(app, c).post(`/api/posts/${post.id}/react`).send({ type: 'love' });
    const list = (await as(app, a).get('/api/notifications')).body.notifications;
    expect(list.map((n: { actor: { id: string } }) => n.actor.id)).toEqual([c.id, b.id]);
    expect(list.every((n: { isRead: boolean }) => n.isRead === false)).toBe(true);
  });

  it('đánh dấu 1 thông báo đã đọc: chỉ thông báo đó', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'like' });
    await as(app, b).post('/api/comments').send({ postId: post.id, content: 'hay' });
    const [first, second] = (await as(app, a).get('/api/notifications')).body.notifications;
    expect((await as(app, a).patch(`/api/notifications/${first.id}/read`)).status).toBe(200);
    const after = (await as(app, a).get('/api/notifications')).body.notifications;
    expect(after.find((n: { id: string }) => n.id === first.id).isRead).toBe(true);
    expect(after.find((n: { id: string }) => n.id === second.id).isRead).toBe(false);
  });

  it('không đánh dấu đã đọc được thông báo của người khác', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'like' });
    const [n] = (await as(app, a).get('/api/notifications')).body.notifications;
    await as(app, b).patch(`/api/notifications/${n.id}/read`);
    expect((await as(app, a).get('/api/notifications')).body.notifications[0].isRead).toBe(false);
  });

  it('đánh dấu tất cả đã đọc: chỉ của mình', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'like' });
    const bPost = await createPost(app, b);
    await as(app, a).post(`/api/posts/${bPost.id}/react`).send({ type: 'like' });
    await as(app, a).patch('/api/notifications/read-all');
    expect((await as(app, a).get('/api/notifications')).body.notifications.every((n: { isRead: boolean }) => n.isRead)).toBe(true);
    expect((await as(app, b).get('/api/notifications')).body.notifications.every((n: { isRead: boolean }) => !n.isRead)).toBe(true);
  });

  it('phân trang limit / skip; tham số rác không gây lỗi', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    for (let i = 0; i < 5; i++) await NotificationModel.create({ user: a.id, actor: b.id, type: 'system', content: `n${i}` });
    expect((await as(app, a).get('/api/notifications?limit=2')).body.notifications).toHaveLength(2);
    expect((await as(app, a).get('/api/notifications?limit=2&skip=4')).body.notifications).toHaveLength(1);
    for (const q of ['?limit=-1', '?skip=-1', '?limit=abc', '?limit=99999']) expect((await as(app, a).get(`/api/notifications${q}`)).status, q).toBe(200);
  });

  it('id thông báo sai định dạng → 400; chưa đăng nhập → 401', async () => {
    const a = await signUp(app);
    expect((await as(app, a).patch('/api/notifications/abc/read')).status).toBe(400);
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });
});

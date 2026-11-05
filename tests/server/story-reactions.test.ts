import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, bogusId, TestUser } from './helpers';

// Cảm xúc nhanh cho story (❤️ 🔥 👏 😮 😂) và danh sách người đã xem kèm cảm xúc.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const EMOJIS = ['❤️', '🔥', '👏', '😮', '😂'];
const story = async (u: TestUser, privacy: 'public' | 'friends' = 'public') =>
  (await as(app, u).post('/api/stories').send({ type: 'text', textContent: 'hi', privacy })).body.story as { id: string };
const react = (u: TestUser, id: string, emoji: unknown) => as(app, u).post(`/api/stories/${id}/react`).send({ emoji });

describe('Thả cảm xúc story', () => {
  it.each(EMOJIS)('thả %s → có trong reactions kèm tên + ảnh', async (emoji) => {
    const a = await signUp(app);
    const b = await signUp(app);
    const s = await story(a);
    const res = await react(b, s.id, emoji);
    expect(res.status).toBe(200);
    expect(res.body.story.reactions).toEqual([{ userId: b.id, userName: b.name, avatar: expect.any(String), emoji }]);
  });

  it('story mới chưa có cảm xúc', async () => {
    const a = await signUp(app);
    expect((await story(a)) as { reactions?: unknown[] }).toBeTruthy();
    const list = (await as(app, a).get('/api/stories')).body.stories[0];
    expect(list.reactions).toEqual([]);
  });

  it('cùng emoji → bỏ; khác emoji → đổi (mỗi người một cảm xúc)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const s = await story(a);
    await react(b, s.id, '❤️');
    expect((await react(b, s.id, '🔥')).body.story.reactions.map((r: { emoji: string }) => r.emoji)).toEqual(['🔥']);
    expect((await react(b, s.id, '🔥')).body.story.reactions).toEqual([]);
  });

  it('nhiều người, mỗi người một cảm xúc riêng', async () => {
    const a = await signUp(app);
    const users = await Promise.all(EMOJIS.map(() => signUp(app)));
    const s = await story(a);
    await Promise.all(users.map((u, i) => react(u, s.id, EMOJIS[i])));
    const reactions = (await as(app, a).get('/api/stories')).body.stories.find((x: { id: string }) => x.id === s.id).reactions;
    expect(reactions).toHaveLength(5);
    expect(new Set(reactions.map((r: { userId: string }) => r.userId)).size).toBe(5);
  });

  it('chủ story nhận thông báo lần đầu; đổi / bỏ cảm xúc không sinh thông báo mới', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const s = await story(a);
    await react(b, s.id, '❤️');
    await react(b, s.id, '🔥');
    await react(b, s.id, '🔥');
    const notifs = (await as(app, a).get('/api/notifications')).body.notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ type: 'like', targetType: 'profile', targetId: b.id });
    expect(notifs[0].content).toContain('❤️');
  });

  it('chủ story không tự thả cảm xúc lên story của mình → 400', async () => {
    const a = await signUp(app);
    const s = await story(a);
    expect((await react(a, s.id, '❤️')).status).toBe(400);
  });

  it('emoji ngoài danh sách / thiếu / sai kiểu → 400', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const s = await story(a);
    for (const emoji of ['👍', '', 'love', 5, null, ['❤️'], undefined]) expect((await react(b, s.id, emoji)).status, JSON.stringify(emoji)).toBe(400);
  });

  it('story bạn bè: bạn thả được, người lạ → 404', async () => {
    const a = await signUp(app);
    const friend = await signUp(app);
    const stranger = await signUp(app);
    await befriend(app, a, friend);
    const s = await story(a, 'friends');
    expect((await react(friend, s.id, '👏')).status).toBe(200);
    expect((await react(stranger, s.id, '👏')).status).toBe(404);
  });

  it('người bị chặn → 404; story không tồn tại → 404; id sai → 400; chưa đăng nhập → 401', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const s = await story(a);
    await as(app, a).post(`/api/users/${b.id}/block`);
    expect((await react(b, s.id, '❤️')).status).toBe(404);
    expect((await react(b, bogusId, '❤️')).status).toBe(404);
    expect((await react(b, 'abc', '❤️')).status).toBe(400);
    const { default: request } = await import('supertest');
    expect((await request(app).post(`/api/stories/${s.id}/react`).send({ emoji: '❤️' })).status).toBe(401);
  });

  it('lặp lại 8 lần: cùng một người bấm 5 emoji song song → luôn ≤ 1 cảm xúc của người đó', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    for (let round = 0; round < 8; round++) {
      const s = await story(a);
      await Promise.all([...EMOJIS, ...EMOJIS].map((e) => react(b, s.id, e)));
      const reactions = (await as(app, b).get('/api/stories')).body.stories.find((x: { id: string }) => x.id === s.id).reactions;
      expect(reactions.length, `vòng ${round}`).toBeLessThanOrEqual(1);
    }
  });

  it('story hiện cảm xúc cùng danh sách người xem; xem story giữ nguyên cảm xúc', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const s = await story(a);
    await react(b, s.id, '😮');
    const viewed = await as(app, b).post(`/api/stories/${s.id}/view`);
    expect(viewed.body.story.viewers).toHaveLength(1);
    expect(viewed.body.story.reactions).toHaveLength(1);
  });
});

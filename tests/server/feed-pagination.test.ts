import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, createPost } from './helpers';

// Hồi quy: bảng tin phải lọc quyền xem NGAY trong truy vấn. Trước đây server cắt `limit` bài rồi mới lọc quyền xem,
// nên khi nhiều bài riêng tư / bạn bè xen kẽ, trang trả về ÍT HƠN `limit` bài → giao diện tưởng đã hết bài và dừng cuộn vô hạn.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

describe('Phân trang bảng tin', () => {
  it('bài riêng tư / bạn bè xen kẽ không làm trang bị thiếu bài: mỗi trang đủ limit, không trùng, không sót', async () => {
    const author = await signUp(app);
    const viewer = await signUp(app);
    const publicIds: string[] = [];
    // 3 bài công khai xen với 6 bài người xem không được thấy (riêng tư + chỉ bạn bè) → ~2/3 bài bị lọc
    for (let i = 0; i < 6; i++) {
      await createPost(app, author, { content: `riêng tư ${i}`, privacy: 'only_me' });
      await createPost(app, author, { content: `bạn bè ${i}`, privacy: 'friends' });
      publicIds.push((await createPost(app, author, { content: `công khai ${i}` })).id);
    }
    const page = async (skip: number) => ((await as(app, viewer).get(`/api/posts?limit=3&skip=${skip}`)).body.posts as { id: string }[]).map((p) => p.id);

    const p1 = await page(0);
    expect(p1).toHaveLength(3); // trước khi sửa: chỉ 1 bài
    // Phân trang theo skip tính trên TẬP ĐÃ LỌC nên các trang nối tiếp nhau không trùng, không sót
    const seen = [...p1];
    for (let skip = 3; skip < 30; skip += 3) {
      const next = await page(skip);
      seen.push(...next);
      if (next.length < 3) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual([...publicIds].sort());
  });

  it('người xem là bạn bè thấy cả bài "bạn bè"; chính tác giả thấy hết; người bị chặn không thấy gì', async () => {
    const author = await signUp(app);
    const friend = await signUp(app);
    const stranger = await signUp(app);
    const blocked = await signUp(app);
    await befriend(app, author, friend);
    await as(app, author).post(`/api/users/${blocked.id}/block`);
    await createPost(app, author, { content: 'công khai' });
    await createPost(app, author, { content: 'bạn bè', privacy: 'friends' });
    await createPost(app, author, { content: 'riêng tư', privacy: 'only_me' });
    const contents = async (u: { token: string }) => ((await as(app, u).get('/api/posts?limit=50')).body.posts as { content: string; author: { id: string } }[]).filter((p) => p.author.id === author.id).map((p) => p.content).sort();
    expect(await contents(author)).toEqual(['bạn bè', 'công khai', 'riêng tư']);
    expect(await contents(friend)).toEqual(['bạn bè', 'công khai']);
    expect(await contents(stranger)).toEqual(['công khai']);
    expect(await contents(blocked)).toEqual([]);
  });

  it('bài mình đã ẩn không còn trong bảng tin nhưng không làm hụt trang', async () => {
    const author = await signUp(app);
    const viewer = await signUp(app);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await createPost(app, author, { content: `bài ${i}` })).id);
    await as(app, viewer).post(`/api/posts/${ids[4]}/hide`);
    const mine = ((await as(app, viewer).get('/api/posts?limit=4')).body.posts as { id: string; author: { id: string } }[]).filter((p) => p.author.id === author.id);
    expect(mine.map((p) => p.id)).not.toContain(ids[4]);
    expect(mine).toHaveLength(4);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, bogusId, createPost, TestUser } from './helpers';
import { PostModel } from '../../server/models/Post';
import { CommentModel } from '../../server/models/Comment';

// Reels (video ngắn): đăng, danh sách xếp theo độ phù hợp, quyền riêng tư, lượt xem, và việc reel KHÔNG lọt vào bảng tin / chia sẻ.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const api = (u: TestUser) => as(app, u);
const mkReel = async (u: TestUser, data: Record<string, unknown> = {}) => {
  const res = await api(u).post('/api/reels').send({ video: '/uploads/v.mp4', caption: 'Reel thử', ...data });
  if (res.status !== 200) throw new Error(`Đăng reel thất bại: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.reel as { id: string; [k: string]: unknown };
};
const reelIds = async (u: TestUser, q = '') => ((await api(u).get(`/api/reels${q}`)).body.reels as { id: string }[]).map((r) => r.id);

describe('Đăng reel', () => {
  it('đăng reel có video + chú thích → kind = reel, 0 lượt xem, hashtag được trích', async () => {
    const a = await signUp(app);
    const reel = await mkReel(a, { caption: 'Cuối tuần vui #reel #vlog', privacy: 'friends' });
    expect(reel).toMatchObject({ kind: 'reel', video: '/uploads/v.mp4', content: 'Cuối tuần vui #reel #vlog', privacy: 'friends', viewsCount: 0, hashtags: ['reel', 'vlog'], author: { id: a.id } });
  });

  it('thiếu video / video rỗng / chú thích quá dài / quyền riêng tư không hợp lệ → 400; chú thích có thể để trống', async () => {
    const a = await signUp(app);
    for (const body of [{}, { video: '' }, { video: '/v.mp4', caption: 'x'.repeat(301) }, { video: '/v.mp4', privacy: 'only_me' }]) {
      expect((await api(a).post('/api/reels').send(body)).status).toBe(400);
    }
    expect((await mkReel(a, { caption: '' })).content).toBe('');
  });

  it('chưa đăng nhập → 401', async () => {
    expect((await (await import('supertest')).default(app).get('/api/reels')).status).toBe(401);
  });
});

describe('Reel KHÔNG lọt ra ngoài mục Reels', () => {
  it('không có ở bảng tin, lọc hashtag, kỷ niệm; không chia sẻ lên trang cá nhân được', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const reel = await mkReel(a, { caption: 'Reel riêng #bimat' });
    const normal = await createPost(app, a, { content: 'Bài thường #bimat' });
    const feed = ((await api(b).get('/api/posts')).body.posts as { id: string }[]).map((p) => p.id);
    expect(feed).toContain(normal.id);
    expect(feed).not.toContain(reel.id);
    expect(((await api(b).get('/api/posts?tag=bimat')).body.posts as { id: string }[]).map((p) => p.id)).toEqual([normal.id]);
    expect((await api(a).get('/api/posts/memories')).body.posts).toEqual([]);
    const share = await api(b).post(`/api/posts/${reel.id}/share`).send({});
    expect(share.status).toBe(400);
    expect(share.body.error).toMatch(/Reel/);
  });

  it('thả cảm xúc, bình luận, ẩn dùng lại API bài viết', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const reel = await mkReel(a);
    expect((await api(b).post(`/api/posts/${reel.id}/react`).send({ type: 'love' })).body.post.reactions).toHaveLength(1);
    expect((await api(b).post('/api/comments').send({ postId: reel.id, content: 'đỉnh' })).status).toBe(200);
    expect((await api(b).get(`/api/posts/${reel.id}`)).body.post).toMatchObject({ kind: 'reel', commentsCount: 1 });
    expect((await api(b).post(`/api/posts/${reel.id}/hide`)).status).toBe(200);
    expect(await reelIds(b)).not.toContain(reel.id); // đã ẩn → không còn trong danh sách của b
    expect(await reelIds(a)).toContain(reel.id);
  });

  it('tác giả xoá reel bằng API bài viết (kèm bình luận)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const reel = await mkReel(a);
    await api(b).post('/api/comments').send({ postId: reel.id, content: 'hay' });
    expect((await api(a).delete(`/api/posts/${reel.id}`)).status).toBe(200);
    expect(await CommentModel.countDocuments({ post: reel.id })).toBe(0);
    expect(await reelIds(a)).not.toContain(reel.id);
  });
});

describe('Danh sách reel & quyền riêng tư', () => {
  it('reel công khai ai cũng thấy; reel "bạn bè" chỉ bạn bè (và chủ reel) thấy; người bị chặn không thấy', async () => {
    const author = await signUp(app);
    const friend = await signUp(app);
    const stranger = await signUp(app);
    const blocked = await signUp(app);
    await befriend(app, author, friend);
    const pub = await mkReel(author, { privacy: 'public' });
    const fr = await mkReel(author, { privacy: 'friends' });
    await api(author).post(`/api/users/${blocked.id}/block`);
    expect(await reelIds(friend)).toEqual(expect.arrayContaining([pub.id, fr.id]));
    expect(await reelIds(stranger)).toContain(pub.id);
    expect(await reelIds(stranger)).not.toContain(fr.id);
    expect(await reelIds(author)).toEqual(expect.arrayContaining([pub.id, fr.id]));
    expect(await reelIds(blocked)).not.toContain(pub.id);
  });

  it('xem một reel: đúng quyền → 200; riêng tư / sai id / không phải reel → 404', async () => {
    const author = await signUp(app);
    const stranger = await signUp(app);
    const fr = await mkReel(author, { privacy: 'friends' });
    const pub = await mkReel(author);
    const normal = await createPost(app, author);
    expect((await api(stranger).get(`/api/reels/${pub.id}`)).body.reel.id).toBe(pub.id);
    expect((await api(stranger).get(`/api/reels/${fr.id}`)).status).toBe(404);
    expect((await api(stranger).get(`/api/reels/${bogusId}`)).status).toBe(404);
    expect((await api(stranger).get(`/api/reels/${normal.id}`)).status).toBe(404);
    expect((await api(author).get(`/api/reels/${fr.id}`)).status).toBe(200);
  });

  it('xếp hạng: reel của BẠN BÈ lên trước reel người lạ dù người lạ đăng sau; người MÌNH THEO DÕI ở giữa', async () => {
    const me = await signUp(app);
    const friend = await signUp(app);
    const followed = await signUp(app);
    const stranger = await signUp(app);
    await befriend(app, me, friend);
    await api(me).post(`/api/users/${followed.id}/follow`);
    const rFriend = await mkReel(friend);
    const rFollowed = await mkReel(followed);
    const rStranger = await mkReel(stranger);
    const ids = await reelIds(me);
    expect(ids.indexOf(rFriend.id)).toBeLessThan(ids.indexOf(rFollowed.id));
    expect(ids.indexOf(rFollowed.id)).toBeLessThan(ids.indexOf(rStranger.id));
  });

  it('tương tác cao lên trước: reel nhiều cảm xúc + bình luận hơn reel mới hơn cùng nguồn', async () => {
    const me = await signUp(app);
    const author = await signUp(app);
    const fans = await Promise.all([1, 2, 3].map(() => signUp(app)));
    const popular = await mkReel(author, { caption: 'phổ biến' });
    const newer = await mkReel(author, { caption: 'mới hơn' });
    for (const f of fans) {
      await api(f).post(`/api/posts/${popular.id}/react`).send({ type: 'like' });
      await api(f).post('/api/comments').send({ postId: popular.id, content: 'xịn' });
    }
    const ids = await reelIds(me);
    expect(ids.indexOf(popular.id)).toBeLessThan(ids.indexOf(newer.id));
  });

  it('phân trang: limit / skip không trùng, không sót', async () => {
    const author = await signUp(app);
    const viewer = await signUp(app);
    const made = [await mkReel(author), await mkReel(author), await mkReel(author)];
    const all = (await reelIds(viewer, '?limit=100')).filter((id) => made.some((m) => m.id === id));
    expect(all).toHaveLength(3);
    const p1 = await reelIds(viewer, '?limit=2');
    const p2 = await reelIds(viewer, '?limit=2&skip=2');
    expect(p1).toHaveLength(2);
    expect(new Set([...p1, ...p2]).size).toBe(p1.length + p2.length);
  });
});

describe('Quy mô lớn (hồi quy: lọc quyền xem trong truy vấn)', () => {
  it('hơn 200 reel MỚI HƠN mà người xem không được thấy (bạn bè / của người bị chặn) không che mất reel công khai cũ hơn', async () => {
    const author = await signUp(app);
    const blocked = await signUp(app);
    const viewer = await signUp(app);
    const visible = await mkReel(author);
    await new Promise((r) => setTimeout(r, 20));
    const now = Date.now();
    await PostModel.insertMany(Array.from({ length: 150 }, (_, i) => ({ author: author.id, kind: 'reel', video: '/v.mp4', content: `ẩn ${i}`, privacy: 'friends', createdAt: new Date(now + i) })));
    await PostModel.insertMany(Array.from({ length: 150 }, (_, i) => ({ author: blocked.id, kind: 'reel', video: '/v.mp4', content: `chặn ${i}`, privacy: 'public', createdAt: new Date(now + 1000 + i) })));
    await api(viewer).post(`/api/users/${blocked.id}/block`);
    const ids = await reelIds(viewer, '?limit=200');
    expect(ids).toContain(visible.id); // trước khi sửa: 300 reel mới hơn (không xem được) chiếm hết 200 chỗ ứng viên → không còn reel nào
    const hidden = (await PostModel.find({ kind: 'reel', content: /^(ẩn|chặn) / }).select('_id')).map((p) => String(p._id));
    expect(ids.filter((id) => hidden.includes(id))).toEqual([]);
  });
});

describe('Lượt xem', () => {
  it('mỗi lần ghi nhận tăng 1, trả về tổng; hiện trong dữ liệu reel', async () => {
    const author = await signUp(app);
    const viewer = await signUp(app);
    const reel = await mkReel(author);
    expect((await api(viewer).post(`/api/reels/${reel.id}/view`)).body).toEqual({ viewsCount: 1 });
    expect((await api(viewer).post(`/api/reels/${reel.id}/view`)).body).toEqual({ viewsCount: 2 });
    expect((await api(viewer).get(`/api/reels/${reel.id}`)).body.reel.viewsCount).toBe(2);
  });

  it('nhiều người xem cùng lúc vẫn đếm đủ', async () => {
    const author = await signUp(app);
    const viewers = await Promise.all(Array.from({ length: 8 }, () => signUp(app)));
    const reel = await mkReel(author);
    await Promise.all(viewers.map((v) => api(v).post(`/api/reels/${reel.id}/view`)));
    expect((await api(author).get(`/api/reels/${reel.id}`)).body.reel.viewsCount).toBe(8);
  });

  it('không xem được reel thì không ghi nhận lượt xem (riêng tư / không tồn tại / không phải reel)', async () => {
    const author = await signUp(app);
    const stranger = await signUp(app);
    const fr = await mkReel(author, { privacy: 'friends' });
    const normal = await createPost(app, author);
    expect((await api(stranger).post(`/api/reels/${fr.id}/view`)).status).toBe(404);
    expect((await api(stranger).post(`/api/reels/${bogusId}/view`)).status).toBe(404);
    expect((await api(stranger).post(`/api/reels/${normal.id}/view`)).status).toBe(404);
  });
});

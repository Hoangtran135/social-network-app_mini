import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, createPost, bogusId, TestUser } from './helpers';

// Test bình luận: thêm, trả lời, xoá (tác giả / chủ bài), thích, đếm, quyền xem, thông báo.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const comment = async (user: TestUser, postId: string, data: Record<string, unknown> = {}) => {
  const res = await as(app, user).post('/api/comments').send({ postId, content: 'Bình luận thử', ...data });
  return res;
};
const countOf = async (user: TestUser, postId: string) => (await as(app, user).get(`/api/posts/${postId}`)).body.post.commentsCount as number;

describe('Thêm bình luận', () => {
  it('bình luận → có trong danh sách, tăng commentsCount', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const res = await comment(b, post.id, { content: 'Hay quá!' });
    expect(res.status).toBe(200);
    expect(res.body.comment).toMatchObject({ postId: post.id, content: 'Hay quá!', likes: [] });
    expect(res.body.comment.author.id).toBe(b.id);
    expect(await countOf(a, post.id)).toBe(1);
    const list = await as(app, a).get(`/api/comments?postId=${post.id}`);
    expect(list.body.comments).toHaveLength(1);
  });

  it('chủ bài nhận thông báo; tự bình luận bài mình thì không', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    await comment(a, post.id);
    expect((await as(app, a).get('/api/notifications')).body.notifications).toHaveLength(0);
    await comment(b, post.id, { content: 'Nội dung bình luận khá dài để kiểm tra việc cắt ngắn thông báo' });
    const notifs = (await as(app, a).get('/api/notifications')).body.notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ type: 'comment', targetId: post.id, targetType: 'post' });
  });

  it('bình luận chỉ có ảnh (không chữ) được chấp nhận; không chữ không ảnh → 400', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    expect((await comment(a, post.id, { content: '', image: '/uploads/x.png' })).status).toBe(200);
    expect((await comment(a, post.id, { content: '   ' })).status).toBe(400);
  });

  it('gắn thẻ: người được gắn nhận thông báo, tự gắn mình / trùng được lọc', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    const post = await createPost(app, a);
    const res = await comment(b, post.id, { taggedUserIds: [c.id, c.id, b.id] });
    expect(res.body.comment.taggedUsers.map((u: { id: string }) => u.id)).toEqual([c.id]);
    const notifsC = (await as(app, c).get('/api/notifications')).body.notifications;
    expect(notifsC.some((n: { content: string }) => n.content.includes('gắn thẻ'))).toBe(true);
  });

  it('bài không tồn tại → 404; postId sai định dạng → 400', async () => {
    const a = await signUp(app);
    expect((await comment(a, bogusId)).status).toBe(404);
    expect((await comment(a, 'abc')).status).toBe(400);
  });

  it('nội dung quá 3000 ký tự → 400', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    expect((await comment(a, post.id, { content: 'x'.repeat(3001) })).status).toBe(400);
  });

  it('chưa đăng nhập → 401', async () => {
    expect((await request(app).post('/api/comments').send({ postId: bogusId, content: 'x' })).status).toBe(401);
    expect((await request(app).get('/api/comments')).status).toBe(401);
  });

  it('bình luận đồng thời: commentsCount không bị mất cập nhật rõ rệt', async () => {
    const a = await signUp(app);
    const users = [await signUp(app), await signUp(app), await signUp(app), await signUp(app)];
    const post = await createPost(app, a);
    await Promise.all(users.map((u) => comment(u, post.id)));
    const list = (await as(app, a).get(`/api/comments?postId=${post.id}`)).body.comments;
    expect(list).toHaveLength(4);
    // Số đếm lưu sẵn phải khớp số bình luận thật
    expect(await countOf(a, post.id)).toBe(4);
  });
});

describe('Trả lời bình luận', () => {
  it('trả lời có parentId đúng', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const parent = (await comment(a, post.id, { content: 'gốc' })).body.comment;
    const reply = await comment(a, post.id, { content: 'trả lời', parentId: parent.id });
    expect(reply.status).toBe(200);
    expect(reply.body.comment.parentId).toBe(parent.id);
  });

  it('parentId thuộc BÀI KHÁC → 400', async () => {
    const a = await signUp(app);
    const post1 = await createPost(app, a);
    const post2 = await createPost(app, a);
    const parent = (await comment(a, post1.id)).body.comment;
    expect((await comment(a, post2.id, { parentId: parent.id })).status).toBe(400);
  });

  it('parentId không tồn tại → 400', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    expect((await comment(a, post.id, { parentId: bogusId })).status).toBe(400);
  });
});

describe('Quyền xem bình luận', () => {
  it('bài "chỉ mình tôi": người lạ không xem / không bình luận / không thích được', async () => {
    const a = await signUp(app);
    const stranger = await signUp(app);
    const post = await createPost(app, a, { privacy: 'only_me' });
    const c = (await comment(a, post.id)).body.comment;
    expect((await as(app, stranger).get(`/api/comments?postId=${post.id}`)).status).toBe(403);
    expect((await comment(stranger, post.id)).status).toBe(404);
    expect((await as(app, stranger).post(`/api/comments/${c.id}/like`)).status).toBe(403);
  });

  it('bài "bạn bè": bạn xem được, người lạ không', async () => {
    const a = await signUp(app);
    const friend = await signUp(app);
    const stranger = await signUp(app);
    await befriend(app, a, friend);
    const post = await createPost(app, a, { privacy: 'friends' });
    await comment(a, post.id);
    expect((await as(app, friend).get(`/api/comments?postId=${post.id}`)).status).toBe(200);
    expect((await as(app, stranger).get(`/api/comments?postId=${post.id}`)).status).toBe(403);
  });

  it('lấy bình luận của bài không tồn tại → danh sách rỗng', async () => {
    const a = await signUp(app);
    const res = await as(app, a).get(`/api/comments?postId=${bogusId}`);
    expect(res.body.comments).toEqual([]);
  });

  it('không có postId → 400 (không còn chế độ "tất cả bình luận" vì quá nặng)', async () => {
    const a = await signUp(app);
    const res = await as(app, a).get('/api/comments');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/postId/);
    expect((await as(app, a).get('/api/comments?postId[]=x')).status).toBe(400);
  });

  it('bình luận được sắp theo thời gian tăng dần', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    for (const content of ['một', 'hai', 'ba']) await comment(a, post.id, { content });
    const list = (await as(app, a).get(`/api/comments?postId=${post.id}`)).body.comments;
    expect(list.map((c: { content: string }) => c.content)).toEqual(['một', 'hai', 'ba']);
  });
});

describe('Xoá bình luận', () => {
  it('tác giả bình luận xoá được → giảm commentsCount', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const c = (await comment(b, post.id)).body.comment;
    expect((await as(app, b).delete(`/api/comments/${c.id}`)).status).toBe(200);
    expect(await countOf(a, post.id)).toBe(0);
  });

  it('chủ bài xoá bình luận của người khác → người bình luận nhận thông báo', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const c = (await comment(b, post.id)).body.comment;
    expect((await as(app, a).delete(`/api/comments/${c.id}`)).status).toBe(200);
    const notifs = (await as(app, b).get('/api/notifications')).body.notifications;
    expect(notifs.some((n: { content: string }) => n.content.includes('xóa bình luận'))).toBe(true);
  });

  it('người thứ ba xoá → 403, bình luận còn nguyên', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c3 = await signUp(app);
    const post = await createPost(app, a);
    const c = (await comment(b, post.id)).body.comment;
    expect((await as(app, c3).delete(`/api/comments/${c.id}`)).status).toBe(403);
    expect((await as(app, a).get(`/api/comments?postId=${post.id}`)).body.comments).toHaveLength(1);
  });

  it('xoá hai lần → lần 2 là 404 và commentsCount không âm', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const c = (await comment(a, post.id)).body.comment;
    await as(app, a).delete(`/api/comments/${c.id}`);
    expect((await as(app, a).delete(`/api/comments/${c.id}`)).status).toBe(404);
    expect(await countOf(a, post.id)).toBe(0);
  });

  it('xoá bình luận không tồn tại / id sai', async () => {
    const a = await signUp(app);
    expect((await as(app, a).delete(`/api/comments/${bogusId}`)).status).toBe(404);
    expect((await as(app, a).delete('/api/comments/abc')).status).toBe(400);
  });
});

describe('Thích bình luận', () => {
  it('thích → bỏ thích; mỗi người một lần dù bấm nhiều lần', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const c = (await comment(a, post.id)).body.comment;
    const like = await as(app, b).post(`/api/comments/${c.id}/like`);
    expect(like.body.comment.likes).toEqual([b.id]);
    const unlike = await as(app, b).post(`/api/comments/${c.id}/like`);
    expect(unlike.body.comment.likes).toEqual([]);
  });

  it('nhiều người cùng thích', async () => {
    const a = await signUp(app);
    const others = [await signUp(app), await signUp(app)];
    const post = await createPost(app, a);
    const c = (await comment(a, post.id)).body.comment;
    await Promise.all(others.map((u) => as(app, u).post(`/api/comments/${c.id}/like`)));
    const list = (await as(app, a).get(`/api/comments?postId=${post.id}`)).body.comments;
    expect(list[0].likes.sort()).toEqual(others.map((u) => u.id).sort());
  });

  it('bình luận không tồn tại → 404', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post(`/api/comments/${bogusId}/like`)).status).toBe(404);
  });
});

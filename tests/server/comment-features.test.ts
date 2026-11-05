import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, createPost, bogusId, TestUser } from './helpers';

// Bình luận: sửa nội dung và thả cảm xúc đa dạng (like / love / haha / wow / sad / angry).

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const comment = async (user: TestUser, postId: string, data: Record<string, unknown> = {}) =>
  (await as(app, user).post('/api/comments').send({ postId, content: 'bình luận', ...data })).body.comment as { id: string; [k: string]: unknown };
const react = (user: TestUser, id: string, type: string) => as(app, user).post(`/api/comments/${id}/react`).send({ type });
const reactionsOf = (body: { comment: { reactions: { type: string; userId: string }[] } }) => body.comment.reactions;

describe('Sửa bình luận', () => {
  it('tác giả sửa → nội dung mới + editedAt; bình luận chưa sửa không có editedAt', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(a, post.id, { content: 'cũ' });
    expect(c.editedAt).toBeUndefined();
    const res = await as(app, a).patch(`/api/comments/${c.id}`).send({ content: 'mới' });
    expect(res.status).toBe(200);
    expect(res.body.comment).toMatchObject({ id: c.id, content: 'mới' });
    expect(res.body.comment.editedAt).toBeTruthy();
    expect((await as(app, a).get(`/api/comments?postId=${post.id}`)).body.comments[0].content).toBe('mới');
  });

  it('nội dung được cắt khoảng trắng, giữ tiếng Việt / emoji / xuống dòng', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(a, post.id);
    const res = await as(app, a).patch(`/api/comments/${c.id}`).send({ content: '  Chào 😊\nbạn  ' });
    expect(res.body.comment.content).toBe('Chào 😊\nbạn');
  });

  it('chủ bài viết KHÔNG sửa được bình luận của người khác → 403, nội dung không đổi', async () => {
    const owner = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, owner);
    const c = await comment(b, post.id, { content: 'của b' });
    expect((await as(app, owner).patch(`/api/comments/${c.id}`).send({ content: 'hack' })).status).toBe(403);
    expect((await as(app, b).get(`/api/comments?postId=${post.id}`)).body.comments[0].content).toBe('của b');
  });

  it('xoá hết chữ → 400; bình luận có ảnh thì được để trống chữ', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const plain = await comment(a, post.id);
    expect((await as(app, a).patch(`/api/comments/${plain.id}`).send({ content: '   ' })).status).toBe(400);
    const withImage = await comment(a, post.id, { content: '', image: '/u/a.png' });
    const res = await as(app, a).patch(`/api/comments/${withImage.id}`).send({ content: '' });
    expect(res.status).toBe(200);
    expect(res.body.comment.image).toBe('/u/a.png');
  });

  it('quá 3000 ký tự / thiếu content / sai kiểu → 400', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(a, post.id);
    for (const body of [{ content: 'x'.repeat(3001) }, {}, { content: 5 }, { content: null }]) {
      expect((await as(app, a).patch(`/api/comments/${c.id}`).send(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('không đổi được tác giả / bài / parent / reactions qua body (chống mass-assignment)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const other = await createPost(app, a);
    const c = await comment(a, post.id);
    const res = await as(app, a).patch(`/api/comments/${c.id}`).send({ content: 'ok', author: b.id, post: other.id, parent: bogusId, likes: [b.id] });
    expect(res.status).toBe(200);
    expect(res.body.comment.author.id).toBe(a.id);
    expect(res.body.comment.postId).toBe(post.id);
    expect(res.body.comment.likes).toEqual([]);
  });

  it('không tồn tại → 404; id sai → 400; chưa đăng nhập → 401', async () => {
    const a = await signUp(app);
    expect((await as(app, a).patch(`/api/comments/${bogusId}`).send({ content: 'x' })).status).toBe(404);
    expect((await as(app, a).patch('/api/comments/abc').send({ content: 'x' })).status).toBe(400);
    const { default: request } = await import('supertest');
    expect((await request(app).patch(`/api/comments/${bogusId}`).send({ content: 'x' })).status).toBe(401);
  });

  it('vẫn sửa được bình luận cũ khi chủ bài đã tắt bình luận', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(b, post.id);
    await as(app, a).post(`/api/posts/${post.id}/toggle-comments`);
    expect((await as(app, b).patch(`/api/comments/${c.id}`).send({ content: 'sửa sau khi tắt' })).status).toBe(200);
  });

  it('sửa bình luận trả lời vẫn giữ parentId', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const parent = await comment(a, post.id);
    const reply = await comment(a, post.id, { parentId: parent.id });
    const res = await as(app, a).patch(`/api/comments/${reply.id}`).send({ content: 'đã sửa' });
    expect(res.body.comment.parentId).toBe(parent.id);
  });
});

describe('Cảm xúc bình luận', () => {
  const TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];

  it.each(TYPES)('thả "%s" → có trong reactions', async (type) => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(a, post.id);
    const res = await react(b, c.id, type);
    expect(res.status).toBe(200);
    expect(reactionsOf(res.body)).toEqual([{ type, userId: b.id }]);
  });

  it('bấm lại cùng loại → bỏ cảm xúc', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(a, post.id);
    await react(a, c.id, 'love');
    const res = await react(a, c.id, 'love');
    expect(reactionsOf(res.body)).toEqual([]);
    expect(res.body.comment.likes).toEqual([]);
  });

  it('đổi loại → thay cảm xúc cũ, mỗi người chỉ một cảm xúc (mọi cặp loại)', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    for (const from of TYPES) {
      for (const to of TYPES.filter((t) => t !== from)) {
        const c = await comment(a, post.id);
        await react(a, c.id, from);
        const res = await react(a, c.id, to);
        expect(reactionsOf(res.body), `${from} → ${to}`).toEqual([{ type: to, userId: a.id }]);
      }
    }
  });

  it('"like" nằm ở likes; cảm xúc khác KHÔNG nằm ở likes (tương thích giao diện cũ)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(a, post.id);
    expect((await react(b, c.id, 'like')).body.comment.likes).toEqual([b.id]);
    const love = await react(b, c.id, 'love');
    expect(love.body.comment.likes).toEqual([]);
    expect(reactionsOf(love.body)).toEqual([{ type: 'love', userId: b.id }]);
  });

  it('endpoint /like cũ vẫn hoạt động và tương tác đúng với cảm xúc khác', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(a, post.id);
    await react(a, c.id, 'haha');
    const like = await as(app, a).post(`/api/comments/${c.id}/like`);
    expect(reactionsOf(like.body)).toEqual([{ type: 'like', userId: a.id }]);
    const unlike = await as(app, a).post(`/api/comments/${c.id}/like`);
    expect(reactionsOf(unlike.body)).toEqual([]);
  });

  it('nhiều người, nhiều loại cùng lúc', async () => {
    const a = await signUp(app);
    const users = await Promise.all(Array.from({ length: 6 }, () => signUp(app)));
    const post = await createPost(app, a);
    const c = await comment(a, post.id);
    await Promise.all(users.map((u, i) => react(u, c.id, TYPES[i])));
    const list = (await as(app, a).get(`/api/comments?postId=${post.id}`)).body.comments[0].reactions as { type: string; userId: string }[];
    expect(list).toHaveLength(6);
    expect(new Set(list.map((r) => r.userId)).size).toBe(6);
    expect(list.map((r) => r.type).sort()).toEqual([...TYPES].sort());
  });

  it('danh sách bình luận cũng có reactions và likes', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(a, post.id);
    await react(a, c.id, 'wow');
    const listed = (await as(app, a).get(`/api/comments?postId=${post.id}`)).body.comments[0];
    expect(listed.reactions).toEqual([{ type: 'wow', userId: a.id }]);
    expect(listed.likes).toEqual([]);
  });

  it('loại không hợp lệ / thiếu → 400', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(a, post.id);
    for (const body of [{ type: 'meh' }, { type: 'LIKE' }, {}, { type: null }, { type: ['like'] }]) {
      expect((await as(app, a).post(`/api/comments/${c.id}/react`).send(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('không tồn tại → 404; id sai → 400; bài riêng tư → 403; chưa đăng nhập → 401', async () => {
    const a = await signUp(app);
    const stranger = await signUp(app);
    expect((await react(a, bogusId, 'like')).status).toBe(404);
    expect((await react(a, 'abc', 'like')).status).toBe(400);
    const secret = await createPost(app, a, { privacy: 'only_me' });
    const c = await comment(a, secret.id);
    expect((await react(stranger, c.id, 'love')).status).toBe(403);
    const { default: request } = await import('supertest');
    expect((await request(app).post(`/api/comments/${c.id}/react`).send({ type: 'like' })).status).toBe(401);
  });

  it('vẫn thả được cảm xúc khi bài đã tắt bình luận', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(b, post.id);
    await as(app, a).post(`/api/posts/${post.id}/toggle-comments`);
    expect((await react(a, c.id, 'love')).status).toBe(200);
  });

  it('lặp lại 8 lần: cùng một người bấm 6 loại song song → luôn ≤ 1 cảm xúc, và likes không chứa trùng', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    for (let round = 0; round < 8; round++) {
      const c = await comment(a, post.id);
      await Promise.all([...TYPES, ...TYPES].map((t) => react(a, c.id, t)));
      const listed = (await as(app, a).get(`/api/comments?postId=${post.id}`)).body.comments.find((x: { id: string }) => x.id === c.id);
      expect(listed.reactions.length, `vòng ${round}`).toBeLessThanOrEqual(1);
      expect(new Set(listed.likes).size).toBe(listed.likes.length);
    }
  });

  it('cùng một người bấm liên tục nhiều loại cực nhanh → không bao giờ có hơn 1 cảm xúc', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    const c = await comment(a, post.id);
    await Promise.all(TYPES.map((t) => react(a, c.id, t)));
    const listed = (await as(app, a).get(`/api/comments?postId=${post.id}`)).body.comments[0].reactions as unknown[];
    expect(listed.length).toBeLessThanOrEqual(1); // cập nhật nguyên tử → không bao giờ có 2 cảm xúc của một người
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { PostModel } from '../../server/models/Post';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, createPost, bogusId, TestUser } from './helpers';

// Test bài viết: đăng / sửa / xoá, quyền riêng tư (công khai / bạn bè / chỉ mình tôi), bài lên tường, cảm xúc,
// ghim, lưu, chia sẻ, kỷ niệm, phân trang, thông báo kèm theo.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const feedIds = async (viewer: TestUser, query = '') =>
  ((await as(app, viewer).get(`/api/posts${query}`)).body.posts as { id: string }[]).map((p) => p.id);

describe('Đăng bài', () => {
  it('đăng bài chữ → mặc định công khai, tác giả đúng, số đếm = 0', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a, { content: 'Xin chào thế giới' });
    expect(post).toMatchObject({ content: 'Xin chào thế giới', privacy: 'public', commentsCount: 0, sharesCount: 0, reactions: [], pinned: false, isSaved: false });
    expect((post.author as { id: string }).id).toBe(a.id);
  });

  it('đăng bài có ảnh, video, cảm xúc, vị trí', async () => {
    const a = await signUp(app);
    const withImages = await createPost(app, a, { content: '', images: ['/uploads/1.png', '/uploads/2.png'], feeling: 'hạnh phúc 😊', location: 'Hà Nội' });
    expect(withImages).toMatchObject({ images: ['/uploads/1.png', '/uploads/2.png'], feeling: 'hạnh phúc 😊', location: 'Hà Nội' });
    const withVideo = await createPost(app, a, { content: '', video: '/uploads/v.mp4' });
    expect(withVideo.video).toBe('/uploads/v.mp4');
  });

  it('nội dung có tiếng Việt, emoji, xuống dòng được giữ nguyên', async () => {
    const a = await signUp(app);
    const content = 'Dòng 1 🎉\nDòng 2: Tiếng Việt có dấu ăâêôơư';
    expect((await createPost(app, a, { content })).content).toBe(content);
  });

  it('nội dung bị cắt khoảng trắng 2 đầu', async () => {
    const a = await signUp(app);
    expect((await createPost(app, a, { content: '   hello   ' })).content).toBe('hello');
  });

  it.each([
    ['quyền riêng tư không hợp lệ', { privacy: 'everyone' }],
    ['nội dung quá 10000 ký tự', { content: 'x'.repeat(10001) }],
    ['quá 20 ảnh', { images: Array.from({ length: 21 }, (_, i) => `/u/${i}.png`) }],
    ['wallOwnerId sai định dạng', { wallOwnerId: 'abc' }],
    ['taggedUserIds sai định dạng', { taggedUserIds: ['abc'] }],
  ])('từ chối: %s → 400', async (_l, body) => {
    const a = await signUp(app);
    expect((await as(app, a).post('/api/posts').send({ content: 'x', ...body })).status).toBe(400);
  });

  it('chưa đăng nhập → 401', async () => {
    expect((await request(app).post('/api/posts').send({ content: 'x' })).status).toBe(401);
  });

  it('không thể giả mạo tác giả / số cảm xúc / số bình luận qua body', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const res = await as(app, a).post('/api/posts').send({ content: 'x', author: b.id, commentsCount: 999, sharesCount: 999, pinned: true, reactions: [{ type: 'like', userId: b.id }] });
    expect(res.status).toBe(200);
    expect(res.body.post.author.id).toBe(a.id);
    expect(res.body.post).toMatchObject({ commentsCount: 0, sharesCount: 0, pinned: false, reactions: [] });
  });
});

describe('Gắn thẻ & đăng lên tường', () => {
  it('gắn thẻ bạn → người được gắn nhận thông báo; tự gắn thẻ mình bị bỏ qua; trùng id chỉ tính 1', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a, { taggedUserIds: [b.id, b.id, a.id] });
    expect((post.taggedUsers as { id: string }[]).map((u) => u.id)).toEqual([b.id]);
    const notifs = (await as(app, b).get('/api/notifications')).body.notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ type: 'system', targetId: post.id, targetType: 'post' });
    expect((await as(app, a).get('/api/notifications')).body.notifications).toHaveLength(0);
  });

  it('đăng lên tường bạn bè → có wallOwnerId + chủ tường nhận thông báo', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await befriend(app, a, b);
    const post = await createPost(app, a, { wallOwnerId: b.id, content: 'Chúc mừng sinh nhật' });
    expect(post.wallOwnerId).toBe(b.id);
    expect((await as(app, b).get('/api/notifications')).body.notifications[0].type).toBe('system');
  });

  it('đăng lên tường chính mình = bài thường (không có wallOwnerId)', async () => {
    const a = await signUp(app);
    expect((await createPost(app, a, { wallOwnerId: a.id })).wallOwnerId).toBeUndefined();
  });

  it('KHÔNG đăng được lên tường người chưa kết bạn → 403', async () => {
    const a = await signUp(app);
    const stranger = await signUp(app);
    expect((await as(app, a).post('/api/posts').send({ content: 'spam', wallOwnerId: stranger.id })).status).toBe(403);
  });

  it('đăng lên tường người không tồn tại → 404; người đã chặn mình → 403', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    expect((await as(app, a).post('/api/posts').send({ content: 'x', wallOwnerId: bogusId })).status).toBe(404);
    await befriend(app, a, b);
    await as(app, b).post(`/api/users/${a.id}/block`);
    expect((await as(app, a).post('/api/posts').send({ content: 'x', wallOwnerId: b.id })).status).toBe(403);
  });
});

describe('Quyền riêng tư của bài viết', () => {
  it('công khai: mọi người thấy', async () => {
    const a = await signUp(app);
    const stranger = await signUp(app);
    const post = await createPost(app, a, { privacy: 'public' });
    expect(await feedIds(stranger)).toContain(post.id);
    expect((await as(app, stranger).get(`/api/posts/${post.id}`)).status).toBe(200);
  });

  it('bạn bè: bạn thấy, người lạ KHÔNG thấy (cả bảng tin lẫn xem trực tiếp)', async () => {
    const a = await signUp(app);
    const friend = await signUp(app);
    const stranger = await signUp(app);
    await befriend(app, a, friend);
    const post = await createPost(app, a, { privacy: 'friends' });
    expect(await feedIds(friend)).toContain(post.id);
    expect(await feedIds(stranger)).not.toContain(post.id);
    expect((await as(app, friend).get(`/api/posts/${post.id}`)).status).toBe(200);
    expect((await as(app, stranger).get(`/api/posts/${post.id}`)).status).toBe(404);
  });

  it('chỉ mình tôi: chỉ tác giả thấy, ngay cả bạn bè cũng không', async () => {
    const a = await signUp(app);
    const friend = await signUp(app);
    await befriend(app, a, friend);
    const post = await createPost(app, a, { privacy: 'only_me' });
    expect(await feedIds(a)).toContain(post.id);
    expect(await feedIds(friend)).not.toContain(post.id);
    expect((await as(app, friend).get(`/api/posts/${post.id}`)).status).toBe(404);
  });

  it('huỷ kết bạn → mất quyền xem bài "bạn bè"', async () => {
    const a = await signUp(app);
    const f = await signUp(app);
    await befriend(app, a, f);
    const post = await createPost(app, a, { privacy: 'friends' });
    await as(app, a).delete(`/api/friends/${f.id}`);
    expect(await feedIds(f)).not.toContain(post.id);
  });

  it('đổi quyền riêng tư khi sửa bài có hiệu lực ngay', async () => {
    const a = await signUp(app);
    const stranger = await signUp(app);
    const post = await createPost(app, a);
    expect(await feedIds(stranger)).toContain(post.id);
    await as(app, a).patch(`/api/posts/${post.id}`).send({ privacy: 'only_me' });
    expect(await feedIds(stranger)).not.toContain(post.id);
  });

  it('thao tác với bài không xem được đều bị từ chối (cảm xúc, lưu, chia sẻ)', async () => {
    const a = await signUp(app);
    const stranger = await signUp(app);
    const post = await createPost(app, a, { privacy: 'only_me' });
    expect((await as(app, stranger).post(`/api/posts/${post.id}/react`).send({ type: 'like' })).status).toBe(404);
    expect((await as(app, stranger).post(`/api/posts/${post.id}/save`)).status).toBe(404);
    expect((await as(app, stranger).post(`/api/posts/${post.id}/share`).send({})).status).toBe(404);
  });
});

describe('Bảng tin', () => {
  it('sắp xếp mới nhất trước', async () => {
    const a = await signUp(app);
    const p1 = await createPost(app, a, { content: 'cũ' });
    const p2 = await createPost(app, a, { content: 'mới' });
    const ids = await feedIds(a);
    expect(ids.indexOf(p2.id)).toBeLessThan(ids.indexOf(p1.id));
  });

  it('phân trang limit / skip không trùng và không sót', async () => {
    const a = await signUp(app);
    const created: string[] = [];
    for (let i = 0; i < 5; i++) created.push((await createPost(app, a, { content: `bài ${i}` })).id);
    const all = (await feedIds(a, '?limit=100')).filter((id) => created.includes(id));
    const page1 = await feedIds(a, '?limit=2&skip=0');
    const page2 = await feedIds(a, '?limit=2&skip=2');
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(new Set([...page1, ...page2]).size).toBe(4);
    expect(all).toHaveLength(5);
  });

  it('tham số rác không làm hỏng: limit/skip âm, chữ, quá lớn', async () => {
    const a = await signUp(app);
    await createPost(app, a);
    for (const q of ['?limit=-5', '?skip=-5', '?limit=abc', '?skip=abc', '?limit=0', '?limit=99999', '?limit=1.5']) {
      const res = await as(app, a).get(`/api/posts${q}`);
      expect(res.status, q).toBe(200);
      expect(res.body.posts.length, q).toBeLessThanOrEqual(100);
    }
    expect((await as(app, a).get('/api/posts?limit=1')).body.posts).toHaveLength(1);
  });

  it('bài viết được gắn isSaved đúng theo người xem', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    await as(app, b).post(`/api/posts/${post.id}/save`);
    const forB = (await as(app, b).get('/api/posts')).body.posts.find((p: { id: string }) => p.id === post.id);
    const forA = (await as(app, a).get('/api/posts')).body.posts.find((p: { id: string }) => p.id === post.id);
    expect(forB.isSaved).toBe(true);
    expect(forA.isSaved).toBe(false);
  });
});

describe('Xem chi tiết', () => {
  it('id không tồn tại → 404; id sai định dạng → 400', async () => {
    const a = await signUp(app);
    expect((await as(app, a).get(`/api/posts/${bogusId}`)).status).toBe(404);
    expect((await as(app, a).get('/api/posts/abc')).status).toBe(400);
  });
});

describe('Sửa bài', () => {
  it('tác giả sửa được; có dấu "đã chỉnh sửa" (updatedAt)', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a, { content: 'cũ' });
    expect(post.updatedAt).toBeUndefined();
    const res = await as(app, a).patch(`/api/posts/${post.id}`).send({ content: 'mới', feeling: 'vui' });
    expect(res.status).toBe(200);
    expect(res.body.post).toMatchObject({ content: 'mới', feeling: 'vui' });
    expect(res.body.post.updatedAt).toBeTruthy();
  });

  it('người khác sửa → 403, nội dung không đổi', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a, { content: 'gốc' });
    expect((await as(app, b).patch(`/api/posts/${post.id}`).send({ content: 'bị sửa' })).status).toBe(403);
    expect((await as(app, a).get(`/api/posts/${post.id}`)).body.post.content).toBe('gốc');
  });

  it('không đổi được tác giả / số đếm qua sửa bài', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const res = await as(app, a).patch(`/api/posts/${post.id}`).send({ author: b.id, commentsCount: 50, pinned: true });
    expect(res.body.post.author.id).toBe(a.id);
    expect(res.body.post.commentsCount).toBe(0);
    expect(res.body.post.pinned).toBe(false);
  });

  it('bài không tồn tại → 404; dữ liệu sai → 400', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    expect((await as(app, a).patch(`/api/posts/${bogusId}`).send({ content: 'x' })).status).toBe(404);
    expect((await as(app, a).patch(`/api/posts/${post.id}`).send({ privacy: 'xyz' })).status).toBe(400);
  });
});

describe('Xoá bài', () => {
  it('tác giả xoá → bài biến mất; xoá lần nữa → 404', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    expect((await as(app, a).delete(`/api/posts/${post.id}`)).status).toBe(200);
    expect(await feedIds(a)).not.toContain(post.id);
    expect((await as(app, a).delete(`/api/posts/${post.id}`)).status).toBe(404);
  });

  it('người khác xoá → 403 và bài còn nguyên', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    expect((await as(app, b).delete(`/api/posts/${post.id}`)).status).toBe(403);
    expect(await feedIds(a)).toContain(post.id);
  });
});

describe('Cảm xúc', () => {
  it('thả → đổi loại → bấm lại cùng loại thì bỏ', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const like = await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'like' });
    expect(like.body.post.reactions).toEqual([{ type: 'like', userId: b.id, userName: b.name }]);
    const love = await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'love' });
    expect(love.body.post.reactions).toHaveLength(1);
    expect(love.body.post.reactions[0].type).toBe('love');
    const off = await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'love' });
    expect(off.body.post.reactions).toEqual([]);
  });

  it('mỗi người chỉ có 1 cảm xúc dù bấm liên tục nhiều loại', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    for (const type of ['like', 'haha', 'wow', 'sad', 'angry', 'love']) await as(app, a).post(`/api/posts/${post.id}/react`).send({ type });
    const fresh = (await as(app, a).get(`/api/posts/${post.id}`)).body.post;
    expect(fresh.reactions).toHaveLength(1);
    expect(fresh.reactions[0].type).toBe('love');
  });

  it('nhiều người cùng thả', async () => {
    const a = await signUp(app);
    const users = [await signUp(app), await signUp(app), await signUp(app)];
    const post = await createPost(app, a);
    await Promise.all(users.map((u) => as(app, u).post(`/api/posts/${post.id}/react`).send({ type: 'like' })));
    expect((await as(app, a).get(`/api/posts/${post.id}`)).body.post.reactions).toHaveLength(3);
  });

  it('thả cảm xúc bài người khác → tác giả nhận thông báo; thả bài của chính mình thì không', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    await as(app, a).post(`/api/posts/${post.id}/react`).send({ type: 'like' });
    expect((await as(app, a).get('/api/notifications')).body.notifications).toHaveLength(0);
    await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'love' });
    const notifs = (await as(app, a).get('/api/notifications')).body.notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ type: 'like', targetId: post.id });
  });

  it('đổi / bỏ cảm xúc không sinh thêm thông báo mới', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'like' });
    await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'love' });
    await as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'love' });
    expect((await as(app, a).get('/api/notifications')).body.notifications).toHaveLength(1);
  });

  it('loại cảm xúc không hợp lệ → 400; bài không tồn tại → 404', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    expect((await as(app, a).post(`/api/posts/${post.id}/react`).send({ type: 'meh' })).status).toBe(400);
    expect((await as(app, a).post(`/api/posts/${post.id}/react`).send({})).status).toBe(400);
    expect((await as(app, a).post(`/api/posts/${bogusId}/react`).send({ type: 'like' })).status).toBe(404);
  });
});

describe('Ghim', () => {
  it('chủ bài ghim / bỏ ghim', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    expect((await as(app, a).post(`/api/posts/${post.id}/pin`)).body.post.pinned).toBe(true);
    expect((await as(app, a).post(`/api/posts/${post.id}/pin`)).body.post.pinned).toBe(false);
  });

  it('người khác ghim bài của mình → 403', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    expect((await as(app, b).post(`/api/posts/${post.id}/pin`)).status).toBe(403);
  });
});

describe('Lưu bài', () => {
  it('lưu rồi bỏ lưu; mỗi người lưu riêng của họ', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    expect((await as(app, b).post(`/api/posts/${post.id}/save`)).body.post.isSaved).toBe(true);
    expect((await as(app, a).get(`/api/posts/${post.id}`)).body.post.isSaved).toBe(false);
    expect((await as(app, b).post(`/api/posts/${post.id}/save`)).body.post.isSaved).toBe(false);
  });
});

describe('Chia sẻ', () => {
  it('chia sẻ → tạo bài mới của người chia sẻ trích nguồn, tăng sharesCount bài gốc', async () => {
    const a = await signUp(app, 'Gốc');
    const b = await signUp(app);
    const original = await createPost(app, a, { content: 'Nội dung gốc' });
    const res = await as(app, b).post(`/api/posts/${original.id}/share`).send({ message: 'Hay quá' });
    expect(res.status).toBe(200);
    expect(res.body.post.author.id).toBe(b.id);
    expect(res.body.post.content).toContain('Hay quá');
    expect(res.body.post.content).toContain('Nội dung gốc');
    expect(res.body.post.content).toContain(a.name);
    expect((await as(app, a).get(`/api/posts/${original.id}`)).body.post.sharesCount).toBe(1);
  });

  it('chia sẻ không kèm lời nhắn vẫn được', async () => {
    const a = await signUp(app);
    const original = await createPost(app, a, { content: 'abc' });
    expect((await as(app, a).post(`/api/posts/${original.id}/share`).send({})).status).toBe(200);
  });

  it('chia sẻ bài "bạn bè" KHÔNG được biến thành công khai (không rò rỉ nội dung riêng tư)', async () => {
    const a = await signUp(app);
    const friend = await signUp(app);
    const stranger = await signUp(app);
    await befriend(app, a, friend);
    const original = await createPost(app, a, { content: 'bí mật của bạn bè', privacy: 'friends' });
    const shared = await as(app, friend).post(`/api/posts/${original.id}/share`).send({});
    expect(shared.status).toBe(200);
    expect(await feedIds(stranger)).not.toContain(shared.body.post.id);
  });
});

describe('Kỷ niệm', () => {
  it('chỉ hiện bài MÌNH đăng đúng ngày + tháng hôm nay của các năm trước', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const now = new Date();
    const sameDayLastYear = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 12);
    const otherDayLastYear = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() === 1 ? 2 : 1, 12);
    const memory = await PostModel.create({ author: a.id, content: 'kỷ niệm', createdAt: sameDayLastYear });
    await PostModel.create({ author: a.id, content: 'ngày khác', createdAt: otherDayLastYear });
    await PostModel.create({ author: b.id, content: 'của người khác', createdAt: sameDayLastYear });
    await createPost(app, a, { content: 'hôm nay' });

    const res = await as(app, a).get('/api/posts/memories');
    expect(res.status).toBe(200);
    expect(res.body.posts.map((p: { id: string }) => p.id)).toEqual([memory.id]);
  });

  it('không có kỷ niệm → mảng rỗng', async () => {
    const a = await signUp(app);
    expect((await as(app, a).get('/api/posts/memories')).body.posts).toEqual([]);
  });
});

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, bogusId, createPost, TestUser } from './helpers';
import { PostModel } from '../../server/models/Post';
import { CommentModel } from '../../server/models/Comment';
import { PageFollowModel } from '../../server/models/PageFollow';

// Trang (fanpage): tạo / sửa / xoá, theo dõi, quản trị viên, đăng bài với tư cách trang, và quyền hạn của từng vai trò.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const api = (u: TestUser) => as(app, u);
type P = { id: string; [k: string]: unknown };
const mkPage = async (owner: TestUser, data: Record<string, unknown> = {}): Promise<P> => {
  const res = await api(owner).post('/api/pages').send({ name: 'Trang thử', ...data });
  if (res.status !== 200) throw new Error(`Tạo trang thất bại: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.page;
};
const page = async (u: TestUser, p: P) => (await api(u).get(`/api/pages/${p.id}`)).body.page;
const notifs = async (u: TestUser) => (await api(u).get('/api/notifications')).body.notifications as { content: string; targetType?: string; targetId?: string }[];
const addAdmin = (owner: TestUser, p: P, u: TestUser) => api(owner).post(`/api/pages/${p.id}/admins`).send({ userId: u.id });

describe('Tạo / xem trang', () => {
  it('tạo trang → mình là chủ trang, 0 người theo dõi, mặc định danh mục "other"', async () => {
    const a = await signUp(app);
    const res = await api(a).post('/api/pages').send({ name: '  Quán Cà Phê  ', description: 'Cà phê ngon', category: 'business', website: 'https://quan.vn', address: 'Hà Nội' });
    expect(res.status).toBe(200);
    expect(res.body.page).toMatchObject({ name: 'Quán Cà Phê', category: 'business', description: 'Cà phê ngon', website: 'https://quan.vn', address: 'Hà Nội', ownerId: a.id, followersCount: 0, myRole: 'owner', isFollowing: false });
    expect(res.body.page.admins.map((u: { id: string }) => u.id)).toEqual([a.id]);
    expect((await api(a).post('/api/pages').send({ name: 'Trang mặc định' })).body.page.category).toBe('other');
  });

  it('dữ liệu sai → 400 (tên ngắn, danh mục lạ, website không phải http(s))', async () => {
    const a = await signUp(app);
    for (const body of [{ name: 'a' }, { name: 'Trang', category: 'xyz' }, { name: 'Trang', website: 'javascript:alert(1)' }, {}]) {
      expect((await api(a).post('/api/pages').send(body)).status).toBe(400);
    }
  });

  it('chưa đăng nhập → 401; id lạ → 404; id sai định dạng → 400', async () => {
    const a = await signUp(app);
    expect((await (await import('supertest')).default(app).get('/api/pages')).status).toBe(401);
    expect((await api(a).get(`/api/pages/${bogusId}`)).status).toBe(404);
    expect((await api(a).get('/api/pages/abc')).status).toBe(400);
  });

  it('người ngoài xem được trang (công khai) nhưng KHÔNG thấy danh sách quản trị viên', async () => {
    const owner = await signUp(app);
    const stranger = await signUp(app);
    const p = await mkPage(owner);
    const seen = await page(stranger, p);
    expect(seen).toMatchObject({ name: 'Trang thử', myRole: null, isFollowing: false });
    expect(seen.admins).toBeUndefined();
  });
});

describe('Danh sách trang', () => {
  it('mine = trang mình sở hữu hoặc quản trị; following = đang theo dõi; mặc định = khám phá (loại trang của mình và đã theo dõi)', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const fan = await signUp(app);
    const tag = Math.random().toString(36).slice(2, 8);
    const p1 = await mkPage(owner, { name: `Trang A ${tag}` });
    const p2 = await mkPage(owner, { name: `Trang B ${tag}` });
    await addAdmin(owner, p1, admin);
    await api(fan).post(`/api/pages/${p1.id}/follow`);

    const ids = async (u: TestUser, q: string) => ((await api(u).get(`/api/pages?${q}&q=${tag}`)).body.pages as P[]).map((x) => x.id);
    expect((await ids(owner, 'scope=mine')).sort()).toEqual([p1.id, p2.id].sort());
    expect(await ids(admin, 'scope=mine')).toEqual([p1.id]);
    expect(await ids(fan, 'scope=following')).toEqual([p1.id]);
    expect(await ids(fan, 'scope=discover')).toEqual([p2.id]);
    expect(await ids(owner, 'scope=discover')).toEqual([]); // trang của mình không nằm trong "khám phá"
    expect(await ids(admin, 'scope=discover')).toEqual([p2.id]);
  });

  it('khám phá sắp theo số người theo dõi; tìm theo tên (an toàn với ký tự đặc biệt); phân trang', async () => {
    const owner = await signUp(app);
    const f1 = await signUp(app);
    const f2 = await signUp(app);
    const viewer = await signUp(app);
    const tag = Math.random().toString(36).slice(2, 8);
    const small = await mkPage(owner, { name: `Nhỏ ${tag}` });
    const big = await mkPage(owner, { name: `Lớn ${tag}` });
    await api(f1).post(`/api/pages/${big.id}/follow`);
    await api(f2).post(`/api/pages/${big.id}/follow`);
    const list = (await api(viewer).get(`/api/pages?q=${tag}`)).body.pages as P[];
    expect(list.map((x) => x.id)).toEqual([big.id, small.id]);
    expect((await api(viewer).get('/api/pages?q=%28%2A%5B')).body.pages).toEqual([]);
    expect(((await api(viewer).get(`/api/pages?q=${tag}&limit=1`)).body.pages as P[]).map((x) => x.id)).toEqual([big.id]);
    expect(((await api(viewer).get(`/api/pages?q=${tag}&limit=1&skip=1`)).body.pages as P[]).map((x) => x.id)).toEqual([small.id]);
    expect((await api(viewer).get(`/api/pages?q=${tag}`)).body.pages[0].isFollowing).toBe(false);
  });
});

describe('Sửa / xoá trang', () => {
  it('chủ trang và quản trị viên sửa được; người ngoài → 403; dữ liệu sai → 400', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const stranger = await signUp(app);
    const p = await mkPage(owner);
    await addAdmin(owner, p, admin);
    const ok = await api(admin).patch(`/api/pages/${p.id}`).send({ name: 'Tên mới', description: 'Mô tả mới', category: 'brand', website: 'https://moi.vn', address: 'HCM', avatar: '/a.png', cover: '/c.png' });
    expect(ok.status).toBe(200);
    expect(ok.body.page).toMatchObject({ name: 'Tên mới', description: 'Mô tả mới', category: 'brand', website: 'https://moi.vn', address: 'HCM', avatar: '/a.png', cover: '/c.png', myRole: 'admin' });
    expect((await api(stranger).patch(`/api/pages/${p.id}`).send({ name: 'Hack' })).status).toBe(403);
    expect((await api(owner).patch(`/api/pages/${p.id}`).send({ name: 'x' })).status).toBe(400);
    expect((await api(owner).patch(`/api/pages/${p.id}`).send({ website: 'ftp://x' })).status).toBe(400);
  });

  it('xoá trang: chỉ chủ trang; xoá luôn bài, bình luận, lượt theo dõi', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const fan = await signUp(app);
    const p = await mkPage(owner);
    await addAdmin(owner, p, admin);
    await api(fan).post(`/api/pages/${p.id}/follow`);
    const post = (await api(owner).post(`/api/pages/${p.id}/posts`).send({ content: 'Khai trương' })).body.post;
    await api(fan).post('/api/comments').send({ postId: post.id, content: 'Chúc mừng' });
    expect((await api(admin).delete(`/api/pages/${p.id}`)).status).toBe(403);
    expect((await api(owner).delete(`/api/pages/${p.id}`)).body).toEqual({ ok: true });
    expect((await api(owner).get(`/api/pages/${p.id}`)).status).toBe(404);
    expect(await PostModel.countDocuments({ page: p.id })).toBe(0);
    expect(await CommentModel.countDocuments({ post: post.id })).toBe(0);
    expect(await PageFollowModel.countDocuments({ page: p.id })).toBe(0);
  });
});

describe('Theo dõi trang', () => {
  it('theo dõi → số tăng + chủ trang được báo; theo dõi lại không tăng thêm; bỏ theo dõi → giảm; bỏ khi chưa theo dõi không sao', async () => {
    const owner = await signUp(app);
    const fan = await signUp(app);
    const p = await mkPage(owner);
    const res = await api(fan).post(`/api/pages/${p.id}/follow`);
    expect(res.body.page).toMatchObject({ followersCount: 1, isFollowing: true });
    expect((await notifs(owner)).some((n) => /theo dõi trang "Trang thử"/.test(n.content) && n.targetType === 'page' && n.targetId === p.id)).toBe(true);
    expect((await api(fan).post(`/api/pages/${p.id}/follow`)).body.page.followersCount).toBe(1);
    expect((await notifs(owner)).filter((n) => /theo dõi trang/.test(n.content))).toHaveLength(1);
    expect((await page(fan, p)).isFollowing).toBe(true);
    expect((await api(fan).delete(`/api/pages/${p.id}/follow`)).body.page).toMatchObject({ followersCount: 0, isFollowing: false });
    expect((await api(fan).delete(`/api/pages/${p.id}/follow`)).body.page.followersCount).toBe(0);
  });

  it('chủ trang tự theo dõi trang của mình → không tự báo cho mình', async () => {
    const owner = await signUp(app);
    const p = await mkPage(owner);
    await api(owner).post(`/api/pages/${p.id}/follow`);
    expect((await notifs(owner)).filter((n) => /theo dõi trang/.test(n.content))).toHaveLength(0);
  });

  it('6 người theo dõi cùng lúc / 1 người bấm 6 lần cùng lúc → đếm đúng', async () => {
    const owner = await signUp(app);
    const fans = await Promise.all(Array.from({ length: 6 }, () => signUp(app)));
    const p = await mkPage(owner);
    await Promise.all(fans.map((f) => api(f).post(`/api/pages/${p.id}/follow`)));
    expect((await page(owner, p)).followersCount).toBe(6);
    await Promise.all(Array.from({ length: 6 }, () => api(fans[0]).post(`/api/pages/${p.id}/follow`)));
    expect((await page(owner, p)).followersCount).toBe(6);
    await Promise.all(Array.from({ length: 4 }, () => api(fans[0]).delete(`/api/pages/${p.id}/follow`)));
    expect((await page(owner, p)).followersCount).toBe(5);
  });

  it('danh sách người theo dõi: chỉ quản trị viên xem được', async () => {
    const owner = await signUp(app);
    const fan = await signUp(app);
    const p = await mkPage(owner);
    await api(fan).post(`/api/pages/${p.id}/follow`);
    expect((await api(fan).get(`/api/pages/${p.id}/followers`)).status).toBe(403);
    const list = (await api(owner).get(`/api/pages/${p.id}/followers`)).body.users as { id: string }[];
    expect(list.map((u) => u.id)).toEqual([fan.id]);
    expect(((await api(owner).get(`/api/pages/${p.id}/followers?limit=1&skip=1`)).body.users as unknown[]).length).toBe(0);
  });
});

describe('Theo dõi trang — đua nhau & lỗi', () => {
  it('2 yêu cầu theo dõi cùng lúc: bên thua cuộc (lỗi trùng khoá) coi như đã theo dõi, không tăng đếm lần 2, không trả lỗi', async () => {
    const owner = await signUp(app);
    const fan = await signUp(app);
    const p = await mkPage(owner);
    const spy = vi.spyOn(PageFollowModel, 'updateOne').mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    const res = await api(fan).post(`/api/pages/${p.id}/follow`);
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.body.page.followersCount).toBe(0); // bên kia mới là bên tạo → bên kia tăng đếm
  });

  it('lỗi cơ sở dữ liệu khác (không phải trùng khoá) → 500, không nuốt lỗi', async () => {
    const owner = await signUp(app);
    const fan = await signUp(app);
    const p = await mkPage(owner);
    const spy = vi.spyOn(PageFollowModel, 'updateOne').mockRejectedValueOnce(new Error('mất kết nối'));
    const res = await api(fan).post(`/api/pages/${p.id}/follow`);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect((await page(owner, p)).followersCount).toBe(0);
  });
});

describe('Danh sách & bài viết — trường hợp biên', () => {
  it('từ khoá q không phải chuỗi (mảng) được bỏ qua như không có từ khoá', async () => {
    const a = await signUp(app);
    const p = await mkPage(a, { name: `Trang biên ${Math.random().toString(36).slice(2, 7)}` });
    const res = await api(a).get('/api/pages?scope=mine&q[]=x&q[]=y');
    expect(res.status).toBe(200);
    expect((res.body.pages as P[]).map((x) => x.id)).toContain(p.id);
  });

  it('bài của trang chỉ có ảnh hoặc chỉ có video (không chữ) vẫn đăng được', async () => {
    const owner = await signUp(app);
    const p = await mkPage(owner);
    expect((await api(owner).post(`/api/pages/${p.id}/posts`).send({ images: ['/a.png'] })).status).toBe(200);
    expect((await api(owner).post(`/api/pages/${p.id}/posts`).send({ video: '/v.mp4' })).status).toBe(200);
  });
});

describe('Quản trị viên của trang', () => {
  it('chủ trang thêm quản trị viên (được báo); trùng → 409; thêm chính mình → 400; người lạ id → 404; người không phải chủ → 403', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const other = await signUp(app);
    const p = await mkPage(owner);
    const res = await addAdmin(owner, p, admin);
    expect(res.status).toBe(200);
    expect(res.body.page.admins.map((u: { id: string }) => u.id).sort()).toEqual([owner.id, admin.id].sort());
    expect((await notifs(admin)).some((n) => /quản trị viên của trang/.test(n.content) && n.targetType === 'page')).toBe(true);
    expect((await addAdmin(owner, p, admin)).status).toBe(409);
    expect((await addAdmin(owner, p, owner)).status).toBe(400);
    expect((await api(owner).post(`/api/pages/${p.id}/admins`).send({ userId: bogusId })).status).toBe(404);
    expect((await api(owner).post(`/api/pages/${p.id}/admins`).send({ userId: 'abc' })).status).toBe(400);
    expect((await addAdmin(admin, p, other)).status).toBe(403); // quản trị viên không thêm được người khác
    expect((await page(admin, p)).myRole).toBe('admin');
  });

  it('không thêm người đã chặn / bị chặn làm quản trị viên', async () => {
    const owner = await signUp(app);
    const u = await signUp(app);
    const p = await mkPage(owner);
    await api(owner).post(`/api/users/${u.id}/block`);
    expect((await addAdmin(owner, p, u)).status).toBe(403);
  });

  it('gỡ quản trị viên: chủ trang gỡ ai cũng được (người bị gỡ được báo); quản trị viên tự rời được; không gỡ được người khác / chủ trang', async () => {
    const owner = await signUp(app);
    const a1 = await signUp(app);
    const a2 = await signUp(app);
    const p = await mkPage(owner);
    await addAdmin(owner, p, a1);
    await addAdmin(owner, p, a2);
    expect((await api(a1).delete(`/api/pages/${p.id}/admins/${a2.id}`)).status).toBe(403);
    expect((await api(a1).delete(`/api/pages/${p.id}/admins/${owner.id}`)).status).toBe(400);
    expect((await api(owner).delete(`/api/pages/${p.id}/admins/${owner.id}`)).status).toBe(400);
    expect((await api(owner).delete(`/api/pages/${p.id}/admins/${bogusId}`)).status).toBe(404);
    expect((await api(owner).delete(`/api/pages/${p.id}/admins/${a2.id}`)).body.page.admins).toHaveLength(2);
    expect((await notifs(a2)).some((n) => /gỡ quyền quản trị viên/.test(n.content))).toBe(true);
    const left = await api(a1).delete(`/api/pages/${p.id}/admins/${a1.id}`);
    expect(left.status).toBe(200);
    expect((await page(a1, p)).myRole).toBeNull();
    expect((await notifs(a1)).some((n) => /gỡ quyền/.test(n.content))).toBe(false); // tự rời → không tự báo
  });
});

describe('Bài viết của trang', () => {
  it('chỉ chủ trang / quản trị viên đăng; bài hiện ở trang với thông tin trang; bài trống → 400', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const fan = await signUp(app);
    const p = await mkPage(owner, { name: 'Tiệm Bánh' });
    await addAdmin(owner, p, admin);
    expect((await api(fan).post(`/api/pages/${p.id}/posts`).send({ content: 'hack' })).status).toBe(403);
    expect((await api(owner).post(`/api/pages/${p.id}/posts`).send({ content: '' })).status).toBe(400);
    const res = await api(admin).post(`/api/pages/${p.id}/posts`).send({ content: 'Bánh mới #khaitruong', images: ['/b.png'] });
    expect(res.status).toBe(200);
    expect(res.body.post).toMatchObject({ pageId: p.id, pageName: 'Tiệm Bánh', privacy: 'public', hashtags: ['khaitruong'], author: { id: admin.id } });
    const list = (await api(fan).get(`/api/pages/${p.id}/posts`)).body.posts as { content: string }[];
    expect(list.map((x) => x.content)).toEqual(['Bánh mới #khaitruong']);
    expect(((await api(fan).get(`/api/pages/${p.id}/posts?limit=1&skip=1`)).body.posts as unknown[]).length).toBe(0);
  });

  it('bài của trang hiện ở bảng tin chung; người theo dõi và người ngoài đều thả cảm xúc / bình luận được', async () => {
    const owner = await signUp(app);
    const fan = await signUp(app);
    const stranger = await signUp(app);
    const p = await mkPage(owner);
    const post = (await api(owner).post(`/api/pages/${p.id}/posts`).send({ content: 'Thông báo từ trang' })).body.post;
    const feed = (await api(stranger).get('/api/posts')).body.posts as { id: string; pageName?: string }[];
    expect(feed.find((x) => x.id === post.id)?.pageName).toBe('Trang thử');
    expect((await api(fan).post(`/api/posts/${post.id}/react`).send({ type: 'love' })).status).toBe(200);
    expect((await api(stranger).post('/api/comments').send({ postId: post.id, content: 'hay' })).status).toBe(200);
  });

  it('xoá bài của trang: quản trị viên xoá được cả bài do người khác đăng (kèm bình luận); người ngoài → 403; bài sai trang → 404', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const fan = await signUp(app);
    const p = await mkPage(owner);
    const other = await mkPage(owner, { name: 'Trang khác' });
    await addAdmin(owner, p, admin);
    const post = (await api(admin).post(`/api/pages/${p.id}/posts`).send({ content: 'Bài của admin' })).body.post;
    await api(fan).post('/api/comments').send({ postId: post.id, content: 'bl' });
    expect((await api(fan).delete(`/api/pages/${p.id}/posts/${post.id}`)).status).toBe(403);
    expect((await api(owner).delete(`/api/pages/${other.id}/posts/${post.id}`)).status).toBe(404);
    expect((await api(owner).delete(`/api/pages/${p.id}/posts/${post.id}`)).body).toEqual({ ok: true });
    expect(await PostModel.countDocuments({ _id: post.id })).toBe(0);
    expect(await CommentModel.countDocuments({ post: post.id })).toBe(0);
    expect((await api(owner).delete(`/api/pages/${p.id}/posts/${post.id}`)).status).toBe(404);
  });

  it('tác giả không đổi được quyền riêng tư của bài trang (luôn công khai)', async () => {
    const owner = await signUp(app);
    const stranger = await signUp(app);
    const p = await mkPage(owner);
    const post = (await api(owner).post(`/api/pages/${p.id}/posts`).send({ content: 'Bài công khai của trang' })).body.post;
    const res = await api(owner).patch(`/api/posts/${post.id}`).send({ privacy: 'only_me' });
    expect(res.body.post.privacy).toBe('public');
    expect((await api(stranger).get(`/api/posts/${post.id}`)).status).toBe(200);
  });

  it('bài thường vẫn không có thông tin trang', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    expect(post.pageId).toBeUndefined();
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { io as connect, Socket } from 'socket.io-client';
import request from 'supertest';
import type { Express } from 'express';
import { setupSocketServer } from '../../server/socketServer';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, bogusId, createPost, TestUser } from './helpers';
import { UserModel } from '../../server/models/User';
import { PostModel } from '../../server/models/Post';
import { CommentModel } from '../../server/models/Comment';
import { GroupModel } from '../../server/models/Group';
import { GroupMemberModel } from '../../server/models/GroupMember';
import { PageModel } from '../../server/models/Page';
import { ReportModel } from '../../server/models/Report';
import { NotificationModel } from '../../server/models/Notification';
import { AuditLogModel } from '../../server/models/AuditLog';

// Quản trị hệ thống: quyền truy cập, khoá / mở khoá, đổi quyền, kiểm duyệt nội dung, báo cáo vi phạm, thông báo hệ thống, nhật ký, realtime.

let app: Express;
let server: http.Server;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
  server = http.createServer(app);
  setupSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise((resolve) => server.close(resolve));
  await disconnectTestDb();
});

const api = (u: Pick<TestUser, 'token'>) => as(app, u);
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const makeAdmin = async (label = 'Admin') => {
  const u = await signUp(app, label);
  await UserModel.updateOne({ _id: u.id }, { role: 'admin' });
  return u;
};
const mkGroup = async (owner: TestUser, name = 'Nhóm thử') => (await api(owner).post('/api/groups').send({ name })).body.group as { id: string };
const mkPage = async (owner: TestUser, name = 'Trang thử') => (await api(owner).post('/api/pages').send({ name })).body.page as { id: string };
const mkComment = async (u: TestUser, postId: string, extra: Record<string, unknown> = {}) =>
  (await api(u).post('/api/comments').send({ postId, content: 'Bình luận thử', ...extra })).body.comment as { id: string };
const report = (u: TestUser, targetType: string, targetId: string, extra: Record<string, unknown> = {}) =>
  api(u).post('/api/reports').send({ targetType, targetId, reason: 'spam', ...extra });

/** Kết nối socket, gom các sự kiện. */
async function listen(user: Pick<TestUser, 'token'>, events: string[]) {
  const socket = connect(url, { auth: { token: user.token }, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  const received: Record<string, unknown[]> = Object.fromEntries(events.map((e) => [e, []]));
  events.forEach((e) => socket.on(e, (p) => received[e].push(p)));
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
  await settle(60);
  return { socket, received };
}

describe('Quyền truy cập khu vực quản trị', () => {
  it('chưa đăng nhập → 401; người dùng thường → 403 ở mọi route /api/admin', async () => {
    const user = await signUp(app);
    const paths = ['/stats', '/audit-logs', '/users', '/posts', '/comments', '/groups', '/pages', '/reports', '/announcements'];
    for (const p of paths) {
      expect((await request(app).get(`/api/admin${p}`)).status).toBe(401);
      expect((await api(user).get(`/api/admin${p}`)).status).toBe(403);
    }
    expect((await api(user).patch(`/api/admin/users/${user.id}/role`).send({ role: 'admin' })).status).toBe(403);
    expect((await api(user).delete(`/api/admin/posts/${bogusId}`)).status).toBe(403);
  });

  it('quản trị viên vào được; /api/auth/me trả vai trò', async () => {
    const admin = await makeAdmin();
    expect((await api(admin).get('/api/admin/stats')).status).toBe(200);
    expect((await api(admin).get('/api/auth/me')).body.user.role).toBe('admin');
    const user = await signUp(app);
    expect((await api(user).get('/api/auth/me')).body.user.role).toBe('user');
  });

  it('thu hồi quyền có hiệu lực ngay với token cũ (quyền đọc từ DB, không nằm trong token)', async () => {
    const admin = await makeAdmin();
    await UserModel.updateOne({ _id: admin.id }, { role: 'user' });
    expect((await api(admin).get('/api/admin/stats')).status).toBe(403);
  });
});

describe('Thống kê', () => {
  it('đếm đúng người dùng, bài viết, reel, bình luận, nhóm, trang, báo cáo chờ', async () => {
    const admin = await makeAdmin();
    const before = (await api(admin).get('/api/admin/stats')).body.stats;
    const a = await signUp(app);
    const post = await createPost(app, a);
    await api(a).post('/api/reels').send({ video: '/uploads/v.mp4', caption: 'r' });
    await mkComment(a, post.id);
    await mkGroup(a);
    await mkPage(a);
    const b = await signUp(app);
    await report(b, 'post', post.id);
    const after = (await api(admin).get('/api/admin/stats')).body.stats;
    expect(after.users - before.users).toBe(2);
    expect(after.newToday - before.newToday).toBe(2);
    expect(after.admins).toBeGreaterThanOrEqual(1);
    expect(after.online).toBeGreaterThanOrEqual(2);
    expect(after.posts - before.posts).toBe(1);
    expect(after.reels - before.reels).toBe(1);
    expect(after.comments - before.comments).toBe(1);
    expect(after.groups - before.groups).toBe(1);
    expect(after.pages - before.pages).toBe(1);
    expect(after.pendingReports - before.pendingReports).toBe(1);
  });
});

describe('Danh sách người dùng', () => {
  it('có email + vai trò; lọc theo admin / user / banned / online; tìm theo tên, username, email; phân trang', async () => {
    const admin = await makeAdmin('Quản trị');
    const target = await signUp(app, 'Nguyễn Cần Tìm');
    await api(admin).patch(`/api/admin/users/${target.id}/ban`).send({ banned: true, reason: 'spam' });

    const byName = (await api(admin).get('/api/admin/users?q=Cần Tìm')).body;
    expect(byName.users).toHaveLength(1);
    expect(byName.users[0]).toMatchObject({ id: target.id, email: target.email, role: 'user', banned: true, banReason: 'spam' });
    expect((await api(admin).get(`/api/admin/users?q=${target.username}`)).body.total).toBe(1);
    expect((await api(admin).get(`/api/admin/users?q=${encodeURIComponent(target.email)}`)).body.total).toBe(1);

    const ids = async (filter: string) => ((await api(admin).get(`/api/admin/users?filter=${filter}&limit=100`)).body.users as { id: string }[]).map((u) => u.id);
    expect(await ids('banned')).toContain(target.id);
    expect(await ids('admin')).toContain(admin.id);
    expect(await ids('admin')).not.toContain(target.id);
    expect(await ids('user')).toContain(target.id);
    expect(await ids('user')).not.toContain(admin.id);
    expect(await ids('online')).toContain(admin.id);
    expect(await ids('online')).not.toContain(target.id); // bị khoá → offline

    const page = (await api(admin).get('/api/admin/users?limit=2&skip=1')).body;
    expect(page.users).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
  });

  it('ký tự đặc biệt trong ô tìm kiếm không phá truy vấn (regex được thoát)', async () => {
    const admin = await makeAdmin();
    const res = await api(admin).get('/api/admin/users?q=' + encodeURIComponent('.*(['));
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });
});

describe('Khoá / mở khoá tài khoản', () => {
  it('bị khoá: không đăng nhập được, token cũ bị từ chối với code banned, không kết nối realtime; mở khoá dùng lại bình thường', async () => {
    const admin = await makeAdmin();
    const target = await signUp(app);
    expect((await api(admin).patch(`/api/admin/users/${target.id}/ban`).send({ banned: true, reason: 'Vi phạm nhiều lần' })).body.user).toMatchObject({ banned: true, banReason: 'Vi phạm nhiều lần' });

    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: target.password });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('banned');
    expect(login.body.error).toContain('Lý do: Vi phạm nhiều lần');
    const old = await api(target).get('/api/auth/me');
    expect(old.status).toBe(401);
    expect(old.body.code).toBe('banned');
    await expect(listen(target, [])).rejects.toThrow(/khoá/);

    const unbanned = await api(admin).patch(`/api/admin/users/${target.id}/ban`).send({ banned: false });
    expect(unbanned.body.user).toMatchObject({ banned: false });
    expect(unbanned.body.user.banReason).toBeUndefined();
    expect((await api(target).get('/api/auth/me')).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: target.email, password: target.password })).status).toBe(200);
  });

  it('đang online mà bị khoá → nhận account:banned rồi bị ngắt kết nối', async () => {
    const admin = await makeAdmin();
    const target = await signUp(app);
    const { socket, received } = await listen(target, ['account:banned']);
    expect(socket.connected).toBe(true);
    await api(admin).patch(`/api/admin/users/${target.id}/ban`).send({ banned: true, reason: 'Spam' });
    await settle();
    expect(received['account:banned']).toEqual([{ reason: 'Spam' }]);
    expect(socket.connected).toBe(false);
  });

  it('không tự khoá mình; không khoá quản trị viên khác; id lạ → 404; dữ liệu sai → 400', async () => {
    const admin = await makeAdmin();
    const other = await makeAdmin();
    expect((await api(admin).patch(`/api/admin/users/${admin.id}/ban`).send({ banned: true })).status).toBe(400);
    expect((await api(admin).patch(`/api/admin/users/${other.id}/ban`).send({ banned: true })).status).toBe(400);
    expect((await api(admin).patch(`/api/admin/users/${bogusId}/ban`).send({ banned: true })).status).toBe(404);
    expect((await api(admin).patch(`/api/admin/users/${other.id}/ban`).send({ banned: 'có' })).status).toBe(400);
    expect((await api(admin).patch(`/api/admin/users/${other.id}/ban`).send({})).status).toBe(400);
  });

  it('khoá không lý do → không lưu lý do', async () => {
    const admin = await makeAdmin();
    const target = await signUp(app);
    const res = await api(admin).patch(`/api/admin/users/${target.id}/ban`).send({ banned: true });
    expect(res.body.user.banReason).toBeUndefined();
    expect(res.body.user.bannedAt).toBeDefined();
  });
});

describe('Cấp / thu hồi quyền quản trị', () => {
  it('cấp quyền → người đó vào được khu quản trị và nhận account:role; thu hồi → mất quyền', async () => {
    const admin = await makeAdmin();
    const target = await signUp(app);
    const { received } = await listen(target, ['account:role']);
    expect((await api(target).get('/api/admin/stats')).status).toBe(403);
    expect((await api(admin).patch(`/api/admin/users/${target.id}/role`).send({ role: 'admin' })).body.user.role).toBe('admin');
    expect((await api(target).get('/api/admin/stats')).status).toBe(200);
    await settle();
    expect(received['account:role']).toEqual([{ role: 'admin' }]);
    await api(admin).patch(`/api/admin/users/${target.id}/role`).send({ role: 'user' });
    expect((await api(target).get('/api/admin/stats')).status).toBe(403);
  });

  it('không tự đổi quyền mình; không cấp cho tài khoản bị khoá; id lạ 404; vai trò sai 400', async () => {
    const admin = await makeAdmin();
    const target = await signUp(app);
    expect((await api(admin).patch(`/api/admin/users/${admin.id}/role`).send({ role: 'user' })).status).toBe(400);
    await api(admin).patch(`/api/admin/users/${target.id}/ban`).send({ banned: true });
    expect((await api(admin).patch(`/api/admin/users/${target.id}/role`).send({ role: 'admin' })).status).toBe(400);
    expect((await api(admin).patch(`/api/admin/users/${bogusId}/role`).send({ role: 'admin' })).status).toBe(404);
    expect((await api(admin).patch(`/api/admin/users/${target.id}/role`).send({ role: 'root' })).status).toBe(400);
  });
});

describe('Kiểm duyệt bài viết, reel, bình luận', () => {
  it('danh sách bài: có tác giả, lọc theo loại (bài / reel / nhóm / trang), tìm theo nội dung hoặc tác giả, phân trang', async () => {
    const admin = await makeAdmin();
    const a = await signUp(app, 'Tác giả Đặc Biệt');
    const normal = await createPost(app, a, { content: 'bài thường xyzunique' });
    const reel = (await api(a).post('/api/reels').send({ video: '/uploads/v.mp4', caption: 'reel xyzunique' })).body.reel;
    const group = await mkGroup(a, 'Nhóm xyzunique');
    const groupPost = (await api(a).post(`/api/groups/${group.id}/posts`).send({ content: 'bài nhóm xyzunique' })).body.post;
    const page = await mkPage(a, 'Trang xyzunique');
    const pagePost = (await api(a).post(`/api/pages/${page.id}/posts`).send({ content: 'bài trang xyzunique' })).body.post;

    const list = async (q: string) => (await api(admin).get(`/api/admin/posts?${q}`)).body.posts as { id: string; kind: string; author: { id: string }; groupName?: string; pageName?: string }[];
    const mine = await list('q=xyzunique&limit=100');
    expect(mine.map((p) => p.kind).sort()).toEqual(['group', 'page', 'post', 'reel']);
    expect(mine.find((p) => p.id === groupPost.id)).toMatchObject({ groupName: 'Nhóm xyzunique', author: { id: a.id } });
    expect(mine.find((p) => p.id === pagePost.id)?.pageName).toBe('Trang xyzunique');
    expect((await list('q=xyzunique&kind=post')).map((p) => p.id)).toEqual([normal.id]);
    expect((await list('q=xyzunique&kind=reel')).map((p) => p.id)).toEqual([reel.id]);
    expect((await list('q=xyzunique&kind=group')).map((p) => p.id)).toEqual([groupPost.id]);
    expect((await list('q=xyzunique&kind=page')).map((p) => p.id)).toEqual([pagePost.id]);
    expect((await list('q=Đặc Biệt&limit=100')).length).toBe(4); // tìm theo tên tác giả
    expect(await list('q=xyzunique&limit=2')).toHaveLength(2);
    expect((await api(admin).get('/api/admin/posts?q=xyzunique')).body.total).toBe(4);
  });

  it('gỡ bài: xoá kèm bình luận, báo cáo; báo cho tác giả; ghi nhật ký; id lạ 404', async () => {
    const admin = await makeAdmin();
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    await mkComment(b, post.id);
    await report(b, 'post', post.id);
    expect((await api(admin).delete(`/api/admin/posts/${post.id}`)).status).toBe(200);
    expect(await PostModel.findById(post.id)).toBeNull();
    expect(await CommentModel.countDocuments({ post: post.id })).toBe(0);
    const note = await NotificationModel.findOne({ user: a.id, type: 'system' });
    expect(note.content).toContain('Bài viết của bạn đã bị quản trị viên gỡ');
    expect(String(note.actor)).toBe(admin.id);
    expect(await AuditLogModel.findOne({ admin: admin.id, action: 'post.delete', targetId: post.id })).not.toBeNull();
    expect((await api(admin).delete(`/api/admin/posts/${post.id}`)).status).toBe(404);
  });

  it('gỡ reel và bài trong nhóm (đang chờ duyệt) → thông báo đúng loại, dữ liệu sạch', async () => {
    const admin = await makeAdmin();
    const a = await signUp(app);
    const member = await signUp(app);
    const reel = (await api(a).post('/api/reels').send({ video: '/uploads/v.mp4' })).body.reel;
    await api(admin).delete(`/api/admin/posts/${reel.id}`);
    expect((await NotificationModel.findOne({ user: a.id, type: 'system' })).content).toMatch(/^Reel của bạn/);

    const group = await mkGroup(a);
    await api(a).patch(`/api/groups/${group.id}`).send({ postApproval: true });
    await api(member).post(`/api/groups/${group.id}/join`).send({});
    const pending = (await api(member).post(`/api/groups/${group.id}/posts`).send({ content: 'chờ duyệt' })).body.post;
    expect((await api(admin).delete(`/api/admin/posts/${pending.id}`)).status).toBe(200);
    expect(await PostModel.findById(pending.id)).toBeNull();
  });

  it('danh sách bình luận: tìm theo nội dung / người viết, có trích đoạn bài; gỡ bình luận cha xoá cả trả lời và giảm số đếm', async () => {
    const admin = await makeAdmin();
    const a = await signUp(app, 'Chủ bài');
    const b = await signUp(app, 'Người Bình Luận Lạ');
    const post = await createPost(app, a, { content: 'Nội dung bài gốc' });
    const parent = await mkComment(b, post.id, { content: 'bình luận cha qwertyu' });
    await mkComment(a, post.id, { content: 'trả lời', parentId: parent.id });
    await mkComment(a, post.id, { content: 'bình luận khác' });
    expect((await PostModel.findById(post.id)).commentsCount).toBe(3);

    const list = (await api(admin).get('/api/admin/comments?q=qwertyu')).body;
    expect(list.total).toBe(1);
    expect(list.comments[0]).toMatchObject({ id: parent.id, postId: post.id, postExcerpt: 'Nội dung bài gốc', isReply: false, author: { id: b.id } });
    expect((await api(admin).get('/api/admin/comments?q=Bình Luận Lạ')).body.total).toBe(1); // tìm theo tên người viết
    const imageOnly = await mkComment(b, post.id, { content: '', image: '/uploads/a.png' });
    expect((await api(admin).get('/api/admin/comments?q=Bình Luận Lạ&limit=100')).body.comments.find((c: { id: string }) => c.id === imageOnly.id).content).toBe('[Ảnh]');

    expect((await api(admin).delete(`/api/admin/comments/${parent.id}`)).status).toBe(200);
    expect(await CommentModel.countDocuments({ post: post.id })).toBe(2); // còn 'bình luận khác' + ảnh
    expect((await PostModel.findById(post.id)).commentsCount).toBe(2); // 5 − (cha + 1 trả lời)
    expect((await NotificationModel.findOne({ user: b.id, type: 'system' })).content).toContain('Bình luận của bạn');
    expect((await api(admin).delete(`/api/admin/comments/${parent.id}`)).status).toBe(404);
  });

  it('gỡ bình luận khi bài đã bị xoá trước đó → vẫn xoá được, không lỗi; bình luận trong bài nhóm', async () => {
    const admin = await makeAdmin();
    const a = await signUp(app);
    const post = await createPost(app, a);
    const orphan = await mkComment(a, post.id);
    await PostModel.deleteOne({ _id: post.id });
    expect((await api(admin).delete(`/api/admin/comments/${orphan.id}`)).status).toBe(200);

    const group = await mkGroup(a);
    const gp = (await api(a).post(`/api/groups/${group.id}/posts`).send({ content: 'bài nhóm' })).body.post;
    const gc = await mkComment(a, gp.id);
    expect((await api(admin).delete(`/api/admin/comments/${gc.id}`)).status).toBe(200);
  });
});

describe('Kiểm duyệt nhóm và trang', () => {
  it('danh sách nhóm có chủ nhóm + số bài; tìm theo tên / mô tả; gỡ nhóm xoá sạch bài, thành viên', async () => {
    const admin = await makeAdmin();
    const a = await signUp(app, 'Chủ nhóm');
    const group = await mkGroup(a, 'Nhóm Kiểm Duyệt');
    await api(a).patch(`/api/groups/${group.id}`).send({ description: 'mô tả đặc biệt abcdef' });
    await api(a).post(`/api/groups/${group.id}/posts`).send({ content: 'bài 1' });
    await api(a).post(`/api/groups/${group.id}/posts`).send({ content: 'bài 2' });

    const found = (await api(admin).get('/api/admin/groups?q=abcdef')).body;
    expect(found.groups[0]).toMatchObject({ id: group.id, name: 'Nhóm Kiểm Duyệt', postsCount: 2, membersCount: 1, owner: { id: a.id } });
    expect((await api(admin).get('/api/admin/groups?q=Kiểm Duyệt')).body.total).toBe(1);
    expect((await api(admin).get('/api/admin/groups')).body.groups.length).toBeGreaterThan(0);

    expect((await api(admin).delete(`/api/admin/groups/${group.id}`)).status).toBe(200);
    expect(await GroupModel.findById(group.id)).toBeNull();
    expect(await PostModel.countDocuments({ group: group.id })).toBe(0);
    expect(await GroupMemberModel.countDocuments({ group: group.id })).toBe(0);
    expect((await NotificationModel.findOne({ user: a.id, type: 'system' })).content).toContain('Nhóm của bạn');
    expect((await api(admin).delete(`/api/admin/groups/${group.id}`)).status).toBe(404);
  });

  it('danh sách trang có chủ trang + số bài + người theo dõi; gỡ trang xoá bài và lượt theo dõi', async () => {
    const admin = await makeAdmin();
    const a = await signUp(app, 'Chủ trang');
    const fan = await signUp(app);
    const page = await mkPage(a, 'Trang Đặc Biệt Kiểm Duyệt');
    await api(a).post(`/api/pages/${page.id}/posts`).send({ content: 'bài của trang' });
    await api(fan).post(`/api/pages/${page.id}/follow`);

    const found = (await api(admin).get('/api/admin/pages?q=Đặc Biệt Kiểm')).body;
    expect(found.pages[0]).toMatchObject({ id: page.id, postsCount: 1, followersCount: 1, owner: { id: a.id } });
    expect((await api(admin).get('/api/admin/pages')).body.pages.length).toBeGreaterThan(0);

    expect((await api(admin).delete(`/api/admin/pages/${page.id}`)).status).toBe(200);
    expect(await PageModel.findById(page.id)).toBeNull();
    expect(await PostModel.countDocuments({ page: page.id })).toBe(0);
    expect((await api(admin).delete(`/api/admin/pages/${page.id}`)).status).toBe(404);
  });
});

describe('Người dùng báo cáo vi phạm', () => {
  it('báo cáo bài / bình luận / người dùng / nhóm / trang → lưu kèm tên đối tượng; admin nhận realtime report:new', async () => {
    const admin = await makeAdmin();
    const { received } = await listen(admin, ['report:new']);
    const owner = await signUp(app, 'Bị Báo Cáo');
    const ownerName = owner.name;
    const reporter = await signUp(app);
    const post = await createPost(app, owner, { content: 'x'.repeat(100) });
    const comment = await mkComment(owner, post.id, { content: 'bình luận xấu' });
    const group = await mkGroup(owner, 'Nhóm xấu');
    const page = await mkPage(owner, 'Trang xấu');

    for (const [type, id] of [['post', post.id], ['comment', comment.id], ['user', owner.id], ['group', group.id], ['page', page.id]]) {
      expect((await report(reporter, type, id, { description: 'Lý do chi tiết' })).status).toBe(201);
    }
    const reports = (await api(admin).get('/api/admin/reports?q=Lý do chi tiết&limit=100')).body.reports as { targetType: string; targetName: string; reporter: { id: string }; status: string }[];
    const byType = Object.fromEntries(reports.map((r) => [r.targetType, r]));
    expect(byType.post.targetName).toBe(`${'x'.repeat(80)}…`);
    expect(byType.comment.targetName).toBe('bình luận xấu');
    expect(byType.user.targetName).toBe(ownerName);
    expect(byType.group.targetName).toBe('Nhóm xấu');
    expect(byType.page.targetName).toBe('Trang xấu');
    expect(reports.every((r) => r.status === 'pending' && r.reporter.id === reporter.id)).toBe(true);
    await settle();
    expect(received['report:new']).toHaveLength(5);
  });

  it('báo cáo bài chỉ có ảnh/reel: tên mặc định; bình luận chỉ có ảnh', async () => {
    const owner = await signUp(app);
    const reporter = await signUp(app);
    const admin = await makeAdmin();
    const reel = (await api(owner).post('/api/reels').send({ video: '/uploads/v.mp4' })).body.reel;
    const empty = await createPost(app, owner, { content: '', images: ['/uploads/a.png'] });
    const post = await createPost(app, owner);
    const imageComment = await mkComment(owner, post.id, { content: '', image: '/uploads/a.png' });
    for (const [type, id] of [['post', reel.id], ['post', empty.id], ['comment', imageComment.id]]) await report(reporter, type, id);
    const names = ((await api(admin).get('/api/admin/reports?limit=100')).body.reports as { targetName: string; reporter: { id: string } }[]).filter((r) => r.reporter.id === reporter.id).map((r) => r.targetName);
    expect(names.sort()).toEqual(['[Bài viết không có chữ]', '[Reel]', '[Ảnh]'].sort());
  });

  it('báo cáo trùng → 409; tự báo cáo mình / nội dung của mình → 400; đối tượng không tồn tại → 404; dữ liệu sai → 400; chưa đăng nhập → 401', async () => {
    const owner = await signUp(app);
    const reporter = await signUp(app);
    const post = await createPost(app, owner);
    expect((await report(reporter, 'post', post.id)).status).toBe(201);
    expect((await report(reporter, 'post', post.id)).status).toBe(409);
    expect((await report(owner, 'post', post.id)).status).toBe(400);
    expect((await report(owner, 'user', owner.id)).status).toBe(400);
    expect((await report(reporter, 'post', bogusId)).status).toBe(404);
    expect((await report(reporter, 'user', bogusId)).status).toBe(404);
    expect((await api(reporter).post('/api/reports').send({ targetType: 'story', targetId: post.id, reason: 'spam' })).status).toBe(400);
    expect((await api(reporter).post('/api/reports').send({ targetType: 'post', targetId: 'abc', reason: 'spam' })).status).toBe(400);
    expect((await api(reporter).post('/api/reports').send({ targetType: 'post', targetId: post.id, reason: 'ghét' })).status).toBe(400);
    expect((await request(app).post('/api/reports').send({})).status).toBe(401);
  });

  it('lỗi cơ sở dữ liệu khác trùng lặp vẫn được ném ra (không bị nuốt thành 409)', async () => {
    const owner = await signUp(app);
    const reporter = await signUp(app);
    const post = await createPost(app, owner);
    const { vi } = await import('vitest');
    const spy = vi.spyOn(ReportModel, 'create').mockRejectedValueOnce(new Error('mất kết nối'));
    expect((await report(reporter, 'post', post.id)).status).toBe(500);
    spy.mockRestore();
  });
});

describe('Xử lý báo cáo', () => {
  const setup = async () => {
    const admin = await makeAdmin();
    const owner = await signUp(app);
    const reporter = await signUp(app);
    const post = await createPost(app, owner);
    await report(reporter, 'post', post.id);
    const item = ((await api(admin).get(`/api/admin/reports?q=${encodeURIComponent(reporter.name)}`)).body.reports as { id: string }[])[0];
    return { admin, owner, reporter, post, item };
  };

  it('danh sách: lọc theo trạng thái, trả số báo cáo chờ, phân trang', async () => {
    const { admin, item } = await setup();
    const all = (await api(admin).get('/api/admin/reports')).body;
    expect(all.pending).toBeGreaterThanOrEqual(1);
    expect(all.reports.length).toBeGreaterThan(0);
    expect((await api(admin).get('/api/admin/reports?status=pending&limit=1')).body.reports).toHaveLength(1);
    await api(admin).patch(`/api/admin/reports/${item.id}`).send({ status: 'dismissed' });
    const dismissed = (await api(admin).get('/api/admin/reports?status=dismissed&limit=100')).body.reports as { id: string }[];
    expect(dismissed.map((r) => r.id)).toContain(item.id);
    expect(((await api(admin).get('/api/admin/reports?status=pending&limit=100')).body.reports as { id: string }[]).map((r) => r.id)).not.toContain(item.id);
    expect((await api(admin).get('/api/admin/reports?status=linhtinh')).status).toBe(200); // trạng thái lạ → không lọc
  });

  it('bỏ qua → người báo cáo được báo; ghi người xử lý; không xử lý lại được (409)', async () => {
    const { admin, reporter, post, item } = await setup();
    const res = await api(admin).patch(`/api/admin/reports/${item.id}`).send({ status: 'dismissed', note: 'Không vi phạm' });
    expect(res.body.report).toMatchObject({ status: 'dismissed', resolutionNote: 'Không vi phạm', handledBy: { id: admin.id } });
    expect(res.body.report.handledAt).toBeDefined();
    expect(await PostModel.findById(post.id)).not.toBeNull();
    expect((await NotificationModel.findOne({ user: reporter.id, type: 'system' })).content).toContain('không phát hiện vi phạm');
    expect((await api(admin).patch(`/api/admin/reports/${item.id}`).send({ status: 'resolved' })).status).toBe(409);
  });

  it('xác nhận + gỡ nội dung → bài bị xoá, mọi báo cáo chờ cùng đối tượng cũng được đóng, cả hai bên được báo', async () => {
    const { admin, owner, reporter, post, item } = await setup();
    const second = await signUp(app);
    await report(second, 'post', post.id);
    const res = await api(admin).patch(`/api/admin/reports/${item.id}`).send({ status: 'resolved', removeContent: true, note: 'Đã gỡ' });
    expect(res.body.report.status).toBe('resolved');
    expect(await PostModel.findById(post.id)).toBeNull();
    expect(await ReportModel.countDocuments({ targetId: post.id, status: 'pending' })).toBe(0);
    expect(await ReportModel.countDocuments({ targetId: post.id, status: 'resolved' })).toBe(2);
    expect((await NotificationModel.findOne({ user: reporter.id, type: 'system' })).content).toContain('đã được xử lý');
    expect((await NotificationModel.findOne({ user: owner.id, type: 'system' })).content).toContain('đã bị quản trị viên gỡ');
    const log = await AuditLogModel.findOne({ action: 'report.resolve', targetId: item.id });
    expect(log.details).toMatchObject({ removed: true, targetType: 'post' });
  });

  it('xác nhận không gỡ nội dung → chỉ đóng báo cáo đó, bài còn nguyên', async () => {
    const { admin, post, item } = await setup();
    await api(admin).patch(`/api/admin/reports/${item.id}`).send({ status: 'resolved' });
    expect(await PostModel.findById(post.id)).not.toBeNull();
  });

  it('gỡ nội dung nhưng đối tượng đã bị xoá trước đó → báo cáo vẫn được đóng', async () => {
    const { admin, post, item } = await setup();
    await PostModel.deleteOne({ _id: post.id });
    const res = await api(admin).patch(`/api/admin/reports/${item.id}`).send({ status: 'resolved', removeContent: true });
    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('resolved');
  });

  it('gỡ nhóm / trang / bình luận qua báo cáo; báo cáo người dùng không gỡ được; bỏ qua + gỡ → 400; id lạ 404; dữ liệu sai 400', async () => {
    const admin = await makeAdmin();
    const owner = await signUp(app);
    const reporter = await signUp(app);
    const group = await mkGroup(owner);
    const page = await mkPage(owner);
    const post = await createPost(app, owner);
    const comment = await mkComment(owner, post.id);
    for (const [type, id] of [['group', group.id], ['page', page.id], ['comment', comment.id], ['user', owner.id]]) await report(reporter, type, id);
    const mine = ((await api(admin).get(`/api/admin/reports?q=${encodeURIComponent(reporter.name)}&limit=100`)).body.reports as { id: string; targetType: string }[]);
    const of = (t: string) => mine.find((r) => r.targetType === t)!.id;

    expect((await api(admin).patch(`/api/admin/reports/${of('user')}`).send({ status: 'resolved', removeContent: true })).status).toBe(400);
    expect((await api(admin).patch(`/api/admin/reports/${of('group')}`).send({ status: 'dismissed', removeContent: true })).status).toBe(400);
    expect((await api(admin).patch(`/api/admin/reports/${of('group')}`).send({ status: 'xong' })).status).toBe(400);
    expect((await api(admin).patch(`/api/admin/reports/${bogusId}`).send({ status: 'resolved' })).status).toBe(404);
    for (const t of ['group', 'page', 'comment']) expect((await api(admin).patch(`/api/admin/reports/${of(t)}`).send({ status: 'resolved', removeContent: true })).status).toBe(200);
    expect(await GroupModel.findById(group.id)).toBeNull();
    expect(await PageModel.findById(page.id)).toBeNull();
    expect(await CommentModel.findById(comment.id)).toBeNull();
    expect((await api(admin).patch(`/api/admin/reports/${of('user')}`).send({ status: 'resolved' })).status).toBe(200);
  });

  it('xử lý báo cáo → các quản trị viên nhận report:update', async () => {
    const { admin, item } = await setup();
    const other = await makeAdmin();
    const { received } = await listen(other, ['report:update']);
    await api(admin).patch(`/api/admin/reports/${item.id}`).send({ status: 'dismissed' });
    await settle();
    expect(received['report:update']).toEqual([{ id: item.id, status: 'dismissed' }]);
  });
});

describe('Thông báo hệ thống', () => {
  it('gửi cho mọi tài khoản đang hoạt động (trừ tài khoản bị khoá), đẩy realtime, lưu bản ghi, ghi nhật ký', async () => {
    const admin = await makeAdmin();
    const a = await signUp(app);
    const banned = await signUp(app);
    await UserModel.updateOne({ _id: banned.id }, { banned: true });
    const { received } = await listen(a, ['notification:new']);

    const res = await api(admin).post('/api/admin/announcements').send({ title: 'Bảo trì', message: 'Hệ thống bảo trì lúc 2h sáng.', type: 'warning' });
    expect(res.status).toBe(201);
    expect(res.body.announcement).toMatchObject({ title: 'Bảo trì', type: 'warning', createdBy: { id: admin.id } });
    await settle();

    expect(await NotificationModel.countDocuments({ user: a.id, content: 'Bảo trì: Hệ thống bảo trì lúc 2h sáng.', type: 'system' })).toBe(1);
    expect(await NotificationModel.countDocuments({ user: banned.id, type: 'system' })).toBe(0);
    expect(received['notification:new']).toHaveLength(1);
    expect(received['notification:new'][0]).toMatchObject({ type: 'system', content: 'Bảo trì: Hệ thống bảo trì lúc 2h sáng.' });
    expect(await AuditLogModel.findOne({ action: 'announcement.create', targetId: res.body.announcement.id })).not.toBeNull();

    const list = (await api(admin).get('/api/admin/announcements')).body.announcements as { id: string }[];
    expect(list.map((x) => x.id)).toContain(res.body.announcement.id);
    // người dùng thường thấy thông báo trong danh sách thông báo của mình
    const mine = (await api(a).get('/api/notifications')).body.notifications as { content: string }[];
    expect(mine.some((n) => n.content.startsWith('Bảo trì'))).toBe(true);
  });

  it('gửi nhiều hơn một lô (>500 tài khoản) vẫn đủ', async () => {
    const admin = await makeAdmin();
    const base = await UserModel.countDocuments({ banned: { $ne: true } });
    const need = Math.max(0, 520 - base);
    if (need) await UserModel.insertMany(Array.from({ length: need }, (_, i) => ({ name: `Mass ${i}`, username: `mass_${Date.now()}_${i}`, email: `mass_${Date.now()}_${i}@test.vn`, passwordHash: 'x' })));
    const total = await UserModel.countDocuments({ banned: { $ne: true } });
    await api(admin).post('/api/admin/announcements').send({ title: 'Lô lớn', message: 'Gửi nhiều' });
    expect(await NotificationModel.countDocuments({ content: 'Lô lớn: Gửi nhiều' })).toBe(total);
  }, 60000);

  it('kiểm tra dữ liệu: thiếu tiêu đề / nội dung, quá dài, loại sai → 400; mặc định loại info', async () => {
    const admin = await makeAdmin();
    const send = (body: Record<string, unknown>) => api(admin).post('/api/admin/announcements').send(body);
    expect((await send({ message: 'x' })).status).toBe(400);
    expect((await send({ title: 'x' })).status).toBe(400);
    expect((await send({ title: '  ', message: 'x' })).status).toBe(400);
    expect((await send({ title: 'x'.repeat(101), message: 'x' })).status).toBe(400);
    expect((await send({ title: 'x', message: 'x'.repeat(1001) })).status).toBe(400);
    expect((await send({ title: 'x', message: 'x', type: 'khac' })).status).toBe(400);
    expect((await send({ title: 'Mặc định', message: 'ok' })).body.announcement.type).toBe('info');
  });

  it('xoá bản ghi thông báo (thông báo đã gửi vẫn còn); id lạ 404', async () => {
    const admin = await makeAdmin();
    const a = await signUp(app);
    const created = (await api(admin).post('/api/admin/announcements').send({ title: 'Tạm', message: 'Sẽ xoá' })).body.announcement;
    expect((await api(admin).delete(`/api/admin/announcements/${created.id}`)).status).toBe(200);
    expect(((await api(admin).get('/api/admin/announcements')).body.announcements as { id: string }[]).map((x) => x.id)).not.toContain(created.id);
    expect(await NotificationModel.countDocuments({ user: a.id, content: 'Tạm: Sẽ xoá' })).toBe(1);
    expect((await api(admin).delete(`/api/admin/announcements/${created.id}`)).status).toBe(404);
  });
});

describe('Nhật ký quản trị', () => {
  it('ghi lại ai làm gì, mới nhất trước, có phân trang; chỉ admin xem được', async () => {
    const admin = await makeAdmin('Người ghi nhật ký');
    const target = await signUp(app);
    await api(admin).patch(`/api/admin/users/${target.id}/ban`).send({ banned: true, reason: 'Lý do A' });
    await api(admin).patch(`/api/admin/users/${target.id}/ban`).send({ banned: false });
    const { logs, total } = (await api(admin).get('/api/admin/audit-logs?limit=2')).body;
    expect(total).toBeGreaterThanOrEqual(2);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ action: 'user.unban', targetType: 'user', targetId: target.id, admin: { id: admin.id, name: admin.name } });
    expect(logs[1]).toMatchObject({ action: 'user.ban', details: { reason: 'Lý do A' } });
    expect((await api(admin).get('/api/admin/audit-logs?limit=1&skip=1')).body.logs[0].action).toBe('user.ban');
  });
});

describe('Tài khoản bị xoá / token không hợp lệ', () => {
  it('người dùng không tồn tại → 401; token rác → 401; socket bị từ chối', async () => {
    const { createToken } = await import('../../server/jwtAuth');
    expect((await api({ token: createToken(bogusId) }).get('/api/auth/me')).status).toBe(401);
    expect((await api({ token: createToken('khong-phai-objectid') }).get('/api/auth/me')).status).toBe(401);
    await expect(listen({ token: createToken(bogusId) }, [])).rejects.toThrow(/không hợp lệ/);
  });
});

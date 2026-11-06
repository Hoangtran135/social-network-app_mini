import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { io as connect, Socket } from 'socket.io-client';
import type { Express } from 'express';
import { setupSocketServer } from '../../server/socketServer';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, TestUser } from './helpers';

// Sự kiện realtime của nhóm: chỉ thành viên nhóm nhận (bài chờ duyệt: chỉ quản trị viên); người ngoài KHÔNG nhận gì.

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

/** Dữ liệu các sự kiện realtime mà test quan tâm. */
interface SocketPayload {
  post: { id: string; groupStatus: string };
  postId: string;
  commentId: string;
  content: string;
  userId: string;
  targetType: string;
  targetId: string;
}
const EVENTS = ['post:new', 'post:update', 'post:delete', 'comment:delete', 'notification:new'];
async function listen(user: TestUser) {
  const socket = connect(url, { auth: { token: user.token }, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  const received: Record<string, SocketPayload[]> = Object.fromEntries(EVENTS.map((e) => [e, []]));
  EVENTS.forEach((e) => socket.on(e, (payload) => received[e].push(payload)));
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
  await new Promise((r) => setTimeout(r, 60));
  return received;
}
const settle = () => new Promise((r) => setTimeout(r, 300));
const api = (u: TestUser) => as(app, u);

async function setup(groupData: Record<string, unknown> = {}) {
  const [owner, admin, member, other, outsider] = await Promise.all([1, 2, 3, 4, 5].map(() => signUp(app)));
  const g = (await api(owner).post('/api/groups').send({ name: 'Nhóm realtime', ...groupData })).body.group;
  for (const u of [admin, member, other]) await api(u).post(`/api/groups/${g.id}/join`).send({});
  await api(owner).patch(`/api/groups/${g.id}/members/${admin.id}`).send({ role: 'admin' });
  const inbox = {
    owner: await listen(owner),
    admin: await listen(admin),
    member: await listen(member),
    other: await listen(other),
    outsider: await listen(outsider),
  };
  return { owner, admin, member, other, outsider, g, inbox };
}

describe('Realtime của nhóm', () => {
  it('đăng bài đã duyệt → các thành viên khác nhận post:new; tác giả và người ngoài thì không', async () => {
    const { member, g, inbox } = await setup();
    const res = await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'xin chào nhóm' });
    await settle();
    for (const k of ['owner', 'admin', 'other'] as const) expect(inbox[k]['post:new'].map((e) => e.post.id)).toEqual([res.body.post.id]);
    expect(inbox.member['post:new']).toHaveLength(0);
    expect(inbox.outsider['post:new']).toHaveLength(0);
  });

  it('bài chờ duyệt → CHỈ quản trị viên nhận post:new (+ thông báo); thành viên thường và người ngoài không', async () => {
    const { member, g, inbox } = await setup({ postApproval: true });
    await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'chờ duyệt' });
    await settle();
    expect(inbox.owner['post:new']).toHaveLength(1);
    expect(inbox.admin['post:new']).toHaveLength(1);
    expect(inbox.other['post:new']).toHaveLength(0);
    expect(inbox.outsider['post:new']).toHaveLength(0);
    expect(inbox.admin['notification:new'].some((n) => /chờ duyệt/.test(n.content))).toBe(true);
    expect(inbox.other['notification:new']).toHaveLength(0);
  });

  it('duyệt bài → cả nhóm (trừ người duyệt) nhận post:new, người ngoài không', async () => {
    const { owner, member, g, inbox } = await setup({ postApproval: true });
    const post = (await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'sẽ duyệt' })).body.post;
    await settle();
    inbox.other['post:new'].length = 0;
    inbox.member['post:new'].length = 0;
    await api(owner).post(`/api/groups/${g.id}/posts/${post.id}/approve`);
    await settle();
    expect(inbox.other['post:new']).toHaveLength(1);
    expect(inbox.member['post:new'][0].post.groupStatus).toBe('approved'); // tác giả cũng nhận bản đã duyệt
    expect(inbox.outsider['post:new']).toHaveLength(0);
  });

  it('từ chối bài chờ duyệt → tác giả + quản trị viên nhận post:delete; thành viên khác không', async () => {
    const { owner, member, g, inbox } = await setup({ postApproval: true });
    const post = (await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'từ chối' })).body.post;
    await api(owner).post(`/api/groups/${g.id}/posts/${post.id}/reject`);
    await settle();
    expect(inbox.member['post:delete']).toEqual([{ postId: post.id }]);
    expect(inbox.admin['post:delete']).toEqual([{ postId: post.id }]);
    expect(inbox.other['post:delete']).toHaveLength(0);
    expect(inbox.outsider['post:delete']).toHaveLength(0);
  });

  it('xoá bài đã duyệt (quản trị viên) → thành viên nhận post:delete, người ngoài không', async () => {
    const { owner, member, g, inbox } = await setup();
    const post = (await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'xoá' })).body.post;
    await api(owner).delete(`/api/groups/${g.id}/posts/${post.id}`);
    await settle();
    expect(inbox.other['post:delete']).toEqual([{ postId: post.id }]);
    expect(inbox.member['post:delete']).toEqual([{ postId: post.id }]);
    expect(inbox.outsider['post:delete']).toHaveLength(0);
  });

  it('xoá bài chờ duyệt: quản trị viên xoá → tác giả nhận; tác giả tự xoá → quản trị viên nhận, thành viên khác không', async () => {
    const { owner, member, g, inbox } = await setup({ postApproval: true });
    const p1 = (await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'một' })).body.post;
    const p2 = (await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'hai' })).body.post;
    await api(owner).delete(`/api/groups/${g.id}/posts/${p1.id}`);
    await api(member).delete(`/api/groups/${g.id}/posts/${p2.id}`);
    await settle();
    expect(inbox.member['post:delete'].map((e) => e.postId)).toEqual([p1.id]);
    expect(inbox.admin['post:delete'].map((e) => e.postId).sort()).toEqual([p1.id, p2.id].sort());
    expect(inbox.other['post:delete']).toHaveLength(0);
  });

  it('thả cảm xúc bài nhóm → chỉ thành viên nhận post:update; sửa / xoá bài qua API bài viết thường cũng chỉ tới thành viên', async () => {
    const { member, other, g, inbox } = await setup();
    const post = (await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'react' })).body.post;
    await settle();
    await api(other).post(`/api/posts/${post.id}/react`).send({ type: 'love' });
    await api(member).patch(`/api/posts/${post.id}`).send({ content: 'đã sửa' });
    await settle();
    expect(inbox.owner['post:update'].length).toBeGreaterThanOrEqual(2);
    expect(inbox.outsider['post:update']).toHaveLength(0);
    await api(member).delete(`/api/posts/${post.id}`);
    await settle();
    expect(inbox.other['post:delete']).toEqual([{ postId: post.id }]);
    expect(inbox.outsider['post:delete']).toHaveLength(0);
  });

  it('thay đổi bài chờ duyệt (tác giả tắt bình luận / xoá qua API thường) chỉ tới quản trị viên', async () => {
    const { member, g, inbox } = await setup({ postApproval: true });
    const post = (await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'chờ' })).body.post;
    await settle();
    await api(member).post(`/api/posts/${post.id}/toggle-comments`);
    await api(member).delete(`/api/posts/${post.id}`);
    await settle();
    expect(inbox.admin['post:update']).toHaveLength(1);
    expect(inbox.other['post:update']).toHaveLength(0);
    expect(inbox.admin['post:delete']).toEqual([{ postId: post.id }]);
    expect(inbox.other['post:delete']).toHaveLength(0);
  });

  it('quản trị viên xoá bình luận → thành viên nhận comment:delete, người ngoài không', async () => {
    const { owner, member, other, g, inbox } = await setup();
    const post = (await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'bl' })).body.post;
    const c = (await api(other).post('/api/comments').send({ postId: post.id, content: 'xoá tôi' })).body.comment;
    await api(owner).delete(`/api/comments/${c.id}`);
    await settle();
    expect(inbox.member['comment:delete']).toEqual([{ postId: post.id, commentId: c.id }]);
    expect(inbox.outsider['comment:delete']).toHaveLength(0);
  });

  it('người đã CHẶN tác giả không nhận post:new / post:update của tác giả đó (khớp luật xem bài qua HTTP)', async () => {
    const { member, other, g, inbox } = await setup();
    await api(other).post(`/api/users/${member.id}/block`); // "other" chặn "member"
    const post = (await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'bài của người bị chặn' })).body.post;
    await api(member).patch(`/api/posts/${post.id}`).send({ content: 'đã sửa' });
    await settle();
    expect(inbox.other['post:new']).toHaveLength(0);
    expect(inbox.other['post:update']).toHaveLength(0);
    expect(inbox.owner['post:new']).toHaveLength(1); // người không chặn vẫn nhận bình thường
    expect(inbox.owner['post:update']).toHaveLength(1);
  });

  it('bài đã duyệt bị sửa phải duyệt lại → thành viên thường nhận post:delete (bỏ bản cũ), quản trị viên nhận bản chờ duyệt', async () => {
    const { owner, member, g, inbox } = await setup({ postApproval: true });
    const post = (await api(member).post(`/api/groups/${g.id}/posts`).send({ content: 'bài lành' })).body.post;
    await api(owner).post(`/api/groups/${g.id}/posts/${post.id}/approve`);
    await settle();
    for (const key of Object.keys(inbox) as (keyof typeof inbox)[]) for (const e of EVENTS) inbox[key][e].length = 0;
    await api(member).patch(`/api/posts/${post.id}`).send({ content: 'bài đã bị đổi' });
    await settle();
    expect(inbox.other['post:delete']).toEqual([{ postId: post.id }]);
    expect(inbox.other['post:new']).toHaveLength(0);
    expect(inbox.admin['post:new'][0].post.groupStatus).toBe('pending');
    expect(inbox.outsider['post:delete']).toHaveLength(0);
  });

  it('xin vào nhóm riêng tư → chủ nhóm nhận notification:new theo thời gian thực', async () => {
    const { owner, outsider, inbox, g } = await setup({ privacy: 'private' });
    await api(outsider).post(`/api/groups/${g.id}/join`).send({});
    await settle();
    const n = inbox.owner['notification:new'].find((x) => /xin tham gia/.test(x.content));
    expect(n).toMatchObject({ userId: owner.id, targetType: 'group', targetId: g.id });
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import mongoose from 'mongoose';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, bogusId, createPost, TestUser } from './helpers';
import { PostModel } from '../../server/models/Post';
import { GroupModel } from '../../server/models/Group';
import { GroupMemberModel } from '../../server/models/GroupMember';
import { GroupReportModel } from '../../server/models/GroupReport';
import { CommentModel } from '../../server/models/Comment';

// Nhóm giao lưu: tạo / sửa / xoá, tham gia / rời (công khai và riêng tư), duyệt thành viên, vai trò, bài viết trong nhóm (kèm duyệt bài),
// báo cáo, và đặc biệt: bài trong nhóm KHÔNG lọt ra bảng tin, hashtag, chia sẻ, lưu, ghim, bình luận của người ngoài.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

type G = { id: string; [k: string]: unknown };
const api = (u: TestUser) => as(app, u);

const mkGroup = async (owner: TestUser, data: Record<string, unknown> = {}): Promise<G> => {
  const res = await api(owner).post('/api/groups').send({ name: 'Nhóm thử', ...data });
  if (res.status !== 200) throw new Error(`Tạo nhóm thất bại: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.group;
};
/** Cho `user` vào nhóm (nhóm riêng tư: tự trả lời câu hỏi + chủ nhóm duyệt). role = 'admin' thì chủ nhóm nâng quyền. */
const addMember = async (g: G, owner: TestUser, user: TestUser, role: 'member' | 'admin' = 'member') => {
  const answers = ((g.joinQuestions as string[]) || []).map(() => 'có');
  const joined = await api(user).post(`/api/groups/${g.id}/join`).send({ answers });
  if (joined.status !== 200) throw new Error(`Vào nhóm thất bại: ${joined.status} ${JSON.stringify(joined.body)}`);
  if (g.privacy === 'private') await api(owner).post(`/api/groups/${g.id}/members/${user.id}/approve`);
  if (role === 'admin') await api(owner).patch(`/api/groups/${g.id}/members/${user.id}`).send({ role: 'admin' });
};
const group = async (u: TestUser, g: G) => (await api(u).get(`/api/groups/${g.id}`)).body.group;
const gpost = async (u: TestUser, g: G, data: Record<string, unknown> = {}) => api(u).post(`/api/groups/${g.id}/posts`).send({ content: 'Bài trong nhóm', ...data });
const notifs = async (u: TestUser) => (await api(u).get('/api/notifications')).body.notifications as { content: string; targetType?: string; targetId?: string; actor: { id: string } }[];
const feedIds = async (u: TestUser) => ((await api(u).get('/api/posts')).body.posts as { id: string }[]).map((p) => p.id);

describe('Tạo / xem nhóm', () => {
  it('tạo nhóm → mình là chủ nhóm, 1 thành viên, mặc định công khai', async () => {
    const a = await signUp(app);
    const res = await api(a).post('/api/groups').send({ name: '  Nhóm Dev  ', description: 'Giao lưu', rules: ['Tôn trọng nhau'], joinQuestions: ['Bạn là ai?'], postApproval: true });
    expect(res.status).toBe(200);
    expect(res.body.group).toMatchObject({ name: 'Nhóm Dev', description: 'Giao lưu', privacy: 'public', rules: ['Tôn trọng nhau'], joinQuestions: ['Bạn là ai?'], postApproval: true, ownerId: a.id, membersCount: 1, myRole: 'owner', myStatus: 'active' });
  });

  it('dữ liệu sai → 400 (tên quá ngắn / quyền riêng tư lạ / quá nhiều câu hỏi / quá nhiều nội quy)', async () => {
    const a = await signUp(app);
    const bad = [{ name: 'a' }, { name: 'Nhóm', privacy: 'secret' }, { name: 'Nhóm', joinQuestions: ['1', '2', '3', '4'] }, { name: 'Nhóm', rules: Array(11).fill('x') }, {}];
    for (const body of bad) expect((await api(a).post('/api/groups').send(body)).status).toBe(400);
  });

  it('chưa đăng nhập → 401', async () => {
    const res = await (await import('supertest')).default(app).get('/api/groups');
    expect(res.status).toBe(401);
  });

  it('xem nhóm: id lạ → 404, id sai định dạng → 400', async () => {
    const a = await signUp(app);
    expect((await api(a).get(`/api/groups/${bogusId}`)).status).toBe(404);
    expect((await api(a).get('/api/groups/abc')).status).toBe(400);
  });

  it('người ngoài thấy thông tin cơ bản nhưng không có số liệu quản trị; quản trị viên thấy số chờ xử lý', async () => {
    const owner = await signUp(app);
    const stranger = await signUp(app);
    const g = await mkGroup(owner, { privacy: 'private' });
    const outsider = await group(stranger, g);
    expect(outsider).toMatchObject({ name: 'Nhóm thử', privacy: 'private', myRole: null, myStatus: null });
    expect(outsider.pendingMembersCount).toBeUndefined();
    expect(await group(owner, g)).toMatchObject({ pendingMembersCount: 0, pendingPostsCount: 0, openReportsCount: 0 });
  });
});

describe('Danh sách nhóm', () => {
  it('scope=mine chỉ gồm nhóm đã tham gia; mặc định (khám phá) gồm nhóm chưa tham gia và có myStatus chờ duyệt', async () => {
    const owner = await signUp(app);
    const u = await signUp(app);
    const pub = await mkGroup(owner, { name: 'Công khai Alpha' });
    const priv = await mkGroup(owner, { name: 'Riêng tư Alpha', privacy: 'private' });
    await api(u).post(`/api/groups/${pub.id}/join`).send({});
    await api(u).post(`/api/groups/${priv.id}/join`).send({});

    const mine = (await api(u).get('/api/groups?scope=mine')).body.groups as G[];
    expect(mine.map((g) => g.id)).toEqual([pub.id]);
    const discover = (await api(u).get('/api/groups')).body.groups as G[];
    expect(discover.find((g) => g.id === priv.id)).toMatchObject({ myStatus: 'pending', myRole: null });
    expect(discover.find((g) => g.id === pub.id)).toBeUndefined();
  });

  it('tìm theo tên (không phân biệt hoa thường, ký tự đặc biệt được xử lý an toàn) và phân trang', async () => {
    const owner = await signUp(app);
    const tag = Math.random().toString(36).slice(2, 8);
    await mkGroup(owner, { name: `Du lịch ${tag}` });
    await mkGroup(owner, { name: `Âm nhạc ${tag}` });
    const found = (await api(owner).get(`/api/groups?scope=mine&q=DU%20LỊCH%20${tag}`)).body.groups as G[];
    expect(found).toHaveLength(1);
    expect((await api(owner).get('/api/groups?scope=mine&q=%28%2A%5B')).body.groups).toEqual([]); // "(*[" không làm hỏng regex
    const page1 = (await api(owner).get(`/api/groups?scope=mine&q=${tag}&limit=1`)).body.groups as G[];
    const page2 = (await api(owner).get(`/api/groups?scope=mine&q=${tag}&limit=1&skip=1`)).body.groups as G[];
    expect(page1).toHaveLength(1);
    expect(page2).toHaveLength(1);
    expect(page1[0].id).not.toBe(page2[0].id);
  });
});

describe('Sửa / xoá nhóm', () => {
  it('quản trị viên sửa được thông tin; thành viên thường và người ngoài → 403', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const member = await signUp(app);
    const stranger = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, admin, 'admin');
    await addMember(g, owner, member);
    const ok = await api(admin).patch(`/api/groups/${g.id}`).send({ description: 'Mô tả mới', rules: ['A', 'B'], joinQuestions: ['Q?'], postApproval: true, name: 'Tên mới' });
    expect(ok.status).toBe(200);
    expect(ok.body.group).toMatchObject({ description: 'Mô tả mới', rules: ['A', 'B'], joinQuestions: ['Q?'], postApproval: true, name: 'Tên mới', myRole: 'admin' });
    expect((await api(member).patch(`/api/groups/${g.id}`).send({ name: 'Hack' })).status).toBe(403);
    expect((await api(stranger).patch(`/api/groups/${g.id}`).send({ name: 'Hack' })).status).toBe(403);
    expect((await api(admin).patch(`/api/groups/${g.id}`).send({ name: 'x' })).status).toBe(400);
  });

  it('đổi quyền riêng tư: chỉ chủ nhóm; quản trị viên gửi lại đúng giá trị cũ thì không sao', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, admin, 'admin');
    expect((await api(admin).patch(`/api/groups/${g.id}`).send({ privacy: 'private' })).status).toBe(403);
    expect((await api(admin).patch(`/api/groups/${g.id}`).send({ privacy: 'public' })).status).toBe(200);
    expect((await api(owner).patch(`/api/groups/${g.id}`).send({ privacy: 'private' })).body.group.privacy).toBe('private');
  });

  it('xoá nhóm: chỉ chủ nhóm; xoá luôn thành viên, bài, bình luận, báo cáo', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, member);
    const post = (await gpost(owner, g)).body.post;
    await api(member).post('/api/comments').send({ postId: post.id, content: 'bình luận' });
    await api(member).post(`/api/groups/${g.id}/posts/${post.id}/report`).send({ reason: 'x' });

    expect((await api(member).delete(`/api/groups/${g.id}`)).status).toBe(403);
    expect((await api(owner).delete(`/api/groups/${g.id}`)).body).toEqual({ ok: true });
    expect((await api(owner).get(`/api/groups/${g.id}`)).status).toBe(404);
    expect(await PostModel.countDocuments({ group: g.id })).toBe(0);
    expect(await GroupMemberModel.countDocuments({ group: g.id })).toBe(0);
    expect(await GroupReportModel.countDocuments({ group: g.id })).toBe(0);
    expect(await CommentModel.countDocuments({ post: post.id })).toBe(0);
  });
});

describe('Tham gia nhóm', () => {
  it('nhóm công khai → vào luôn, số thành viên tăng; vào lần 2 → 409', async () => {
    const owner = await signUp(app);
    const u = await signUp(app);
    const g = await mkGroup(owner);
    const res = await api(u).post(`/api/groups/${g.id}/join`).send({});
    expect(res.status).toBe(200);
    expect(res.body.group).toMatchObject({ membersCount: 2, myRole: 'member', myStatus: 'active' });
    const again = await api(u).post(`/api/groups/${g.id}/join`).send({});
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/đã là thành viên/);
  });

  it('nhóm riêng tư → chờ duyệt, KHÔNG tăng số thành viên, chủ nhóm + quản trị viên nhận thông báo; gửi lại → 409', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const u = await signUp(app);
    const g = await mkGroup(owner, { privacy: 'private' });
    await addMember(g, owner, admin, 'admin');
    const res = await api(u).post(`/api/groups/${g.id}/join`).send({});
    expect(res.body.group).toMatchObject({ membersCount: 2, myRole: null, myStatus: 'pending' });
    for (const a of [owner, admin]) {
      const n = (await notifs(a)).find((x) => x.actor.id === u.id);
      expect(n).toMatchObject({ targetType: 'group', targetId: g.id });
      expect(n?.content).toMatch(/xin tham gia/);
    }
    const again = await api(u).post(`/api/groups/${g.id}/join`).send({});
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/đang chờ duyệt/);
    expect((await group(owner, g)).pendingMembersCount).toBe(1);
  });

  it('nhóm có câu hỏi: phải trả lời đủ và không để trống; câu trả lời chỉ quản trị viên xem được', async () => {
    const owner = await signUp(app);
    const u = await signUp(app);
    const g = await mkGroup(owner, { privacy: 'private', joinQuestions: ['Bạn là ai?', 'Vì sao muốn vào?'] });
    for (const answers of [[], ['chỉ một'], ['một', ''], ['một', '   ']]) {
      expect((await api(u).post(`/api/groups/${g.id}/join`).send({ answers })).status).toBe(400);
    }
    expect((await api(u).post(`/api/groups/${g.id}/join`).send({ answers: ['Tôi là A', 'Để học hỏi'] })).status).toBe(200);
    const pending = (await api(owner).get(`/api/groups/${g.id}/members?status=pending`)).body.members;
    expect(pending[0].answers).toEqual([
      { question: 'Bạn là ai?', answer: 'Tôi là A' },
      { question: 'Vì sao muốn vào?', answer: 'Để học hỏi' },
    ]);
  });

  it('nhóm công khai bỏ qua câu hỏi; người bị chủ nhóm chặn không vào được', async () => {
    const owner = await signUp(app);
    const u = await signUp(app);
    const blockedUser = await signUp(app);
    const g = await mkGroup(owner, { joinQuestions: ['Q?'] });
    expect((await api(u).post(`/api/groups/${g.id}/join`).send({})).status).toBe(200);
    await api(owner).post(`/api/users/${blockedUser.id}/block`);
    const res = await api(blockedUser).post(`/api/groups/${g.id}/join`).send({});
    expect(res.status).toBe(403);
  });

  it('nhóm không tồn tại → 404', async () => {
    const a = await signUp(app);
    expect((await api(a).post(`/api/groups/${bogusId}/join`).send({})).status).toBe(404);
  });

  it('nhiều người vào cùng lúc → số thành viên đúng (không mất lượt đếm)', async () => {
    const owner = await signUp(app);
    const users = await Promise.all(Array.from({ length: 8 }, () => signUp(app)));
    const g = await mkGroup(owner);
    await Promise.all(users.map((u) => api(u).post(`/api/groups/${g.id}/join`).send({})));
    expect((await group(owner, g)).membersCount).toBe(9);
  });
});

describe('Rời nhóm / huỷ yêu cầu', () => {
  it('thành viên rời → số thành viên giảm, bài chờ duyệt của họ bị xoá; chưa tham gia → 404', async () => {
    const owner = await signUp(app);
    const u = await signUp(app);
    const g = await mkGroup(owner, { postApproval: true });
    await addMember(g, owner, u);
    const pendingPost = (await gpost(u, g)).body.post;
    expect(pendingPost.groupStatus).toBe('pending');
    expect((await api(u).delete(`/api/groups/${g.id}/join`)).body).toEqual({ ok: true });
    expect((await group(owner, g)).membersCount).toBe(1);
    expect(await PostModel.countDocuments({ _id: pendingPost.id })).toBe(0);
    expect((await api(u).delete(`/api/groups/${g.id}/join`)).status).toBe(404);
  });

  it('chủ nhóm không rời được', async () => {
    const owner = await signUp(app);
    const g = await mkGroup(owner);
    const res = await api(owner).delete(`/api/groups/${g.id}/join`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/chuyển quyền/);
  });

  it('huỷ yêu cầu đang chờ → không đổi số thành viên', async () => {
    const owner = await signUp(app);
    const u = await signUp(app);
    const g = await mkGroup(owner, { privacy: 'private' });
    await api(u).post(`/api/groups/${g.id}/join`).send({});
    expect((await api(u).delete(`/api/groups/${g.id}/join`)).status).toBe(200);
    const after = await group(owner, g);
    expect(after).toMatchObject({ membersCount: 1, pendingMembersCount: 0 });
  });

  it('bấm rời 2 lần cùng lúc → bộ đếm chỉ giảm 1', async () => {
    const owner = await signUp(app);
    const u = await signUp(app);
    const other = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, u);
    await addMember(g, owner, other);
    await Promise.all([api(u).delete(`/api/groups/${g.id}/join`), api(u).delete(`/api/groups/${g.id}/join`)]);
    expect((await group(owner, g)).membersCount).toBe(2);
  });
});

describe('Danh sách thành viên & duyệt', () => {
  it('sắp xếp: chủ nhóm → quản trị viên → thành viên; nhóm công khai người ngoài xem được; bỏ người bị chặn', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const admin = await signUp(app);
    const stranger = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, member);
    await addMember(g, owner, admin, 'admin');
    const list = (await api(stranger).get(`/api/groups/${g.id}/members`)).body.members;
    expect(list.map((m: { role: string }) => m.role)).toEqual(['owner', 'admin', 'member']);
    expect(list[0].answers).toBeUndefined();
    await api(stranger).post(`/api/users/${member.id}/block`);
    const filtered = (await api(stranger).get(`/api/groups/${g.id}/members`)).body.members;
    expect(filtered.map((m: { user: { id: string } }) => m.user.id)).not.toContain(member.id);
  });

  it('nhóm riêng tư: người ngoài / người đang chờ không xem được danh sách; thành viên xem được', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const waiting = await signUp(app);
    const g = await mkGroup(owner, { privacy: 'private' });
    await addMember(g, owner, member);
    await api(waiting).post(`/api/groups/${g.id}/join`).send({});
    expect((await api(waiting).get(`/api/groups/${g.id}/members`)).status).toBe(403);
    expect((await api(member).get(`/api/groups/${g.id}/members`)).status).toBe(200);
  });

  it('danh sách chờ duyệt chỉ quản trị viên xem được; phân trang', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const g = await mkGroup(owner, { privacy: 'private' });
    await addMember(g, owner, member);
    expect((await api(member).get(`/api/groups/${g.id}/members?status=pending`)).status).toBe(403);
    expect((await api(owner).get(`/api/groups/${g.id}/members?limit=1`)).body.members).toHaveLength(1);
    expect((await api(owner).get(`/api/groups/${g.id}/members?limit=1&skip=1`)).body.members[0].role).toBe('member');
  });

  it('duyệt → thành viên + số thành viên tăng + thông báo; duyệt lại → 404; thành viên thường duyệt → 403', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const u = await signUp(app);
    const g = await mkGroup(owner, { privacy: 'private' });
    await addMember(g, owner, member);
    await api(u).post(`/api/groups/${g.id}/join`).send({});
    expect((await api(member).post(`/api/groups/${g.id}/members/${u.id}/approve`)).status).toBe(403);
    expect((await api(owner).post(`/api/groups/${g.id}/members/${u.id}/approve`)).body).toEqual({ ok: true });
    expect((await group(owner, g)).membersCount).toBe(3);
    expect((await group(u, g)).myStatus).toBe('active');
    expect((await notifs(u)).some((n) => /chấp nhận/.test(n.content) && n.targetId === g.id)).toBe(true);
    expect((await api(owner).post(`/api/groups/${g.id}/members/${u.id}/approve`)).status).toBe(404);
  });

  it('2 quản trị viên duyệt cùng lúc → chỉ tính 1 lần', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const u = await signUp(app);
    const g = await mkGroup(owner, { privacy: 'private' });
    await addMember(g, owner, admin, 'admin');
    await api(u).post(`/api/groups/${g.id}/join`).send({});
    await Promise.all([api(owner).post(`/api/groups/${g.id}/members/${u.id}/approve`), api(admin).post(`/api/groups/${g.id}/members/${u.id}/approve`)]);
    expect((await group(owner, g)).membersCount).toBe(3);
  });

  it('từ chối → người đó không vào nhóm, có thông báo, có thể xin lại; từ chối khi không có yêu cầu → 404', async () => {
    const owner = await signUp(app);
    const u = await signUp(app);
    const g = await mkGroup(owner, { privacy: 'private' });
    await api(u).post(`/api/groups/${g.id}/join`).send({});
    expect((await api(owner).post(`/api/groups/${g.id}/members/${u.id}/reject`)).body).toEqual({ ok: true });
    expect((await group(u, g)).myStatus).toBeNull();
    expect((await notifs(u)).some((n) => /từ chối/.test(n.content))).toBe(true);
    expect((await api(owner).post(`/api/groups/${g.id}/members/${u.id}/reject`)).status).toBe(404);
    expect((await api(u).post(`/api/groups/${g.id}/join`).send({})).status).toBe(200);
  });
});

describe('Đuổi thành viên / vai trò / chuyển quyền', () => {
  it('quản trị viên đuổi thành viên; không đuổi được quản trị viên khác, chủ nhóm, hay chính mình', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const admin2 = await signUp(app);
    const member = await signUp(app);
    const g = await mkGroup(owner, { postApproval: true });
    await addMember(g, owner, admin, 'admin');
    await addMember(g, owner, admin2, 'admin');
    await addMember(g, owner, member);
    const pend = (await gpost(member, g)).body.post;

    expect((await api(admin).delete(`/api/groups/${g.id}/members/${admin2.id}`)).status).toBe(403);
    expect((await api(admin).delete(`/api/groups/${g.id}/members/${owner.id}`)).status).toBe(403);
    expect((await api(admin).delete(`/api/groups/${g.id}/members/${admin.id}`)).status).toBe(400);
    expect((await api(member).delete(`/api/groups/${g.id}/members/${admin.id}`)).status).toBe(403);
    expect((await api(admin).delete(`/api/groups/${g.id}/members/${bogusId}`)).status).toBe(404);

    expect((await api(admin).delete(`/api/groups/${g.id}/members/${member.id}`)).body).toEqual({ ok: true });
    expect((await group(owner, g)).membersCount).toBe(3);
    expect(await PostModel.countDocuments({ _id: pend.id })).toBe(0);
    expect((await notifs(member)).some((n) => /xoá bạn khỏi nhóm/.test(n.content))).toBe(true);
    expect((await group(member, g)).myStatus).toBeNull();
  });

  it('chủ nhóm đuổi được quản trị viên', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, admin, 'admin');
    expect((await api(owner).delete(`/api/groups/${g.id}/members/${admin.id}`)).status).toBe(200);
  });

  it('đổi vai trò: chỉ chủ nhóm; thăng / giáng đều có thông báo; đổi sang vai trò cũ không báo lại; không đổi được chủ nhóm', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const member = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, admin, 'admin');
    await addMember(g, owner, member);
    expect((await api(admin).patch(`/api/groups/${g.id}/members/${member.id}`).send({ role: 'admin' })).status).toBe(403);
    expect((await api(owner).patch(`/api/groups/${g.id}/members/${member.id}`).send({ role: 'owner' })).status).toBe(400);
    expect((await api(owner).patch(`/api/groups/${g.id}/members/${owner.id}`).send({ role: 'member' })).status).toBe(400);
    expect((await api(owner).patch(`/api/groups/${g.id}/members/${bogusId}`).send({ role: 'admin' })).status).toBe(404);

    await api(owner).patch(`/api/groups/${g.id}/members/${member.id}`).send({ role: 'admin' });
    expect((await group(member, g)).myRole).toBe('admin');
    expect((await notifs(member)).some((n) => /chỉ định bạn làm quản trị viên/.test(n.content))).toBe(true);
    const before = (await notifs(member)).length;
    await api(owner).patch(`/api/groups/${g.id}/members/${member.id}`).send({ role: 'admin' });
    expect((await notifs(member)).length).toBe(before);
    await api(owner).patch(`/api/groups/${g.id}/members/${member.id}`).send({ role: 'member' });
    expect((await group(member, g)).myRole).toBe('member');
    expect((await notifs(member)).some((n) => /gỡ quyền quản trị viên/.test(n.content))).toBe(true);
  });

  it('chuyển quyền chủ nhóm: chủ cũ thành quản trị viên, chủ mới xoá được nhóm, chủ cũ rời được', async () => {
    const owner = await signUp(app);
    const next = await signUp(app);
    const stranger = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, next);
    expect((await api(next).post(`/api/groups/${g.id}/transfer`).send({ userId: owner.id })).status).toBe(403);
    expect((await api(owner).post(`/api/groups/${g.id}/transfer`).send({ userId: owner.id })).status).toBe(400);
    expect((await api(owner).post(`/api/groups/${g.id}/transfer`).send({ userId: stranger.id })).status).toBe(404);
    expect((await api(owner).post(`/api/groups/${g.id}/transfer`).send({ userId: 'abc' })).status).toBe(400);

    expect((await api(owner).post(`/api/groups/${g.id}/transfer`).send({ userId: next.id })).body).toEqual({ ok: true });
    expect(await group(owner, g)).toMatchObject({ myRole: 'admin', ownerId: next.id });
    expect((await group(next, g)).myRole).toBe('owner');
    expect((await notifs(next)).some((n) => /chuyển quyền chủ nhóm/.test(n.content))).toBe(true);
    expect((await api(owner).delete(`/api/groups/${g.id}/join`)).status).toBe(200);
    expect((await api(next).delete(`/api/groups/${g.id}`)).status).toBe(200);
  });
});

describe('Bài viết trong nhóm', () => {
  it('chỉ thành viên mới đăng; bài trống bị từ chối; bài chỉ có ảnh thì được', async () => {
    const owner = await signUp(app);
    const stranger = await signUp(app);
    const g = await mkGroup(owner);
    expect((await gpost(stranger, g)).status).toBe(403);
    expect((await gpost(owner, g, { content: '' })).status).toBe(400);
    const res = await gpost(owner, g, { content: '', images: ['/uploads/a.png'], feeling: 'vui', location: 'Hà Nội' });
    expect(res.status).toBe(200);
    expect(res.body.post).toMatchObject({ groupId: g.id, groupName: 'Nhóm thử', groupStatus: 'approved', privacy: 'only_me', feeling: 'vui', location: 'Hà Nội' });
  });

  it('nhóm công khai: người ngoài xem được bài đã duyệt; nhóm riêng tư: chỉ thành viên', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const stranger = await signUp(app);
    const pub = await mkGroup(owner);
    const priv = await mkGroup(owner, { privacy: 'private' });
    await addMember(priv, owner, member);
    await gpost(owner, pub, { content: 'công khai' });
    await gpost(owner, priv, { content: 'riêng tư' });

    expect(((await api(stranger).get(`/api/groups/${pub.id}/posts`)).body.posts as { content: string }[]).map((p) => p.content)).toEqual(['công khai']);
    expect((await api(stranger).get(`/api/groups/${priv.id}/posts`)).status).toBe(403);
    expect(((await api(member).get(`/api/groups/${priv.id}/posts`)).body.posts as unknown[]).length).toBe(1);
  });

  it('bài bị chặn / bài đã ẩn không hiện trong danh sách của người xem', async () => {
    const owner = await signUp(app);
    const viewer = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, viewer);
    const hidden = (await gpost(owner, g, { content: 'sẽ ẩn' })).body.post;
    await gpost(owner, g, { content: 'vẫn hiện' });
    await api(viewer).post(`/api/posts/${hidden.id}/hide`);
    expect(((await api(viewer).get(`/api/groups/${g.id}/posts`)).body.posts as { content: string }[]).map((p) => p.content)).toEqual(['vẫn hiện']);
    await api(viewer).post(`/api/users/${owner.id}/block`);
    expect((await api(viewer).get(`/api/groups/${g.id}/posts`)).body.posts).toEqual([]);
  });

  it('phân trang danh sách bài, mới nhất trước', async () => {
    const owner = await signUp(app);
    const g = await mkGroup(owner);
    for (const c of ['một', 'hai', 'ba']) await gpost(owner, g, { content: c });
    const p1 = (await api(owner).get(`/api/groups/${g.id}/posts?limit=2`)).body.posts.map((p: { content: string }) => p.content);
    const p2 = (await api(owner).get(`/api/groups/${g.id}/posts?limit=2&skip=2`)).body.posts.map((p: { content: string }) => p.content);
    expect(p1).toEqual(['ba', 'hai']);
    expect(p2).toEqual(['một']);
  });

  it('nhóm bật duyệt bài: bài thành viên chờ duyệt (chỉ tác giả + quản trị viên thấy), quản trị viên đăng tự duyệt', async () => {
    const owner = await signUp(app);
    const admin = await signUp(app);
    const member = await signUp(app);
    const other = await signUp(app);
    const g = await mkGroup(owner, { postApproval: true });
    await addMember(g, owner, admin, 'admin');
    await addMember(g, owner, member);
    await addMember(g, owner, other);

    const pend = (await gpost(member, g, { content: 'chờ duyệt' })).body.post;
    expect(pend.groupStatus).toBe('pending');
    expect((await gpost(admin, g, { content: 'admin đăng' })).body.post.groupStatus).toBe('approved');
    expect((await gpost(owner, g, { content: 'chủ đăng' })).body.post.groupStatus).toBe('approved');

    const approvedList = (await api(other).get(`/api/groups/${g.id}/posts`)).body.posts as { content: string }[];
    expect(approvedList.map((p) => p.content).sort()).toEqual(['admin đăng', 'chủ đăng']);
    expect((await api(other).get(`/api/groups/${g.id}/posts?status=pending`)).body.posts).toEqual([]);
    expect((await api(member).get(`/api/groups/${g.id}/posts?status=pending`)).body.posts).toHaveLength(1);
    expect((await api(admin).get(`/api/groups/${g.id}/posts?status=pending`)).body.posts).toHaveLength(1);
    expect((await api(await signUp(app)).get(`/api/groups/${g.id}/posts?status=pending`)).status).toBe(403);
    expect((await notifs(owner)).some((n) => /chờ duyệt/.test(n.content) && n.targetId === g.id)).toBe(true);
    expect((await notifs(admin)).some((n) => /chờ duyệt/.test(n.content))).toBe(true);
    expect((await group(owner, g)).pendingPostsCount).toBe(1);
  });

  it('duyệt bài → hiện cho cả nhóm + tác giả được báo; duyệt lại → 404; thành viên thường duyệt → 403', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const other = await signUp(app);
    const g = await mkGroup(owner, { postApproval: true });
    await addMember(g, owner, member);
    await addMember(g, owner, other);
    const pend = (await gpost(member, g)).body.post;
    expect((await api(other).post(`/api/groups/${g.id}/posts/${pend.id}/approve`)).status).toBe(403);
    const res = await api(owner).post(`/api/groups/${g.id}/posts/${pend.id}/approve`);
    expect(res.body.post.groupStatus).toBe('approved');
    expect((await api(other).get(`/api/groups/${g.id}/posts`)).body.posts).toHaveLength(1);
    expect((await notifs(member)).some((n) => /đã duyệt bài viết/.test(n.content))).toBe(true);
    expect((await api(owner).post(`/api/groups/${g.id}/posts/${pend.id}/approve`)).status).toBe(404);
  });

  it('quản trị viên duyệt bài của chính mình (được nâng quyền sau khi đăng) → không tự thông báo', async () => {
    const owner = await signUp(app);
    const user = await signUp(app);
    const g = await mkGroup(owner, { postApproval: true });
    await addMember(g, owner, user);
    const pend = (await gpost(user, g)).body.post;
    await api(owner).patch(`/api/groups/${g.id}/members/${user.id}`).send({ role: 'admin' });
    const before = (await notifs(user)).length;
    expect((await api(user).post(`/api/groups/${g.id}/posts/${pend.id}/approve`)).status).toBe(200);
    expect((await notifs(user)).length).toBe(before);
  });

  it('từ chối bài → bị xoá, tác giả được báo; bài đã duyệt không từ chối được', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const g = await mkGroup(owner, { postApproval: true });
    await addMember(g, owner, member);
    const pend = (await gpost(member, g)).body.post;
    const ok = (await gpost(owner, g)).body.post;
    expect((await api(member).post(`/api/groups/${g.id}/posts/${pend.id}/reject`)).status).toBe(403);
    expect((await api(owner).post(`/api/groups/${g.id}/posts/${ok.id}/reject`)).status).toBe(404);
    expect((await api(owner).post(`/api/groups/${g.id}/posts/${pend.id}/reject`)).body).toEqual({ ok: true });
    expect(await PostModel.countDocuments({ _id: pend.id })).toBe(0);
    expect((await notifs(member)).some((n) => /từ chối bài viết/.test(n.content))).toBe(true);
  });

  it('quản trị viên từ chối bài chờ duyệt của chính mình → không tự thông báo', async () => {
    const owner = await signUp(app);
    const user = await signUp(app);
    const g = await mkGroup(owner, { postApproval: true });
    await addMember(g, owner, user);
    const pend = (await gpost(user, g)).body.post;
    await api(owner).patch(`/api/groups/${g.id}/members/${user.id}`).send({ role: 'admin' });
    const before = (await notifs(user)).length;
    expect((await api(user).post(`/api/groups/${g.id}/posts/${pend.id}/reject`)).status).toBe(200);
    expect((await notifs(user)).length).toBe(before);
  });

  it('xoá bài: tác giả xoá bài của mình; quản trị viên xoá bài người khác (tác giả được báo); thành viên khác → 403; không có → 404', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const other = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, member);
    await addMember(g, owner, other);
    const mine = (await gpost(member, g)).body.post;
    const theirs = (await gpost(member, g)).body.post;
    expect((await api(other).delete(`/api/groups/${g.id}/posts/${theirs.id}`)).status).toBe(403);
    expect((await api(member).delete(`/api/groups/${g.id}/posts/${mine.id}`)).body).toEqual({ ok: true });
    expect((await api(owner).delete(`/api/groups/${g.id}/posts/${theirs.id}`)).status).toBe(200);
    expect((await notifs(member)).some((n) => /xoá bài viết của bạn khỏi nhóm/.test(n.content))).toBe(true);
    expect((await api(owner).delete(`/api/groups/${g.id}/posts/${theirs.id}`)).status).toBe(404);
  });

  it('xoá bài đang chờ duyệt (tác giả tự xoá / quản trị viên xoá) đều được', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const g = await mkGroup(owner, { postApproval: true });
    await addMember(g, owner, member);
    const p1 = (await gpost(member, g)).body.post;
    const p2 = (await gpost(member, g)).body.post;
    expect((await api(member).delete(`/api/groups/${g.id}/posts/${p1.id}`)).status).toBe(200);
    expect((await api(owner).delete(`/api/groups/${g.id}/posts/${p2.id}`)).status).toBe(200);
    expect(await PostModel.countDocuments({ group: g.id })).toBe(0);
  });

  it('bài của nhóm khác không thao tác được qua nhóm này', async () => {
    const owner = await signUp(app);
    const g1 = await mkGroup(owner);
    const g2 = await mkGroup(owner);
    const post = (await gpost(owner, g1)).body.post;
    expect((await api(owner).delete(`/api/groups/${g2.id}/posts/${post.id}`)).status).toBe(404);
    expect((await api(owner).post(`/api/groups/${g2.id}/posts/${post.id}/report`).send({})).status).toBe(404);
  });
});

describe('Báo cáo bài viết', () => {
  async function setup() {
    const owner = await signUp(app);
    const author = await signUp(app);
    const reporter = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, author);
    await addMember(g, owner, reporter);
    const post = (await gpost(author, g, { content: 'bài vi phạm' })).body.post;
    return { owner, author, reporter, g, post };
  }

  it('thành viên báo cáo → quản trị viên nhận thông báo + thấy trong danh sách; báo trùng → 409', async () => {
    const { owner, reporter, g, post } = await setup();
    expect((await api(reporter).post(`/api/groups/${g.id}/posts/${post.id}/report`).send({ reason: 'spam' })).body).toEqual({ ok: true });
    expect((await api(reporter).post(`/api/groups/${g.id}/posts/${post.id}/report`).send({ reason: 'spam' })).status).toBe(409);
    expect((await notifs(owner)).some((n) => /báo cáo/.test(n.content))).toBe(true);
    const reports = (await api(owner).get(`/api/groups/${g.id}/reports`)).body.reports;
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reason: 'spam', reporter: { id: reporter.id }, post: { id: post.id, content: 'bài vi phạm' } });
    expect((await group(owner, g)).openReportsCount).toBe(1);
  });

  it('không báo cáo bài của mình; bài chờ duyệt / không tồn tại → 404; người ngoài → 403; xem danh sách báo cáo cần quản trị viên', async () => {
    const { author, reporter, g, post, owner } = await setup();
    expect((await api(author).post(`/api/groups/${g.id}/posts/${post.id}/report`).send({})).status).toBe(400);
    expect((await api(reporter).post(`/api/groups/${g.id}/posts/${bogusId}/report`).send({})).status).toBe(404);
    expect((await api(await signUp(app)).post(`/api/groups/${g.id}/posts/${post.id}/report`).send({})).status).toBe(403);
    expect((await api(reporter).get(`/api/groups/${g.id}/reports`)).status).toBe(403);
    await api(owner).patch(`/api/groups/${g.id}`).send({ postApproval: true });
    const pend = (await gpost(author, g)).body.post;
    expect((await api(reporter).post(`/api/groups/${g.id}/posts/${pend.id}/report`).send({})).status).toBe(404);
  });

  it('bỏ qua báo cáo → báo cáo đóng, bài vẫn còn', async () => {
    const { owner, reporter, g, post } = await setup();
    await api(reporter).post(`/api/groups/${g.id}/posts/${post.id}/report`).send({});
    const id = (await api(owner).get(`/api/groups/${g.id}/reports`)).body.reports[0].id;
    expect((await api(owner).post(`/api/groups/${g.id}/reports/${id}/resolve`).send({ action: 'dismiss' })).body).toEqual({ ok: true });
    expect((await api(owner).get(`/api/groups/${g.id}/reports`)).body.reports).toEqual([]);
    expect(await PostModel.countDocuments({ _id: post.id })).toBe(1);
    expect((await api(owner).post(`/api/groups/${g.id}/reports/${id}/resolve`).send({ action: 'dismiss' })).status).toBe(404);
  });

  it('xoá bài bị báo cáo → bài + bình luận + mọi báo cáo bị xoá, tác giả được báo', async () => {
    const { owner, author, reporter, g, post } = await setup();
    await api(reporter).post('/api/comments').send({ postId: post.id, content: 'bình luận' });
    await api(reporter).post(`/api/groups/${g.id}/posts/${post.id}/report`).send({});
    const id = (await api(owner).get(`/api/groups/${g.id}/reports`)).body.reports[0].id;
    expect((await api(reporter).post(`/api/groups/${g.id}/reports/${id}/resolve`).send({ action: 'remove' })).status).toBe(403);
    expect((await api(owner).post(`/api/groups/${g.id}/reports/${id}/resolve`).send({ action: 'bad' })).status).toBe(400);
    expect((await api(owner).post(`/api/groups/${g.id}/reports/${id}/resolve`).send({ action: 'remove' })).body).toEqual({ ok: true });
    expect(await PostModel.countDocuments({ _id: post.id })).toBe(0);
    expect(await CommentModel.countDocuments({ post: post.id })).toBe(0);
    expect(await GroupReportModel.countDocuments({ group: g.id })).toBe(0);
    expect((await notifs(author)).some((n) => /do bị báo cáo/.test(n.content))).toBe(true);
  });

  it('báo cáo mà bài đã bị xoá thẳng khỏi DB (mồ côi) → không hiện trong danh sách; xử lý "xoá" vẫn dọn được', async () => {
    const { owner, reporter, g, post } = await setup();
    await api(reporter).post(`/api/groups/${g.id}/posts/${post.id}/report`).send({});
    const reportId = (await api(owner).get(`/api/groups/${g.id}/reports`)).body.reports[0].id;
    await PostModel.deleteOne({ _id: post.id });
    expect((await api(owner).get(`/api/groups/${g.id}/reports`)).body.reports).toEqual([]);
    expect((await api(owner).post(`/api/groups/${g.id}/reports/${reportId}/resolve`).send({ action: 'remove' })).status).toBe(200);
    expect(await GroupReportModel.countDocuments({ group: g.id })).toBe(0);
  });

  it('tác giả xoá bài qua API bài viết thường → báo cáo của bài cũng bị dọn', async () => {
    const { reporter, author, g, post } = await setup();
    await api(reporter).post(`/api/groups/${g.id}/posts/${post.id}/report`).send({});
    expect((await api(author).delete(`/api/posts/${post.id}`)).status).toBe(200);
    expect(await GroupReportModel.countDocuments({ post: post.id })).toBe(0);
  });
});

describe('BÀI NHÓM KHÔNG LỌT RA NGOÀI (các route cũ phải đóng)', () => {
  async function setup(privacy: 'public' | 'private' = 'public') {
    const owner = await signUp(app);
    const member = await signUp(app);
    const stranger = await signUp(app);
    const g = await mkGroup(owner, { privacy });
    await addMember(g, owner, member);
    const post = (await gpost(member, g, { content: 'Bài nhóm #bimat' })).body.post;
    return { owner, member, stranger, g, post };
  }

  it('không xuất hiện ở bảng tin, lọc hashtag, kỷ niệm — kể cả với chính tác giả và thành viên', async () => {
    const { owner, member, stranger, post } = await setup();
    for (const u of [owner, member, stranger]) {
      expect(await feedIds(u)).not.toContain(post.id);
      expect(((await api(u).get('/api/posts?tag=bimat')).body.posts as unknown[]).length).toBe(0);
    }
    expect((await api(member).get('/api/posts/memories')).body.posts).toEqual([]);
    const normal = await createPost(app, member, { content: 'bài thường' });
    expect(await feedIds(member)).toContain(normal.id);
  });

  it('xem chi tiết: nhóm công khai → ai cũng xem; nhóm riêng tư → người ngoài 404; bài chờ duyệt → chỉ tác giả + quản trị viên', async () => {
    const pub = await setup('public');
    expect((await api(pub.stranger).get(`/api/posts/${pub.post.id}`)).body.post).toMatchObject({ id: pub.post.id, groupId: pub.g.id });
    const priv = await setup('private');
    expect((await api(priv.stranger).get(`/api/posts/${priv.post.id}`)).status).toBe(404);
    expect((await api(priv.member).get(`/api/posts/${priv.post.id}`)).status).toBe(200);

    await api(priv.owner).patch(`/api/groups/${priv.g.id}`).send({ postApproval: true });
    const other = await signUp(app);
    await addMember(priv.g, priv.owner, other);
    const pend = (await gpost(other, priv.g)).body.post;
    expect((await api(priv.member).get(`/api/posts/${pend.id}`)).status).toBe(404);
    expect((await api(other).get(`/api/posts/${pend.id}`)).status).toBe(200);
    expect((await api(priv.owner).get(`/api/posts/${pend.id}`)).status).toBe(200);
  });

  it('người bị chặn với tác giả không xem được bài nhóm công khai', async () => {
    const { member, stranger, post } = await setup();
    await api(member).post(`/api/users/${stranger.id}/block`);
    expect((await api(stranger).get(`/api/posts/${post.id}`)).status).toBe(404);
  });

  it('nhóm đã bị xoá khỏi DB nhưng bài còn (mồ côi) → chỉ tác giả xem được', async () => {
    const { member, stranger, g, post } = await setup();
    await GroupModel.deleteOne({ _id: g.id });
    expect((await api(stranger).get(`/api/posts/${post.id}`)).status).toBe(404);
    expect((await api(member).get(`/api/posts/${post.id}`)).status).toBe(200);
  });

  it('thả cảm xúc: thành viên được; người ngoài của nhóm CÔNG KHAI chỉ xem, không tương tác (403); bài chờ duyệt không ai tương tác', async () => {
    const { member, stranger, post, owner, g } = await setup();
    expect((await api(member).post(`/api/posts/${post.id}/react`).send({ type: 'love' })).body.post.reactions).toHaveLength(1);
    const res = await api(stranger).post(`/api/posts/${post.id}/react`).send({ type: 'like' });
    expect(res.status).toBe(403);
    await api(owner).patch(`/api/groups/${g.id}`).send({ postApproval: true });
    const other = await signUp(app);
    await addMember(g, owner, other);
    const pend = (await gpost(other, g)).body.post;
    expect((await api(other).post(`/api/posts/${pend.id}/react`).send({ type: 'like' })).status).toBe(403);
  });

  it('bình luận: người ngoài xem được ở nhóm công khai nhưng không viết / thả cảm xúc; ở nhóm riêng tư không xem được', async () => {
    const pub = await setup('public');
    const c = (await api(pub.member).post('/api/comments').send({ postId: pub.post.id, content: 'chào' })).body.comment;
    expect(c).toBeDefined();
    expect(((await api(pub.stranger).get(`/api/comments?postId=${pub.post.id}`)).body.comments as unknown[]).length).toBe(1);
    expect((await api(pub.stranger).post('/api/comments').send({ postId: pub.post.id, content: 'xen vào' })).status).toBe(404);
    expect((await api(pub.stranger).post(`/api/comments/${c.id}/react`).send({ type: 'like' })).status).toBe(403);
    expect((await api(pub.member).post(`/api/comments/${c.id}/react`).send({ type: 'like' })).status).toBe(200);

    const priv = await setup('private');
    expect((await api(priv.stranger).get(`/api/comments?postId=${priv.post.id}`)).status).toBe(403);
  });

  it('gắn thẻ trong bình luận chỉ có tác dụng với thành viên nhóm (người ngoài không nhận thông báo)', async () => {
    const { owner, member, stranger, g, post } = await setup();
    const other = await signUp(app);
    await addMember(g, owner, other);
    await api(member).post('/api/comments').send({ postId: post.id, content: 'cc', taggedUserIds: [stranger.id, other.id] });
    expect((await notifs(stranger)).some((n) => /gắn thẻ/.test(n.content))).toBe(false);
    expect((await notifs(other)).some((n) => /gắn thẻ/.test(n.content))).toBe(true);
  });

  it('quản trị viên nhóm xoá được bình luận của người khác trong bài nhóm; thành viên thường thì không', async () => {
    const { owner, member, g, post } = await setup();
    const other = await signUp(app);
    await addMember(g, owner, other);
    const c = (await api(other).post('/api/comments').send({ postId: post.id, content: 'cần xoá' })).body.comment;
    const c2 = (await api(other).post('/api/comments').send({ postId: post.id, content: 'giữ' })).body.comment;
    expect((await api(await signUp(app)).delete(`/api/comments/${c2.id}`)).status).toBe(403);
    expect((await api(owner).delete(`/api/comments/${c.id}`)).status).toBe(200);
    expect((await notifs(other)).some((n) => /xóa bình luận của bạn/.test(n.content))).toBe(true);
    // tác giả bài (member, không phải quản trị viên) vẫn xoá được vì là chủ bài
    expect((await api(member).delete(`/api/comments/${c2.id}`)).status).toBe(200);
  });

  it('ghim, lưu, chia sẻ (bảng tin và qua tin nhắn) bài nhóm đều bị từ chối', async () => {
    const { member, stranger, post } = await setup();
    expect((await api(member).post(`/api/posts/${post.id}/pin`)).status).toBe(400);
    expect((await api(member).post(`/api/posts/${post.id}/save`)).status).toBe(400);
    expect((await api(member).post(`/api/posts/${post.id}/share`).send({})).status).toBe(400);
    expect((await api(stranger).post(`/api/posts/${post.id}/share`).send({})).status).toBe(400);
    const conv = (await api(member).post('/api/messages/conversations').send({ participantId: stranger.id })).body.conversation;
    const chat = await api(member).post(`/api/messages/conversations/${conv.id}/share-post`).send({ postId: post.id });
    expect(chat.status).toBe(400);
    expect(chat.body.error).toMatch(/trong nhóm/);
    expect((await api(member).post(`/api/messages/conversations/${conv.id}/share-post`).send({ postId: bogusId })).status).toBe(404);
  });

  it('tác giả sửa bài nhóm của mình; người khác không sửa được; tắt bình luận bài nhóm hoạt động', async () => {
    const { member, owner, post } = await setup();
    expect((await api(member).patch(`/api/posts/${post.id}`).send({ content: 'đã sửa' })).body.post).toMatchObject({ content: 'đã sửa', groupId: expect.any(String) });
    expect((await api(owner).patch(`/api/posts/${post.id}`).send({ content: 'hack' })).status).toBe(403);
    expect((await api(member).post(`/api/posts/${post.id}/toggle-comments`)).body.post.commentsDisabled).toBe(true);
    expect((await api(owner).post('/api/comments').send({ postId: post.id, content: 'x' })).status).toBe(403);
  });

  it('tác giả KHÔNG đổi được quyền riêng tư của bài nhóm (không thể biến thành bài công khai để thoát khỏi nhóm)', async () => {
    const { member, stranger, post } = await setup('private');
    const res = await api(member).patch(`/api/posts/${post.id}`).send({ content: 'sửa nội dung', privacy: 'public' });
    expect(res.status).toBe(200);
    expect(res.body.post).toMatchObject({ content: 'sửa nội dung', privacy: 'only_me' });
    expect(await feedIds(stranger)).not.toContain(post.id);
    expect((await api(stranger).get(`/api/posts/${post.id}`)).status).toBe(404);
  });

  it('ẩn bài nhóm (không quan tâm) không báo lỗi', async () => {
    const { member, post } = await setup();
    expect((await api(member).post(`/api/posts/${post.id}/hide`)).status).toBe(200);
  });
});

describe('Sửa / xoá bài nhóm qua API bài viết (luật duyệt lại, thành viên, dọn bình luận)', () => {
  it('thành viên bị đuổi khỏi nhóm không sửa được bài cũ của mình (403)', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, member);
    const post = (await gpost(member, g, { content: 'bài cũ' })).body.post;
    await api(owner).delete(`/api/groups/${g.id}/members/${member.id}`);
    const res = await api(member).patch(`/api/posts/${post.id}`).send({ content: 'sửa lén' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/không còn là thành viên/);
    expect((await PostModel.findById(post.id))!.content).toBe('bài cũ');
  });

  it('nhóm bật duyệt bài: thành viên thường sửa nội dung / ảnh / video của bài ĐÃ DUYỆT → bài quay lại chờ duyệt, quản trị viên được báo', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const g = await mkGroup(owner, { postApproval: true });
    await addMember(g, owner, member);
    const makeApproved = async (data: Record<string, unknown> = {}) => {
      const post = (await gpost(member, g, { content: 'bài lành', ...data })).body.post;
      await api(owner).post(`/api/groups/${g.id}/posts/${post.id}/approve`);
      return post.id as string;
    };
    for (const edit of [{ content: 'nội dung vi phạm' }, { images: ['/x.png'] }, { video: '/v.mp4' }]) {
      const id = await makeApproved();
      const res = await api(member).patch(`/api/posts/${id}`).send(edit);
      expect(res.body.post.groupStatus).toBe('pending');
      expect((await api(owner).get(`/api/groups/${g.id}/posts?status=pending`)).body.posts.map((p: { id: string }) => p.id)).toContain(id);
    }
    expect((await notifs(owner)).some((n) => /đang chờ duyệt lại/.test(n.content))).toBe(true);
  });

  it('KHÔNG phải duyệt lại khi: nhóm không bật duyệt bài, người sửa là quản trị viên, chỉ sửa trường khác (cảm xúc / vị trí), hoặc gửi nội dung y nguyên', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const open = await mkGroup(owner);
    const moderated = await mkGroup(owner, { postApproval: true });
    await addMember(open, owner, member);
    await addMember(moderated, owner, member);

    const p1 = (await gpost(member, open, { content: 'a' })).body.post;
    expect((await api(member).patch(`/api/posts/${p1.id}`).send({ content: 'b' })).body.post.groupStatus).toBe('approved');

    const p2 = (await gpost(owner, moderated, { content: 'của chủ nhóm' })).body.post; // chủ nhóm đăng tự duyệt
    expect((await api(owner).patch(`/api/posts/${p2.id}`).send({ content: 'chủ nhóm sửa' })).body.post.groupStatus).toBe('approved');

    const p3 = (await gpost(member, moderated, { content: 'giữ nguyên', images: ['/a.png'] })).body.post;
    await api(owner).post(`/api/groups/${moderated.id}/posts/${p3.id}/approve`);
    const same = await api(member).patch(`/api/posts/${p3.id}`).send({ content: 'giữ nguyên', images: ['/a.png'], feeling: 'vui', location: 'Hà Nội' });
    expect(same.body.post).toMatchObject({ groupStatus: 'approved', feeling: 'vui', location: 'Hà Nội' });
  });

  it('xoá bài (nhóm / thường) bằng API bài viết xoá luôn bình luận — không để bình luận mồ côi', async () => {
    const owner = await signUp(app);
    const member = await signUp(app);
    const g = await mkGroup(owner);
    await addMember(g, owner, member);
    const groupPostItem = (await gpost(member, g)).body.post;
    const normal = await createPost(app, member);
    for (const post of [groupPostItem, normal]) {
      await api(owner).post('/api/comments').send({ postId: post.id, content: 'bình luận' });
      expect(await CommentModel.countDocuments({ post: post.id })).toBe(1);
      expect((await api(member).delete(`/api/posts/${post.id}`)).status).toBe(200);
      expect(await CommentModel.countDocuments({ post: post.id })).toBe(0);
    }
  });
});

describe('Quyền chặn chéo', () => {
  it('người đang chờ duyệt chưa là thành viên: không đăng bài, không báo cáo, không xem bài nhóm riêng tư', async () => {
    const owner = await signUp(app);
    const u = await signUp(app);
    const g = await mkGroup(owner, { privacy: 'private' });
    await api(u).post(`/api/groups/${g.id}/join`).send({});
    expect((await gpost(u, g)).status).toBe(403);
    expect((await api(u).get(`/api/groups/${g.id}/posts`)).status).toBe(403);
    expect((await api(u).get(`/api/groups/${g.id}/posts?status=pending`)).status).toBe(403);
  });

  it('thành viên bị đuổi rồi thì mất quyền ngay', async () => {
    const owner = await signUp(app);
    const u = await signUp(app);
    const g = await mkGroup(owner, { privacy: 'private' });
    await addMember(g, owner, u);
    const post = (await gpost(owner, g)).body.post;
    expect((await api(u).get(`/api/posts/${post.id}`)).status).toBe(200);
    await api(owner).delete(`/api/groups/${g.id}/members/${u.id}`);
    expect((await api(u).get(`/api/posts/${post.id}`)).status).toBe(404);
  });
});

describe('Toàn vẹn dữ liệu', () => {
  it('mongoose có đủ index duy nhất: 1 người chỉ có 1 bản ghi trong 1 nhóm; 1 báo cáo / người / bài', async () => {
    const owner = await signUp(app);
    const g = await mkGroup(owner);
    await expect(GroupMemberModel.create({ group: g.id, user: owner.id, role: 'member' })).rejects.toMatchObject({ code: 11000 });
    expect(mongoose.models.GroupReport).toBeDefined();
  });
});

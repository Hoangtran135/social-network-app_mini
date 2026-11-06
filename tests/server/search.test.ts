import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, createPost, TestUser } from './helpers';
import { PostModel } from '../../server/models/Post';
import { UserModel } from '../../server/models/User';

// Tìm kiếm tổng hợp: người + nhóm + trang + bài viết, CHỈ gồm thứ được phép thấy và xếp hạng theo quan hệ xã hội
// (bạn bè, đang theo dõi, bạn chung, nhóm đã tham gia, trang đang theo dõi...), kèm "reasons" giải thích.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const api = (u: TestUser) => as(app, u);
const uniq = () => Math.random().toString(36).slice(2, 9);
const named = async (name: string) => {
  const u = await signUp(app, name);
  await api(u).patch('/api/users/me').send({ name });
  return { ...u, name };
};
const search = async (u: TestUser, q: string, extra = '') => (await api(u).get(`/api/search?q=${encodeURIComponent(q)}${extra}`)).body as {
  query: string;
  people: { user: { id: string; name: string }; reasons: string[] }[];
  groups: { group: { id: string; name: string; myStatus: string | null }; reasons: string[] }[];
  pages: { page: { id: string; name: string }; reasons: string[] }[];
  posts: { post: { id: string; content: string }; reasons: string[] }[];
};
const mkGroup = async (owner: TestUser, data: Record<string, unknown>) => (await api(owner).post('/api/groups').send(data)).body.group as { id: string };
const mkPage = async (owner: TestUser, data: Record<string, unknown>) => (await api(owner).post('/api/pages').send(data)).body.page as { id: string };

describe('Cơ bản', () => {
  it('chưa đăng nhập → 401; từ khoá rỗng / toàn dấu cách → kết quả rỗng', async () => {
    expect((await (await import('supertest')).default(app).get('/api/search?q=a')).status).toBe(401);
    const a = await signUp(app);
    for (const q of ['', '   ']) expect(await search(a, q)).toEqual({ query: '', people: [], groups: [], pages: [], posts: [] });
    expect((await api(a).get('/api/search')).body.people).toEqual([]);
  });

  it('trả về cả 4 loại cùng lúc', async () => {
    const t = uniq();
    const a = await signUp(app);
    const b = await named(`Hoa ${t}`);
    await mkGroup(b, { name: `Nhóm Hoa ${t}` });
    await mkPage(b, { name: `Trang Hoa ${t}` });
    await createPost(app, b, { content: `Bài về hoa ${t}` });
    const res = await search(a, t);
    expect(res.query).toBe(t);
    expect(res.people.map((x) => x.user.name)).toEqual([`Hoa ${t}`]);
    expect(res.groups).toHaveLength(1);
    expect(res.pages).toHaveLength(1);
    expect(res.posts).toHaveLength(1);
  });

  it('không phân biệt hoa thường; ký tự đặc biệt không làm hỏng; từ khoá quá dài được cắt; type lạ coi như "tất cả"', async () => {
    const t = uniq();
    const a = await signUp(app);
    const b = await named(`Minh ${t}`);
    expect((await search(a, `MINH ${t.toUpperCase()}`)).people.map((x) => x.user.id)).toEqual([b.id]);
    expect((await search(a, '(*[')).people).toEqual([]);
    expect((await search(a, 'x'.repeat(500))).query).toHaveLength(100);
    expect((await search(a, t, '&type=banana')).people).toHaveLength(1);
  });

  it('KHÔNG tìm theo email và KHÔNG lộ email trong kết quả', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    // Phần tên miền "@test.vn" chỉ có trong email, không có trong tên / username → nếu tìm được nghĩa là đang khớp theo email
    expect((await search(a, '@test.vn')).people).toEqual([]);
    expect((await api(a).get('/api/users?q=%40test.vn')).body.users).toEqual([]);
    expect(JSON.stringify(await search(a, b.name))).not.toContain('@test.vn');
  });

  it('API người dùng khác không còn trả email; chính mình vẫn thấy email của mình', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    expect((await api(a).get(`/api/users/${b.id}`)).body.user).not.toHaveProperty('email');
    expect((await api(a).get('/api/auth/me')).body.user).toMatchObject({ email: a.email });
  });
});

describe('Người — xếp hạng theo quan hệ', () => {
  it('bạn bè > đang theo dõi > có bạn chung > người lạ; kèm lý do', async () => {
    const t = uniq();
    const me = await signUp(app);
    const mutualFriend = await signUp(app);
    const friend = await named(`An ${t} bạn`);
    const followed = await named(`An ${t} theo dõi`);
    const mutual = await named(`An ${t} chung`);
    const stranger = await named(`An ${t} lạ`);
    await befriend(app, me, friend);
    await befriend(app, me, mutualFriend);
    await befriend(app, mutualFriend, mutual);
    await api(me).post(`/api/users/${followed.id}/follow`);
    const res = await search(me, `An ${t}`);
    expect(res.people.map((p) => p.user.id)).toEqual([friend.id, followed.id, mutual.id, stranger.id]);
    expect(res.people.map((p) => p.reasons)).toEqual([['Bạn bè'], ['Đang theo dõi'], ['1 bạn chung'], []]);
  });

  it('nhiều bạn chung hơn → lên trước', async () => {
    const t = uniq();
    const me = await signUp(app);
    const f1 = await signUp(app);
    const f2 = await signUp(app);
    const fewer = await named(`Lan ${t} một`);
    const more = await named(`Lan ${t} hai`);
    await befriend(app, me, f1);
    await befriend(app, me, f2);
    await befriend(app, f1, fewer);
    await befriend(app, f1, more);
    await befriend(app, f2, more);
    const res = await search(me, `Lan ${t}`);
    expect(res.people.map((p) => p.user.id)).toEqual([more.id, fewer.id]);
    expect(res.people[0].reasons).toEqual(['2 bạn chung']);
  });

  it('bạn chung được đếm đúng bất kể quan hệ bạn bè được lưu theo chiều nào (người gửi lời mời là A hay B)', async () => {
    const t = uniq();
    const me = await signUp(app);
    const bridge = await signUp(app);
    const c1 = await named(`Kim ${t} một`);
    const c2 = await named(`Kim ${t} hai`);
    await befriend(app, me, bridge);
    await befriend(app, bridge, c1); // cầu nối gửi lời mời
    await befriend(app, c2, bridge); // ứng viên gửi lời mời
    const res = await search(me, `Kim ${t}`);
    expect(res.people.map((p) => p.reasons)).toEqual([['1 bạn chung'], ['1 bạn chung']]);
  });

  it('khớp tên chính xác / bắt đầu bằng từ khoá xếp trước kết quả chỉ chứa từ khoá (cùng quan hệ)', async () => {
    const t = uniq();
    const me = await signUp(app);
    const contains = await named(`Xin ${t}binh`);
    const prefix = await named(`${t}binh Xin`);
    const res = await search(me, `${t}binh`);
    expect(res.people.map((p) => p.user.id)).toEqual([prefix.id, contains.id]);
  });

  it('không gồm chính mình và người bị chặn (cả 2 chiều)', async () => {
    const t = uniq();
    const me = await named(`Tôi ${t}`);
    const iBlocked = await named(`Tôi ${t} chặn`);
    const blockedMe = await named(`Tôi ${t} bị chặn`);
    const ok = await named(`Tôi ${t} ổn`);
    await api(me).post(`/api/users/${iBlocked.id}/block`);
    await api(blockedMe).post(`/api/users/${me.id}/block`);
    expect((await search(me, `Tôi ${t}`)).people.map((p) => p.user.id)).toEqual([ok.id]);
  });

  it('tìm theo username; người đang online được cộng điểm nhẹ (không vượt qua quan hệ bạn bè)', async () => {
    const t = uniq();
    const me = await signUp(app);
    const friend = await named(`Bạn ${t}`);
    await befriend(app, me, friend);
    const stranger = await named(`Bạn ${t} xa`);
    const res = await search(me, `Bạn ${t}`);
    expect(res.people[0].user.id).toBe(friend.id);
    expect((await search(me, stranger.username)).people[0].user.id).toBe(stranger.id);
  });
});

describe('Nhóm', () => {
  it('nhóm của tôi lên trước; nhóm có bạn bè đã tham gia kế tiếp; hiện lý do', async () => {
    const t = uniq();
    const me = await signUp(app);
    const friend = await signUp(app);
    const owner = await signUp(app);
    await befriend(app, me, friend);
    const mine = await mkGroup(owner, { name: `Du lịch ${t} của tôi` });
    const withFriend = await mkGroup(owner, { name: `Du lịch ${t} có bạn` });
    const other = await mkGroup(owner, { name: `Du lịch ${t} khác` });
    await api(me).post(`/api/groups/${mine.id}/join`).send({});
    await api(friend).post(`/api/groups/${withFriend.id}/join`).send({});
    const res = await search(me, `Du lịch ${t}`);
    expect(res.groups.map((g) => g.group.id)).toEqual([mine.id, withFriend.id, other.id]);
    expect(res.groups.map((g) => g.reasons)).toEqual([['Nhóm của bạn'], ['1 bạn bè đã tham gia'], []]);
    expect(res.groups[0].group.myStatus).toBe('active');
  });

  it('yêu cầu đang chờ được nhắc; nhóm riêng tư chỉ khớp theo TÊN (mô tả kín không bị lộ), nhóm công khai khớp cả mô tả', async () => {
    const t = uniq();
    const me = await signUp(app);
    const owner = await signUp(app);
    const secret = await mkGroup(owner, { name: 'Nhóm kín', privacy: 'private', description: `bí mật ${t}` });
    const open = await mkGroup(owner, { name: 'Nhóm mở', privacy: 'public', description: `chủ đề ${t}` });
    const named = await mkGroup(owner, { name: `Tên ${t} riêng`, privacy: 'private' });
    await api(me).post(`/api/groups/${named.id}/join`).send({});
    const res = await search(me, t);
    const ids = res.groups.map((g) => g.group.id);
    expect(ids).not.toContain(secret.id);
    expect(ids).toContain(open.id);
    expect(res.groups.find((g) => g.group.id === named.id)!.reasons).toEqual(['Đã gửi yêu cầu tham gia']);
  });

  it('một loại: tối đa 20 + phân trang; "tất cả": tối đa 5 mỗi loại', async () => {
    const t = uniq();
    const me = await signUp(app);
    const owner = await signUp(app);
    for (let i = 0; i < 7; i++) await mkGroup(owner, { name: `Nhóm ${t} ${i}` });
    expect((await search(me, t)).groups).toHaveLength(5);
    expect((await search(me, t, '&type=groups')).groups).toHaveLength(7);
    expect((await search(me, t, '&type=groups&limit=3')).groups).toHaveLength(3);
    expect((await search(me, t, '&type=groups&limit=3&skip=6')).groups).toHaveLength(1);
    expect((await search(me, t, '&type=groups')).people).toEqual([]); // loại khác bị bỏ qua
  });
});

describe('Trang', () => {
  it('trang tôi quản trị / đang theo dõi lên trước, rồi trang có bạn bè theo dõi; không gồm trang không khớp', async () => {
    const t = uniq();
    const me = await signUp(app);
    const friend = await signUp(app);
    const owner = await signUp(app);
    await befriend(app, me, friend);
    const mine = await mkPage(me, { name: `Cửa hàng ${t} của tôi` });
    const followed = await mkPage(owner, { name: `Cửa hàng ${t} theo dõi` });
    const friendsFollow = await mkPage(owner, { name: `Cửa hàng ${t} bạn thích` });
    const nobody = await mkPage(owner, { name: `Cửa hàng ${t} vô danh` });
    await mkPage(owner, { name: 'Hoàn toàn khác' });
    await api(me).post(`/api/pages/${followed.id}/follow`);
    await api(friend).post(`/api/pages/${friendsFollow.id}/follow`);
    const res = await search(me, `Cửa hàng ${t}`);
    expect(res.pages.slice(0, 2).map((p) => p.page.id).sort()).toEqual([mine.id, followed.id].sort());
    expect(res.pages.map((p) => p.page.id).slice(2)).toEqual([friendsFollow.id, nobody.id]);
    expect(res.pages.find((p) => p.page.id === mine.id)!.reasons).toEqual(['Bạn quản trị']);
    expect(res.pages.find((p) => p.page.id === followed.id)!.reasons).toEqual(['Đang theo dõi']);
    expect(res.pages.find((p) => p.page.id === friendsFollow.id)!.reasons).toEqual(['1 bạn bè theo dõi']);
  });

  it('khớp cả mô tả của trang', async () => {
    const t = uniq();
    const me = await signUp(app);
    const owner = await signUp(app);
    const pg = await mkPage(owner, { name: 'Tiệm', description: `Bán đồ ${t}` });
    expect((await search(me, t)).pages.map((p) => p.page.id)).toEqual([pg.id]);
  });
});

describe('Bài viết — quyền riêng tư', () => {
  it('chỉ trả bài được phép xem: công khai ai cũng thấy; bạn bè chỉ bạn bè; chỉ mình tôi chỉ chủ bài; người bị chặn không', async () => {
    const t = uniq();
    const author = await signUp(app);
    const friend = await signUp(app);
    const stranger = await signUp(app);
    const blocker = await signUp(app);
    await befriend(app, author, friend);
    await createPost(app, author, { content: `công khai ${t}`, privacy: 'public' });
    await createPost(app, author, { content: `bạn bè ${t}`, privacy: 'friends' });
    await createPost(app, author, { content: `riêng tư ${t}`, privacy: 'only_me' });
    await api(blocker).post(`/api/users/${author.id}/block`);
    const texts = async (u: TestUser) => (await search(u, t, '&type=posts')).posts.map((p) => p.post.content).sort();
    expect(await texts(author)).toEqual([`bạn bè ${t}`, `công khai ${t}`, `riêng tư ${t}`]);
    expect(await texts(friend)).toEqual([`bạn bè ${t}`, `công khai ${t}`]);
    expect(await texts(stranger)).toEqual([`công khai ${t}`]);
    expect(await texts(blocker)).toEqual([]);
  });

  it('bài trong nhóm: nhóm công khai ai cũng thấy; nhóm riêng tư chỉ thành viên; bài chờ duyệt không xuất hiện; nhóm bị xoá thì biến mất', async () => {
    const t = uniq();
    const owner = await signUp(app);
    const member = await signUp(app);
    const stranger = await signUp(app);
    const pub = await mkGroup(owner, { name: 'Công khai' });
    const priv = await mkGroup(owner, { name: 'Riêng tư', privacy: 'private' });
    const approval = await mkGroup(owner, { name: 'Duyệt bài', postApproval: true });
    await api(member).post(`/api/groups/${pub.id}/join`).send({});
    await api(member).post(`/api/groups/${approval.id}/join`).send({});
    await api(member).post(`/api/groups/${priv.id}/join`).send({});
    await api(owner).post(`/api/groups/${priv.id}/members/${member.id}/approve`);
    await api(owner).post(`/api/groups/${pub.id}/posts`).send({ content: `trong nhóm mở ${t}` });
    await api(owner).post(`/api/groups/${priv.id}/posts`).send({ content: `trong nhóm kín ${t}` });
    await api(member).post(`/api/groups/${approval.id}/posts`).send({ content: `chờ duyệt ${t}` });
    const texts = async (u: TestUser) => (await search(u, t, '&type=posts')).posts.map((p) => p.post.content).sort();
    expect(await texts(stranger)).toEqual([`trong nhóm mở ${t}`]);
    expect(await texts(member)).toEqual([`trong nhóm kín ${t}`, `trong nhóm mở ${t}`]);
    const mine = (await search(member, t, '&type=posts')).posts.find((p) => p.post.content.includes('kín'))!;
    expect(mine.reasons).toContain('Trong nhóm của bạn');
    await api(owner).delete(`/api/groups/${pub.id}`);
    expect(await texts(stranger)).toEqual([]);
  });

  it('bài trong nhóm của tác giả bị chặn bị loại; bài đã ẩn không xuất hiện', async () => {
    const t = uniq();
    const owner = await signUp(app);
    const viewer = await signUp(app);
    const g = await mkGroup(owner, { name: 'Mở' });
    await api(viewer).post(`/api/groups/${g.id}/join`).send({});
    const post = (await api(owner).post(`/api/groups/${g.id}/posts`).send({ content: `bị ẩn ${t}` })).body.post;
    await createPost(app, owner, { content: `bài thường ${t}` });
    await api(viewer).post(`/api/posts/${post.id}/hide`);
    expect((await search(viewer, t, '&type=posts')).posts.map((p) => p.post.content)).toEqual([`bài thường ${t}`]);
    await api(viewer).post(`/api/users/${owner.id}/block`);
    expect((await search(viewer, t, '&type=posts')).posts).toEqual([]);
  });
});

describe('Bài viết — xếp hạng & hashtag', () => {
  it('bài của bạn bè > người đang theo dõi > người lạ, dù người lạ đăng sau; kèm lý do', async () => {
    const t = uniq();
    const me = await signUp(app);
    const friend = await signUp(app);
    const followed = await signUp(app);
    const stranger = await signUp(app);
    await befriend(app, me, friend);
    await api(me).post(`/api/users/${followed.id}/follow`);
    await createPost(app, friend, { content: `của bạn ${t}` });
    await createPost(app, followed, { content: `của người theo dõi ${t}` });
    await createPost(app, stranger, { content: `của người lạ ${t}` });
    const res = await search(me, t, '&type=posts');
    expect(res.posts.map((p) => p.post.content)).toEqual([`của bạn ${t}`, `của người theo dõi ${t}`, `của người lạ ${t}`]);
    expect(res.posts.map((p) => p.reasons)).toEqual([['Bạn bè'], ['Đang theo dõi'], []]);
  });

  it('bài từ trang đang theo dõi được ưu tiên và có lý do', async () => {
    const t = uniq();
    const me = await signUp(app);
    const owner = await signUp(app);
    const stranger = await signUp(app);
    const pg = await mkPage(owner, { name: 'Trang tin' });
    await api(me).post(`/api/pages/${pg.id}/follow`);
    await createPost(app, stranger, { content: `người lạ ${t}` });
    await api(owner).post(`/api/pages/${pg.id}/posts`).send({ content: `từ trang ${t}` });
    const res = await search(me, t, '&type=posts');
    expect(res.posts[0].post.content).toBe(`từ trang ${t}`);
    expect(res.posts[0].reasons).toEqual(['Từ trang bạn theo dõi']);
  });

  it('tìm "#hashtag" ra bài có hashtag đó (kể cả không chứa chữ trong nội dung); reel được đánh dấu', async () => {
    const t = uniq();
    const me = await signUp(app);
    const a = await signUp(app);
    await createPost(app, a, { content: `Đi chơi #tag${t} vui` });
    await api(a).post('/api/reels').send({ video: '/v.mp4', caption: `Reel #tag${t}` });
    const res = await search(me, `#tag${t}`, '&type=posts');
    expect(res.posts).toHaveLength(2);
    expect(res.posts.some((p) => p.reasons.includes('Reel'))).toBe(true);
  });

  it('bài tương tác nhiều và mới hơn xếp trước (cùng quan hệ)', async () => {
    const t = uniq();
    const me = await signUp(app);
    const a = await signUp(app);
    const fans = await Promise.all([1, 2, 3].map(() => signUp(app)));
    const popular = await createPost(app, a, { content: `phổ biến ${t}` });
    await createPost(app, a, { content: `bình thường ${t}` });
    for (const f of fans) await api(f).post(`/api/posts/${popular.id}/react`).send({ type: 'like' });
    expect((await search(me, t, '&type=posts')).posts[0].post.content).toBe(`phổ biến ${t}`);
  });

  it('phân trang kết quả bài viết', async () => {
    const t = uniq();
    const me = await signUp(app);
    const a = await signUp(app);
    for (let i = 0; i < 4; i++) await createPost(app, a, { content: `bài ${t} ${i}` });
    const p1 = (await search(me, t, '&type=posts&limit=3')).posts.map((p) => p.post.id);
    const p2 = (await search(me, t, '&type=posts&limit=3&skip=3')).posts.map((p) => p.post.id);
    expect(p1).toHaveLength(3);
    expect(p2).toHaveLength(1);
    expect(new Set([...p1, ...p2]).size).toBe(4);
  });
});

describe('Quy mô lớn (hồi quy: lọc quyền xem trong truy vấn, không cắt ứng viên rồi mới lọc)', () => {
  it('hơn 300 bài MỚI HƠN mà người tìm không được xem (riêng tư / bạn bè) không che mất bài công khai cũ hơn', async () => {
    const t = uniq();
    const author = await signUp(app);
    const viewer = await signUp(app);
    const visible = await createPost(app, author, { content: `bài xem được ${t}` }); // cũ nhất
    await new Promise((r) => setTimeout(r, 20));
    const now = Date.now();
    await PostModel.insertMany(
      Array.from({ length: 320 }, (_, i) => ({ author: author.id, content: `bài ẩn ${t} ${i}`, privacy: i % 2 ? 'only_me' : 'friends', createdAt: new Date(now + i) }))
    );
    const res = await search(viewer, t, '&type=posts');
    expect(res.posts.map((p) => p.post.id)).toEqual([visible.id]);
  });

  it('hơn 300 người lạ trùng từ khoá không che mất BẠN BÈ (bạn bè luôn được xét và xếp đầu)', async () => {
    const t = uniq();
    const me = await signUp(app);
    const friend = await named(`Zed ${t} bạn`);
    await befriend(app, me, friend);
    await UserModel.insertMany(Array.from({ length: 320 }, (_, i) => ({ name: `Zed ${t} lạ ${i}`, username: `zed_${t}_${i}`, email: `zed_${t}_${i}@seed.local`, passwordHash: 'x', joinDate: new Date(Date.now() + i * 1000) })));
    const res = await search(me, `Zed ${t}`, '&type=people');
    expect(res.people[0].user.id).toBe(friend.id);
    expect(res.people[0].reasons).toEqual(['Bạn bè']);
  });

  it('chỉ gõ "#" (hoặc "# ") → không có bài viết nào (không khớp mọi bài)', async () => {
    const me = await signUp(app);
    await createPost(app, me, { content: 'một bài bất kỳ' });
    for (const q of ['#', '# ', '#   ']) expect((await search(me, q, '&type=posts')).posts).toEqual([]);
    expect((await search(me, '#', '')).posts).toEqual([]);
  });
});

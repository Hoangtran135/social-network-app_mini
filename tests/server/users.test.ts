import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { UserModel } from '../../server/models/User';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, createPost, bogusId, TestUser } from './helpers';

// Test người dùng: hồ sơ, tìm kiếm, sửa hồ sơ, chặn / bỏ chặn và ảnh hưởng của việc chặn.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

describe('Xem hồ sơ', () => {
  it('xem hồ sơ người khác → có thông tin công khai, không lộ mật khẩu / token đặt lại', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const res = await as(app, a).get(`/api/users/${b.id}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: b.id, name: b.name, username: b.username });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|resetToken|blockedUsers/);
  });

  it('id không tồn tại → 404', async () => {
    const a = await signUp(app);
    expect((await as(app, a).get(`/api/users/${bogusId}`)).status).toBe(404);
  });

  it('id sai định dạng → 400 (không treo / không 500)', async () => {
    const a = await signUp(app);
    const res = await as(app, a).get('/api/users/khong-phai-id');
    expect(res.status).toBe(400);
  });

  it('chưa đăng nhập → 401', async () => {
    const a = await signUp(app);
    const { default: request } = await import('supertest');
    expect((await request(app).get(`/api/users/${a.id}`)).status).toBe(401);
  });
});

describe('Tìm kiếm người dùng', () => {
  let a: TestUser;
  let target: TestUser;
  beforeAll(async () => {
    a = await signUp(app, 'Searcher');
    target = await signUp(app, 'Zebrafish');
    await UserModel.updateOne({ _id: target.id }, { name: 'Trần Thị Zebrafish Đặng' });
  });

  it('tìm theo tên (không phân biệt hoa thường)', async () => {
    const res = await as(app, a).get('/api/users?q=zEbRaFiSh');
    expect(res.body.users.map((u: { id: string }) => u.id)).toContain(target.id);
  });

  it('tìm theo username', async () => {
    const res = await as(app, a).get(`/api/users?q=${encodeURIComponent(target.username)}`);
    expect(res.body.users.map((u: { id: string }) => u.id)).toContain(target.id);
  });

  it('tìm có dấu tiếng Việt', async () => {
    const res = await as(app, a).get(`/api/users?q=${encodeURIComponent('Đặng')}`);
    expect(res.body.users.map((u: { id: string }) => u.id)).toContain(target.id);
  });

  it('không có kết quả → mảng rỗng, total = 0', async () => {
    const res = await as(app, a).get('/api/users?q=khongaicotenv_xyz123');
    expect(res.body.users).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('ký tự đặc biệt của regex được coi là chữ thường, không gây lỗi / không khớp tất cả', async () => {
    for (const q of ['.*', '(', '[', '\\', '$^', '+++']) {
      const res = await as(app, a).get(`/api/users?q=${encodeURIComponent(q)}`);
      expect(res.status, `q=${q}`).toBe(200);
      expect(res.body.users).toEqual([]);
    }
  });

  it('limit / skip hoạt động; limit quá lớn bị chặn ở 100; skip âm không gây lỗi', async () => {
    for (let i = 0; i < 3; i++) await signUp(app, 'Pager');
    const two = await as(app, a).get('/api/users?q=Pager&limit=2');
    expect(two.body.users).toHaveLength(2);
    expect(two.body.total).toBeGreaterThanOrEqual(3);
    const skipped = await as(app, a).get('/api/users?q=Pager&limit=2&skip=2');
    expect(skipped.body.users.length).toBeGreaterThanOrEqual(1);
    expect((await as(app, a).get('/api/users?limit=99999')).body.users.length).toBeLessThanOrEqual(100);
    expect((await as(app, a).get('/api/users?skip=-5')).status).toBe(200);
  });

  it('người bị chặn (cả hai chiều) không xuất hiện trong kết quả tìm kiếm', async () => {
    const hidden = await signUp(app, 'Hiddenperson');
    const hiddenBy = await signUp(app, 'Hiddenbyperson');
    await as(app, a).post(`/api/users/${hidden.id}/block`);
    await as(app, hiddenBy).post(`/api/users/${a.id}/block`);
    const r1 = await as(app, a).get('/api/users?q=Hiddenperson');
    const r2 = await as(app, a).get('/api/users?q=Hiddenbyperson');
    expect(r1.body.users).toEqual([]);
    expect(r2.body.users).toEqual([]);
  });

  it('kết quả không chứa mật khẩu', async () => {
    const res = await as(app, a).get('/api/users?q=Zebrafish');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });
});

describe('Sửa hồ sơ', () => {
  it('sửa các trường được phép', async () => {
    const u = await signUp(app);
    const res = await as(app, u).patch('/api/users/me').send({ name: 'Tên mới', bio: 'Tiểu sử mới', workplace: 'FPT', education: 'Bách Khoa', location: 'Hà Nội', website: 'https://a.vn' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Tên mới', bio: 'Tiểu sử mới', workplace: 'FPT', education: 'Bách Khoa', location: 'Hà Nội', website: 'https://a.vn' });
    const me = await as(app, u).get('/api/auth/me');
    expect(me.body.user.name).toBe('Tên mới');
  });

  it('không thể đổi username / email / mật khẩu / danh sách chặn qua API sửa hồ sơ (chống mass-assignment)', async () => {
    const u = await signUp(app);
    const other = await signUp(app);
    const res = await as(app, u).patch('/api/users/me').send({ username: 'hacker', email: 'hack@test.vn', passwordHash: 'x', blockedUsers: [other.id], isOnline: false });
    expect(res.status).toBe(200);
    const doc = await UserModel.findById(u.id);
    expect(doc.username).toBe(u.username);
    expect(doc.email).toBe(u.email);
    expect(doc.passwordHash).not.toBe('x');
    expect(doc.blockedUsers).toHaveLength(0);
  });

  it.each([
    ['tên rỗng', { name: '' }],
    ['tiểu sử quá dài', { bio: 'x'.repeat(501) }],
    ['nơi làm việc quá dài', { workplace: 'x'.repeat(151) }],
    ['website quá dài', { website: 'x'.repeat(301) }],
  ])('từ chối: %s → 400', async (_l, body) => {
    const u = await signUp(app);
    expect((await as(app, u).patch('/api/users/me').send(body)).status).toBe(400);
  });

  it('cắt khoảng trắng và cho phép xoá trống tiểu sử', async () => {
    const u = await signUp(app);
    await as(app, u).patch('/api/users/me').send({ bio: 'abc' });
    const res = await as(app, u).patch('/api/users/me').send({ bio: '   ' });
    expect(res.body.user.bio).toBe('');
  });
});

describe('Chặn / bỏ chặn', () => {
  it('chặn → có trong danh sách chặn của mình', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const res = await as(app, a).post(`/api/users/${b.id}/block`);
    expect(res.status).toBe(200);
    expect(res.body.user.blockedUserIds).toContain(b.id);
    const list = await as(app, a).get('/api/users/me/blocked');
    expect(list.body.users.map((u: { id: string }) => u.id)).toEqual([b.id]);
  });

  it('chặn nhiều lần không bị trùng', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/block`);
    const res = await as(app, a).post(`/api/users/${b.id}/block`);
    expect(res.body.user.blockedUserIds.filter((id: string) => id === b.id)).toHaveLength(1);
  });

  it('không thể tự chặn chính mình → 400', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post(`/api/users/${a.id}/block`)).status).toBe(400);
  });

  it('chặn người không tồn tại → 404; id sai định dạng → 400', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post(`/api/users/${bogusId}/block`)).status).toBe(404);
    expect((await as(app, a).post('/api/users/abc/block')).status).toBe(400);
  });

  it('chặn bạn bè → tự huỷ kết bạn và xoá lời mời đang chờ', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    await befriend(app, a, b);
    await as(app, c).post('/api/friends/requests').send({ targetUserId: a.id });
    await as(app, a).post(`/api/users/${b.id}/block`);
    await as(app, a).post(`/api/users/${c.id}/block`);
    expect((await as(app, a).get('/api/friends')).body.friends).toEqual([]);
    expect((await as(app, a).get('/api/friends/requests')).body.requests).toEqual([]);
  });

  it('sau khi chặn: hai bên không xem được hồ sơ của nhau (404)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/block`);
    expect((await as(app, a).get(`/api/users/${b.id}`)).status).toBe(404);
    expect((await as(app, b).get(`/api/users/${a.id}`)).status).toBe(404);
  });

  it('sau khi chặn: bài viết của nhau biến mất khỏi bảng tin', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await createPost(app, b, { content: 'bài của b' });
    await as(app, a).post(`/api/users/${b.id}/block`);
    const feed = await as(app, a).get('/api/posts');
    expect(feed.body.posts.some((p: { author: { id: string } }) => p.author.id === b.id)).toBe(false);
  });

  it('sau khi chặn: không gửi được lời mời kết bạn, không nhắn tin được', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await as(app, a).post('/api/messages/conversations').send({ participantId: b.id });
    await as(app, a).post(`/api/users/${b.id}/block`);
    expect((await as(app, b).post('/api/friends/requests').send({ targetUserId: a.id })).status).toBe(403);
    expect((await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id })).status).toBe(403);
    expect((await as(app, b).post(`/api/messages/conversations/${conv.body.conversation.id}/messages`).send({ content: 'hi' })).status).toBe(403);
    expect((await as(app, a).post(`/api/messages/conversations/${conv.body.conversation.id}/messages`).send({ content: 'hi' })).status).toBe(403);
  });

  it('bỏ chặn → xem lại được hồ sơ; bỏ chặn người chưa chặn không lỗi', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/block`);
    const res = await as(app, a).delete(`/api/users/${b.id}/block`);
    expect(res.status).toBe(200);
    expect(res.body.user.blockedUserIds).not.toContain(b.id);
    expect((await as(app, a).get(`/api/users/${b.id}`)).status).toBe(200);
    expect((await as(app, a).delete(`/api/users/${b.id}/block`)).status).toBe(200);
  });

  it('bị chặn không thể tự "bỏ chặn" ngược lại để thấy người chặn mình', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, a).post(`/api/users/${b.id}/block`);
    await as(app, b).delete(`/api/users/${a.id}/block`); // b không chặn a nên không có tác dụng
    expect((await as(app, b).get(`/api/users/${a.id}`)).status).toBe(404);
  });
});

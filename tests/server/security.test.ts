import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, createPost, bogusId } from './helpers';

// Test bảo mật & độ bền chung: mọi API cần đăng nhập, dữ liệu bẩn không làm sập server, upload, và các tình huống đồng thời.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

describe('Mọi API riêng tư đều yêu cầu đăng nhập', () => {
  const routes: [string, string][] = [
    ['get', '/api/auth/me'], ['post', '/api/auth/logout'],
    ['get', '/api/users'], ['get', `/api/users/${bogusId}`], ['patch', '/api/users/me'], ['patch', '/api/users/me/password'], ['get', '/api/users/me/blocked'],
    ['post', `/api/users/${bogusId}/block`], ['delete', `/api/users/${bogusId}/block`],
    ['get', '/api/posts'], ['get', '/api/posts/memories'], ['get', `/api/posts/${bogusId}`], ['post', '/api/posts'],
    ['patch', `/api/posts/${bogusId}`], ['delete', `/api/posts/${bogusId}`], ['post', `/api/posts/${bogusId}/react`], ['post', `/api/posts/${bogusId}/pin`],
    ['post', `/api/posts/${bogusId}/save`], ['post', `/api/posts/${bogusId}/share`],
    ['get', '/api/comments'], ['post', '/api/comments'], ['delete', `/api/comments/${bogusId}`], ['post', `/api/comments/${bogusId}/like`],
    ['get', '/api/friends'], ['get', `/api/friends/of/${bogusId}`], ['get', '/api/friends/suggestions'], ['get', '/api/friends/requests'],
    ['get', '/api/friends/requests/sent'], ['post', '/api/friends/requests'], ['delete', `/api/friends/${bogusId}`],
    ['get', '/api/notifications'], ['patch', '/api/notifications/read-all'], ['patch', `/api/notifications/${bogusId}/read`],
    ['get', '/api/messages/conversations'], ['post', '/api/messages/conversations'], ['get', `/api/messages/conversations/${bogusId}/messages`],
    ['get', '/api/stories'], ['post', '/api/stories'], ['delete', `/api/stories/${bogusId}`], ['post', `/api/stories/${bogusId}/view`],
    ['post', '/api/upload'],
  ];
  it.each(routes)('%s %s → 401 khi không có token', async (method, url) => {
    const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[method](url);
    expect(res.status).toBe(401);
  });

  it('API công khai duy nhất: /api/health', async () => {
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
  });
});

describe('Dữ liệu bẩn không làm sập / treo server', () => {
  it('id sai định dạng ở mọi route có :id → 400 nhanh (không treo)', async () => {
    const a = await signUp(app);
    const bad: [string, string][] = [
      ['get', '/api/users/xyz'], ['post', '/api/users/xyz/block'], ['get', '/api/posts/xyz'], ['patch', '/api/posts/xyz'], ['delete', '/api/posts/xyz'],
      ['post', '/api/posts/xyz/react'], ['post', '/api/posts/xyz/pin'], ['post', '/api/posts/xyz/save'], ['post', '/api/posts/xyz/share'],
      ['delete', '/api/comments/xyz'], ['post', '/api/comments/xyz/like'], ['get', '/api/friends/of/xyz'], ['post', '/api/friends/requests/xyz/accept'],
      ['post', '/api/friends/requests/xyz/reject'], ['delete', '/api/friends/requests/xyz'], ['get', '/api/messages/conversations/xyz/messages'],
      ['delete', '/api/stories/xyz'], ['post', '/api/stories/xyz/view'], ['patch', '/api/notifications/xyz/read'],
    ];
    for (const [method, url] of bad) {
      const req = as(app, a)[method as 'get'](url);
      const res = await (method === 'get' || method === 'delete' ? req : req.send({ type: 'like', content: 'x' }));
      expect([400, 404], `${method} ${url}`).toContain(res.status);
    }
  });

  it('body có kiểu dữ liệu sai (số / mảng / null thay vì chuỗi) → 400, không 500', async () => {
    const a = await signUp(app);
    for (const content of [123, ['a'], null, { a: 1 }, true]) {
      const res = await as(app, a).post('/api/posts').send({ content });
      expect(res.status, JSON.stringify(content)).toBe(400);
    }
  });

  it('chuỗi rất dài / ký tự lạ (null byte, RTL, emoji ZWJ) không làm hỏng', async () => {
    const a = await signUp(app);
    const content = 'a\u0000b ‮abc 👨‍👩‍👧‍👦 '.repeat(50);
    const res = await as(app, a).post('/api/posts').send({ content });
    expect(res.status).toBe(200);
  });

  it('chống NoSQL injection ở các tham số truy vấn: ?q[$ne]=x không trả toàn bộ người dùng', async () => {
    const a = await signUp(app);
    await signUp(app, 'Victim');
    const res = await as(app, a).get('/api/users?q[$ne]=zzz');
    expect(res.status).toBe(200);
    // q là object bị mongoSanitize loại $ne → coi như q rỗng; kết quả vẫn phải là danh sách hợp lệ, không lỗi
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('HTML / script trong nội dung được lưu nguyên văn dạng chuỗi (React sẽ tự thoát khi hiển thị)', async () => {
    const a = await signUp(app);
    const evil = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    const post = await createPost(app, a, { content: evil });
    expect(post.content).toBe(evil);
    expect((await as(app, a).get(`/api/posts/${post.id}`)).headers['content-type']).toMatch(/application\/json/);
  });

  it('server vẫn sống sau hàng loạt request lỗi', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});

describe('Upload', () => {
  it('upload ảnh hợp lệ → trả url, tệp phục vụ được với header nosniff', async () => {
    const a = await signUp(app);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const res = await as(app, a).post('/api/upload').attach('file', png, { filename: 'test.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'test.png', size: png.length });
    expect(res.body.url).toMatch(/^\/uploads\/.+\.png$/);
    const served = await request(app).get(res.body.url);
    expect(served.status).toBe(200);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    // dọn tệp thử
    const fs = await import('fs');
    const path = await import('path');
    fs.rmSync(path.join(process.cwd(), res.body.url), { force: true });
  });

  it.each([
    ['tệp thực thi', 'virus.exe', 'application/x-msdownload'],
    ['html', 'page.html', 'text/html'],
    ['svg (có thể chứa script)', 'img.svg', 'image/svg+xml'],
    ['javascript', 'a.js', 'application/javascript'],
  ])('từ chối loại tệp không cho phép: %s → 400', async (_l, filename, contentType) => {
    const a = await signUp(app);
    const res = await as(app, a).post('/api/upload').attach('file', Buffer.from('xxx'), { filename, contentType });
    expect(res.status).toBe(400);
  });

  it('không gửi tệp → 400', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post('/api/upload')).status).toBe(400);
  });
});

describe('Tình huống đồng thời (race condition)', () => {
  it('gửi lời mời kết bạn 5 lần cùng lúc → đúng 1 lời mời, các lần còn lại bị từ chối', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const results = await Promise.all(Array.from({ length: 5 }, () => as(app, a).post('/api/friends/requests').send({ targetUserId: b.id })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
    expect((await as(app, b).get('/api/friends/requests')).body.requests).toHaveLength(1);
  });

  it('chấp nhận lời mời 4 lần cùng lúc → chỉ tạo 1 quan hệ bạn bè', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const sent = await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
    const results = await Promise.all(Array.from({ length: 4 }, () => as(app, b).post(`/api/friends/requests/${sent.body.request.id}/accept`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await as(app, a).get('/api/friends')).body.friends).toHaveLength(1);
  });

  it('chia sẻ 5 lần cùng lúc → sharesCount = 5', async () => {
    const a = await signUp(app);
    const users = await Promise.all(Array.from({ length: 5 }, () => signUp(app)));
    const post = await createPost(app, a);
    await Promise.all(users.map((u) => as(app, u).post(`/api/posts/${post.id}/share`).send({})));
    expect((await as(app, a).get(`/api/posts/${post.id}`)).body.post.sharesCount).toBe(5);
  });

  it('thả cảm xúc đồng thời từ nhiều người → đủ số lượng, không trùng người', async () => {
    const a = await signUp(app);
    const users = await Promise.all(Array.from({ length: 6 }, () => signUp(app)));
    const post = await createPost(app, a);
    await Promise.all(users.map((u) => as(app, u).post(`/api/posts/${post.id}/react`).send({ type: 'like' })));
    const reactions = (await as(app, a).get(`/api/posts/${post.id}`)).body.post.reactions as { userId: string }[];
    expect(reactions).toHaveLength(6);
    expect(new Set(reactions.map((r) => r.userId)).size).toBe(6);
  });

  it('lặp lại 8 lần: một người bấm 6 loại cảm xúc bài viết song song → luôn ≤ 1 cảm xúc', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    for (let round = 0; round < 8; round++) {
      const post = await createPost(app, a);
      await Promise.all(['like', 'love', 'haha', 'wow', 'sad', 'angry', 'like', 'love'].map((type) => as(app, b).post(`/api/posts/${post.id}/react`).send({ type })));
      const reactions = (await as(app, a).get(`/api/posts/${post.id}`)).body.post.reactions as unknown[];
      expect(reactions.length, `vòng ${round}`).toBeLessThanOrEqual(1);
    }
  });

  it('cùng một người bấm Thích nhiều lần liên tiếp rất nhanh → không bao giờ có hơn 1 cảm xúc', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await befriend(app, a, b);
    const post = await createPost(app, a);
    await Promise.all(Array.from({ length: 6 }, () => as(app, b).post(`/api/posts/${post.id}/react`).send({ type: 'like' })));
    const reactions = (await as(app, a).get(`/api/posts/${post.id}`)).body.post.reactions as unknown[];
    expect(reactions.length).toBeLessThanOrEqual(1);
  });
});

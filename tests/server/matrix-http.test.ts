import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createToken } from '../../server/jwtAuth';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, createPost, TestUser } from './helpers';

// MA TRẬN HTTP: cùng một kiểu kiểm tra được lặp cho MỌI route / mọi giá trị "khó" — id sai, phân trang rác, unicode,
// header Authorization lạ, body sai hình dạng, từ khoá tìm kiếm lạ. Mục tiêu: không bao giờ 500, không bao giờ treo, không rò rỉ.

let app: Express;
let me: TestUser;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
  me = await signUp(app, 'Matrix');
});
afterAll(disconnectTestDb);

type Method = 'get' | 'post' | 'patch' | 'delete';

describe('Id sai định dạng ở mọi route có :id (21 route × 12 giá trị = 252)', () => {
  const routes: [Method, string][] = [
    ['get', '/api/users/{id}'], ['post', '/api/users/{id}/block'], ['delete', '/api/users/{id}/block'],
    ['get', '/api/posts/{id}'], ['patch', '/api/posts/{id}'], ['delete', '/api/posts/{id}'], ['post', '/api/posts/{id}/react'],
    ['post', '/api/posts/{id}/pin'], ['post', '/api/posts/{id}/save'], ['post', '/api/posts/{id}/share'],
    ['delete', '/api/comments/{id}'], ['post', '/api/comments/{id}/like'],
    ['get', '/api/friends/of/{id}'], ['post', '/api/friends/requests/{id}/accept'], ['post', '/api/friends/requests/{id}/reject'],
    ['delete', '/api/friends/requests/{id}'], ['delete', '/api/friends/{id}'],
    ['get', '/api/messages/conversations/{id}/messages'], ['delete', '/api/stories/{id}'], ['post', '/api/stories/{id}/view'],
    ['patch', '/api/notifications/{id}/read'],
  ];
  const badIds = ['xyz', '123', 'abc-def', '12345678901234567890123', '1234567890123456789012345', 'zzzzzzzzzzzzzzzzzzzzzzzz', '%20', 'null', 'undefined', '0', '-1', '%25'];
  for (const [method, template] of routes) {
    for (const id of badIds) {
      it(`${method.toUpperCase()} ${template.replace('{id}', id)} → 400/404, không 500`, async () => {
        const req = as(app, me)[method](template.replace('{id}', id));
        const res = await (method === 'get' || method === 'delete' ? req : req.send({ type: 'like', content: 'x' }));
        expect([400, 404]).toContain(res.status);
        expect(typeof res.body.error).toBe('string');
      });
    }
  }
});

describe('Header Authorization lạ → luôn 401 (25 giá trị × 3 route = 75)', () => {
  const token = createToken('64b0f0f0f0f0f0f0f0f0f0f0');
  const headers: [string, string][] = [
    ['rỗng', ''], ['chỉ "Bearer"', 'Bearer'], ['"Bearer "', 'Bearer '], ['không có Bearer', token], ['basic auth', `Basic ${token}`],
    ['bearer viết thường', `bearer ${token}`], ['BEARER viết hoa', `BEARER ${token}`], ['2 khoảng trắng', `Bearer  ${token}`],
    ['token rác', 'Bearer abc'], ['token 3 phần rác', 'Bearer a.b.c'], ['token bị cắt cụt', `Bearer ${token.slice(0, -5)}`],
    ['token bị đổi 1 ký tự chữ ký', `Bearer ${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`], ['token + rác phía sau', `Bearer ${token}x`],
    ['thêm dấu nháy', `Bearer "${token}"`], ['null', 'Bearer null'], ['undefined', 'Bearer undefined'], ['JSON', 'Bearer {"sub":"1"}'],
    ['alg none', `Bearer ${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"64b0f0f0f0f0f0f0f0f0f0f0"}').toString('base64url')}.`],
    ['rất dài', `Bearer ${'a'.repeat(10000)}`], ['unicode (mã hoá %)', 'Bearer %F0%9F%98%80%F0%9F%98%80'], ['SQL', "Bearer ' OR 1=1 --"], ['token", "x', 'Bearer a", "b'],
    ['Token scheme', `Token ${token}`], ['Bearer: có dấu hai chấm', `Bearer: ${token}`], ['nhiều token', `Bearer ${token} ${token}`],
  ];
  const targets: [Method, string][] = [['get', '/api/auth/me'], ['get', '/api/posts'], ['post', '/api/posts']];
  for (const [label, value] of headers) {
    for (const [method, url] of targets) {
      it(`${label} → ${method.toUpperCase()} ${url}`, async () => {
        // token hợp lệ chữ ký nhưng sai định dạng header, hoặc token hỏng → đều phải 401. (Token đúng id không tồn tại chỉ 401 khi header sai.)
        const res = await request(app)[method](url).set('Authorization', value).send({ content: 'x' });
        expect(res.status).toBe(401);
      });
    }
  }
});

describe('Phân trang với tham số lạ (10 limit × 8 skip × 3 API = 240)', () => {
  const limits = ['1', '2', '30', '100', '101', '-1', '0', 'abc', '1e3', '9999999999999999999'];
  const skips = ['0', '1', '1000', '-1', 'abc', '1.9', '', '9999999999999999999'];
  const apis = ['/api/posts', '/api/notifications', '/api/users'];
  beforeAll(async () => {
    for (let i = 0; i < 3; i++) await createPost(app, me, { content: `bài ${i}` });
  });
  for (const api of apis) {
    for (const limit of limits) {
      for (const skip of skips) {
        it(`${api}?limit=${limit}&skip=${skip} → 200, tối đa 100 phần tử`, async () => {
          const res = await as(app, me).get(`${api}?limit=${limit}&skip=${skip}`);
          expect(res.status).toBe(200);
          const list = res.body.posts ?? res.body.notifications ?? res.body.users;
          expect(Array.isArray(list)).toBe(true);
          expect(list.length).toBeLessThanOrEqual(100);
          if (limit === '1') expect(list.length).toBeLessThanOrEqual(1);
        });
      }
    }
  }
});

describe('Unicode & ký tự đặc biệt được lưu và trả về NGUYÊN VẸN (30 chuỗi × 4 nơi = 120)', () => {
  const strings: [string, string][] = [
    ['tiếng Việt đủ dấu', 'Ăn quả nhớ kẻ trồng cây, ơn nghĩa đừng quên ạ'],
    ['chữ hoa tiếng Việt', 'NGUYỄN THỊ ÁNH TUYẾT ĐẶNG'],
    ['dấu tổ hợp (NFD)', 'Việt Nam'],
    ['emoji đơn', 'Vui quá 😀🎉🔥'],
    ['emoji ZWJ gia đình', 'Gia đình 👨‍👩‍👧‍👦'],
    ['emoji màu da', 'Chào 👋🏽 bạn'],
    ['cờ quốc gia', 'Việt Nam 🇻🇳'],
    ['tiếng Nhật', 'こんにちは世界'],
    ['tiếng Trung', '你好，世界'],
    ['tiếng Hàn', '안녕하세요'],
    ['tiếng Ả Rập (RTL)', 'مرحبا بالعالم'],
    ['tiếng Do Thái (RTL)', 'שלום עולם'],
    ['tiếng Nga', 'Привет, мир'],
    ['tiếng Thái', 'สวัสดีชาวโลก'],
    ['ký tự điều khiển RTL', 'abc ‮def‬ ghi'],
    ['zero-width space', 'a​b​c'],
    ['xuống dòng \\n', 'dòng 1\ndòng 2\ndòng 3'],
    ['xuống dòng \\r\\n', 'dòng 1\r\ndòng 2'],
    ['tab', 'cột 1\tcột 2'],
    ['nhiều khoảng trắng giữa chữ', 'a     b'],
    ['HTML', '<b>đậm</b> <img src=x onerror=alert(1)>'],
    ['script', '<script>alert("xss")</script>'],
    ['SQL', "'; DROP TABLE users; --"],
    ['NoSQL dạng chuỗi', '{"$ne": null}'],
    ['JSON', '{"a":[1,2,{"b":null}]}'],
    ['dấu nháy & gạch chéo', `"đôi" 'đơn' \`ngược\` \\ gạch / chéo`],
    ['ký tự % và &', '100% & more = <ok>'],
    ['URL', 'https://example.com/a?b=c&d=e#f'],
    ['@mention giả & #hashtag', '@nguyen #tag @@x'],
    ['chuỗi dài 2500 ký tự', 'Xin chào Việt Nam! '.repeat(131).trim()],
  ];
  let postId: string;
  let convId: string;
  let other: TestUser;
  beforeAll(async () => {
    postId = (await createPost(app, me, { content: 'bài để bình luận' })).id;
    other = await signUp(app, 'Other');
    convId = (await as(app, me).post('/api/messages/conversations').send({ participantId: other.id })).body.conversation.id;
  });
  for (const [label, value] of strings) {
    it(`bài viết: ${label}`, async () => {
      const post = await createPost(app, me, { content: value });
      expect(post.content).toBe(value);
      expect((await as(app, me).get(`/api/posts/${post.id}`)).body.post.content).toBe(value);
    });
    it(`bình luận: ${label}`, async () => {
      const res = await as(app, me).post('/api/comments').send({ postId, content: value });
      expect(res.body.comment.content).toBe(value);
    });
    it(`tin nhắn: ${label}`, async () => {
      const res = await as(app, me).post(`/api/messages/conversations/${convId}/messages`).send({ content: value });
      expect(res.body.message.content).toBe(value);
      const history = (await as(app, other).get(`/api/messages/conversations/${convId}/messages`)).body.messages as { content: string }[];
      expect(history.some((m) => m.content === value)).toBe(true);
    });
    it(`tiểu sử hồ sơ: ${label}`, async () => {
      const bio = value.slice(0, 500);
      const res = await as(app, me).patch('/api/users/me').send({ bio });
      expect(res.body.user.bio).toBe(bio.trim());
    });
  }
});

describe('Từ khoá tìm kiếm lạ → luôn 200 và danh sách hợp lệ (40)', () => {
  const queries = [
    'a', 'A', ' ', '  a  ', 'Matrix', 'matrix', 'MATRIX', 'Mat', 'trix', '1', '123456789', '_', '.', '-', '@', '#', '$', '%', '^', '&', '*', '(', ')', '[', ']', '{', '}',
    '\\', '|', '?', '+', '.*', '^$', '(a|b)', '[a-z]+', 'a'.repeat(300), 'Nguyễn', 'Đặng', '😀', '山田',
  ];
  for (const q of queries) {
    it(`?q=${JSON.stringify(q.length > 20 ? q.slice(0, 20) + '…' : q)}`, async () => {
      const res = await as(app, me).get(`/api/users?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    });
  }
  it('tìm "Matrix" tìm thấy chính mình; tìm chuỗi regex ".*" KHÔNG khớp mọi người', async () => {
    expect((await as(app, me).get('/api/users?q=Matrix')).body.users.some((u: { id: string }) => u.id === me.id)).toBe(true);
    expect((await as(app, me).get(`/api/users?q=${encodeURIComponent('.*')}`)).body.users).toEqual([]);
  });
});

describe('Body sai hình dạng ở các route POST (9 route × 9 body = 81) → luôn 400', () => {
  const routes = ['/api/auth/register', '/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/posts', '/api/comments', '/api/stories', '/api/friends/requests', '/api/messages/conversations'];
  const bodies: [string, string][] = [
    ['mảng rỗng', '[]'], ['mảng có số', '[1,2]'], ['chuỗi JSON', '"abc"'], ['số', '123'], ['null', 'null'], ['boolean', 'true'],
    ['JSON hỏng', '{bad json'], ['JSON cụt', '{"a":'], ['object chỉ có trường lạ', '{"zzz":1}'],
  ];
  for (const route of routes) {
    for (const [label, body] of bodies) {
      it(`POST ${route} với ${label}`, async () => {
        const res = await as(app, me).post(route).set('Content-Type', 'application/json').send(body);
        expect(res.status, `${route} ${body}`).toBe(400);
      });
    }
  }
});

describe('Route không tồn tại / phương thức sai', () => {
  const paths = ['/api', '/api/', '/api/nope', '/api/posts/x/y/z', '/api/users/me/nope', '/api/auth', '/api/friends/requests/x/y', '/api/messages', '/api/stories/x/view/y', '/api/health/x'];
  for (const p of paths) {
    it(`GET ${p} → 404`, async () => {
      const res = await as(app, me).get(p);
      expect(res.status).toBe(404);
    });
  }
  for (const [method, url] of [['delete', '/api/posts'], ['patch', '/api/posts'], ['post', '/api/health'], ['delete', '/api/auth/me'], ['patch', '/api/auth/login'], ['get', '/api/auth/login'], ['get', '/api/comments/x/like']] as [Method, string][]) {
    it(`${method.toUpperCase()} ${url} (sai phương thức) → 404`, async () => {
      expect((await as(app, me)[method](url)).status).toBe(404);
    });
  }
});

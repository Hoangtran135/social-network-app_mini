import mongoose from 'mongoose';
import request from 'supertest';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import { createApp, errorHandler } from '../../server/app';

// Đồ nghề dùng chung cho các test của server.
// AN TOÀN: mỗi file test dùng một database riêng tên "social-network-test-<mã ngẫu nhiên>" và xoá nó khi chạy xong,
// nên KHÔNG BAO GIỜ đụng tới dữ liệu thật. Mặc định nối tới MongoDB local; đổi bằng biến môi trường TEST_MONGODB_URI
// (chỉ gồm địa chỉ máy chủ, vd mongodb://127.0.0.1:27017).

export const bogusId = '64b0f0f0f0f0f0f0f0f0f0f0'; // id đúng định dạng nhưng không tồn tại

let dbName = '';

/** Kết nối tới database tạm. Gọi trong beforeAll. */
export async function connectTestDb() {
  const base = (process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017').replace(/\/$/, '');
  dbName = `social-network-test-${randomUUID().slice(0, 8)}`;
  if (!dbName.includes('test')) throw new Error('Từ chối chạy test trên database không phải database test');
  await mongoose.connect(`${base}/${dbName}`);
  // Tạo index (vd email / username duy nhất) trước khi test để kiểm tra được ràng buộc trùng lặp
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

/** Xoá database tạm và ngắt kết nối. Gọi trong afterAll. */
export async function disconnectTestDb() {
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

/** Dựng app Express dùng cho test (mặc định tắt giới hạn số request để test không bị chặn). */
export function buildApp(options: { rateLimits?: boolean } = {}): Express {
  const app = createApp({ rateLimits: false, ...options });
  app.use(errorHandler);
  return app;
}

export interface TestUser {
  id: string;
  token: string;
  name: string;
  username: string;
  email: string;
  password: string;
}

let counter = 0;

/** Đăng ký một người dùng mới qua API thật và trả về id + token. */
export async function signUp(app: Express, label = 'User'): Promise<TestUser> {
  const n = ++counter;
  const suffix = randomUUID().slice(0, 6);
  const body = { name: `${label} ${n}`, username: `u${n}_${suffix}`, email: `u${n}_${suffix}@test.vn`, password: 'secret123' };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 200) throw new Error(`Đăng ký thất bại: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...body, id: res.body.user.id, token: res.body.token };
}

/** Gọi API với tư cách một người dùng: as(app, user).post('/api/posts').send({...}) */
export function as(app: Express, user: Pick<TestUser, 'token'>) {
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${user.token}`);
  return {
    get: (url: string) => auth(request(app).get(url)),
    post: (url: string) => auth(request(app).post(url)),
    patch: (url: string) => auth(request(app).patch(url)),
    delete: (url: string) => auth(request(app).delete(url)),
  };
}

/** Làm cho hai người trở thành bạn bè (gửi lời mời + chấp nhận). */
export async function befriend(app: Express, a: TestUser, b: TestUser) {
  const sent = await as(app, a).post('/api/friends/requests').send({ targetUserId: b.id });
  if (sent.status !== 200) throw new Error(`Gửi lời mời thất bại: ${sent.status} ${JSON.stringify(sent.body)}`);
  const accepted = await as(app, b).post(`/api/friends/requests/${sent.body.request.id}/accept`);
  if (accepted.status !== 200) throw new Error(`Chấp nhận thất bại: ${accepted.status}`);
}

/** Đăng một bài viết và trả về bài đó. */
export async function createPost(app: Express, user: TestUser, data: Record<string, unknown> = {}) {
  const res = await as(app, user).post('/api/posts').send({ content: 'Bài viết thử nghiệm', ...data });
  if (res.status !== 200) throw new Error(`Đăng bài thất bại: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.post as { id: string; [key: string]: unknown };
}

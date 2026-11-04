// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, ApiError, getToken, setToken, uploadFile } from '../../src/utils/api';

// Test client gọi API: gắn token, JSON, xử lý lỗi, tự đăng xuất khi 401, upload tệp.

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });
const lastCall = () => fetchMock.mock.calls.at(-1)! as [string, RequestInit & { headers: Record<string, string> }];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setToken(null);
});

describe('Gắn token', () => {
  it('chưa có token → không gửi header Authorization', async () => {
    reply(200, {});
    await api.get('/posts');
    expect(lastCall()[1].headers.Authorization).toBeUndefined();
  });

  it('có token → gửi "Bearer <token>" ở mọi phương thức', async () => {
    setToken('abc');
    for (const method of ['get', 'post', 'patch', 'delete'] as const) {
      reply(200, {});
      await api[method]('/x');
      expect(lastCall()[1].headers.Authorization, method).toBe('Bearer abc');
    }
  });

  it('setToken lưu / xoá ở localStorage để tải lại trang vẫn còn đăng nhập', () => {
    setToken('t1');
    expect(getToken()).toBe('t1');
    expect(localStorage.getItem('authToken')).toBe('t1');
    setToken(null);
    expect(getToken()).toBeNull();
    expect(localStorage.getItem('authToken')).toBeNull();
  });
});

describe('Gửi request', () => {
  it('thêm tiền tố /api và đúng phương thức', async () => {
    reply(200, {});
    await api.delete('/posts/1');
    expect(lastCall()[0]).toBe('/api/posts/1');
    expect(lastCall()[1].method).toBe('DELETE');
  });

  it('POST có body → JSON + Content-Type; GET không có body', async () => {
    reply(200, {});
    await api.post('/posts', { content: 'xin chào 😊' });
    expect(lastCall()[1].headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(lastCall()[1].body as string)).toEqual({ content: 'xin chào 😊' });
    reply(200, {});
    await api.get('/posts');
    expect(lastCall()[1].body).toBeUndefined();
    expect(lastCall()[1].headers['Content-Type']).toBeUndefined();
  });

  it('POST không body (vd /logout) không gửi Content-Type', async () => {
    reply(200, {});
    await api.post('/auth/logout');
    expect(lastCall()[1].body).toBeUndefined();
    expect(lastCall()[1].headers['Content-Type']).toBeUndefined();
  });

  it('trả về dữ liệu JSON của server', async () => {
    reply(200, { posts: [1, 2] });
    expect(await api.get('/posts')).toEqual({ posts: [1, 2] });
  });
});

describe('Xử lý lỗi', () => {
  it('server báo lỗi → ném ApiError mang status + câu báo lỗi của server', async () => {
    reply(409, { error: 'Email đã được sử dụng.' });
    const err = await api.post('/auth/register', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, message: 'Email đã được sử dụng.' });
  });

  it('phản hồi lỗi không phải JSON → câu báo lỗi mặc định', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
    const err = await api.get('/x').catch((e) => e);
    expect(err).toMatchObject({ status: 502, message: 'Đã có lỗi xảy ra.' });
  });

  it('401 → xoá token (người dùng phải đăng nhập lại)', async () => {
    setToken('het-han');
    reply(401, { error: 'hết hạn' });
    await api.get('/auth/me').catch(() => {});
    expect(getToken()).toBeNull();
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  it.each([400, 403, 404, 409, 500])('%i → KHÔNG xoá token', async (status) => {
    setToken('con-han');
    reply(status, { error: 'x' });
    await api.get('/x').catch(() => {});
    expect(getToken()).toBe('con-han');
  });

  it('lỗi mạng (fetch reject) → lan ra cho nơi gọi xử lý', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.get('/x')).rejects.toThrow('Failed to fetch');
  });

  it('phản hồi thành công nhưng thân rỗng → trả object rỗng, không lỗi', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('empty'); } });
    expect(await api.get('/x')).toEqual({});
  });
});

describe('uploadFile', () => {
  it('gửi FormData tới /api/upload, KHÔNG tự đặt Content-Type (để trình duyệt thêm boundary)', async () => {
    setToken('tk');
    reply(200, { url: '/uploads/a.png', name: 'a.png', size: 3 });
    const file = new File(['abc'], 'a.png', { type: 'image/png' });
    const result = await uploadFile(file);
    expect(result).toEqual({ url: '/uploads/a.png', name: 'a.png', size: 3 });
    const [url, init] = lastCall();
    expect(url).toBe('/api/upload');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.headers.Authorization).toBe('Bearer tk');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('server từ chối loại tệp → ApiError với câu báo lỗi', async () => {
    reply(400, { error: 'Loại file không được hỗ trợ.' });
    await expect(uploadFile(new File(['x'], 'a.exe'))).rejects.toMatchObject({ status: 400, message: 'Loại file không được hỗ trợ.' });
  });
});

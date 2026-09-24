// Gọi API tới server (mọi đường dẫn đều có tiền tố /api) và upload tệp.
// Tự gắn token đăng nhập vào mỗi request; server trả lỗi thì ném ApiError chứa câu báo lỗi của server.
// Cách dùng: const { posts } = await api.get<{ posts: Post[] }>('/posts');

const TOKEN_KEY = 'authToken';

// Token được lưu trong localStorage để tải lại trang vẫn còn đăng nhập
let token: string | null = localStorage.getItem(TOKEN_KEY);

export const getToken = () => token;

export function setToken(newToken: string | null) {
  token = newToken;
  if (newToken) localStorage.setItem(TOKEN_KEY, newToken);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isFile = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(isFile || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: isFile ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 401 = token hết hạn / không hợp lệ → xoá token, người dùng phải đăng nhập lại
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, data.error || 'Đã có lỗi xảy ra.');
  }
  return data as T;
}

export const api = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T = unknown>(path: string) => request<T>('DELETE', path),
};

export interface UploadResult {
  url: string;
  name: string;
  size: number;
}

/** Upload một tệp (ảnh / video) lên server, nhận lại đường dẫn của tệp. */
export function uploadFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<UploadResult>('POST', '/upload', form);
}

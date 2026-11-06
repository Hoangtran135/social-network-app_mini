import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import { api, ApiError, getToken, setToken, SESSION_ENDED_EVENT } from '../utils/api';
import { disconnectSocket } from '../utils/socket';

// Quản lý ĐĂNG NHẬP cho toàn ứng dụng: người đang đăng nhập (currentUser), đăng nhập, đăng ký, đăng xuất,
// sửa hồ sơ, chặn / bỏ chặn. Component nào cần thì gọi: const { currentUser, logout } = useAuth();

function useAuthState() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Đang kiểm tra token lúc mở app (trong lúc này App.tsx hiện vòng xoay)
  const [isLoading, setIsLoading] = useState(true);

  // Mở app: có token thì hỏi server token còn hợp lệ không và lấy thông tin người dùng
  useEffect(() => {
    if (!getToken()) return setIsLoading(false);
    api
      .get<{ user: User }>('/auth/me')
      .then(({ user }) => setCurrentUser(user))
      .catch(() => setToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  // Phiên bị server chấm dứt (token hết hạn, tài khoản bị khoá...) → coi như đã đăng xuất; RequireLogin sẽ chuyển về /login
  useEffect(() => {
    const onSessionEnded = () => {
      setCurrentUser(null);
      disconnectSocket();
    };
    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
  }, []);

  /** Đăng nhập / đăng ký thành công → lưu token và người dùng, trả về true; thất bại → trả về lỗi để nơi gọi quyết định hiện gì. */
  const signIn = async (path: '/auth/login' | '/auth/register', body: object): Promise<true | ApiError> => {
    try {
      const { token, user } = await api.post<{ token: string; user: User }>(path, body);
      setToken(token);
      setCurrentUser(user);
      return true;
    } catch (error) {
      return error as ApiError;
    }
  };

  /** Các API sửa thông tin của chính mình đều trả về { user } mới → cập nhật lại currentUser. */
  const updateMe = async (request: Promise<{ user: User }>) => setCurrentUser((await request).user);

  return {
    currentUser,
    isLoading,
    /** true = đã đăng nhập; chuỗi = tài khoản bị khoá (lời nhắn của server); false = sai email / mật khẩu hoặc lỗi khác. */
    login: async (email: string, password: string) => {
      const result = await signIn('/auth/login', { email, password });
      return result === true ? true : result.code === 'banned' ? result.message : false;
    },
    register: async (name: string, username: string, email: string, password: string) => (await signIn('/auth/register', { name, username, email, password })) === true,
    logout: () => {
      api.post('/auth/logout').catch(() => {});
      setToken(null);
      setCurrentUser(null);
      disconnectSocket();
    },
    /** Tải lại thông tin tài khoản từ server (vd sau khi xác minh email). Trả về emailVerified mới nhất. */
    refreshUser: async () => {
      const { user } = await api.get<{ user: User }>('/auth/me');
      setCurrentUser(user);
      return user.emailVerified;
    },
    resendVerification: () => api.post('/auth/resend-verification'),
    updateProfile: (data: Partial<User>) => updateMe(api.patch('/users/me', data)),
    blockUser: (userId: string) => updateMe(api.post(`/users/${userId}/block`)),
    unblockUser: (userId: string) => updateMe(api.delete(`/users/${userId}/block`)),
  };
}

const AuthContext = createContext<ReturnType<typeof useAuthState> | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthContext.Provider value={useAuthState()}>{children}</AuthContext.Provider>
);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)!;

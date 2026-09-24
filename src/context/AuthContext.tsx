import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import { api, getToken, setToken } from '../utils/api';
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

  /** Đăng nhập / đăng ký thành công → lưu token và người dùng. Trả về true / false. */
  const signIn = async (path: '/auth/login' | '/auth/register', body: object) => {
    try {
      const { token, user } = await api.post<{ token: string; user: User }>(path, body);
      setToken(token);
      setCurrentUser(user);
      return true;
    } catch {
      return false;
    }
  };

  /** Các API sửa thông tin của chính mình đều trả về { user } mới → cập nhật lại currentUser. */
  const updateMe = async (request: Promise<{ user: User }>) => setCurrentUser((await request).user);

  return {
    currentUser,
    isLoading,
    login: (email: string, password: string) => signIn('/auth/login', { email, password }),
    register: (name: string, username: string, email: string, password: string) =>
      signIn('/auth/register', { name, username, email, password }),
    logout: () => {
      api.post('/auth/logout').catch(() => {});
      setToken(null);
      setCurrentUser(null);
      disconnectSocket();
    },
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

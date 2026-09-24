import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocialProvider } from './context/SocialContext';
import { ChatWindowsProvider } from './context/ChatWindowsContext';
import { ConfirmDialogProvider } from './context/ConfirmDialogContext';
import { MainLayout } from './layout/MainLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { FeedPage } from './pages/FeedPage';
import { ProfilePage } from './pages/ProfilePage';
import { EditProfilePage } from './pages/EditProfilePage';
import { FriendsPage } from './pages/FriendsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { BlockedUsersPage } from './pages/BlockedUsersPage';
import { SavedPostsPage } from './pages/SavedPostsPage';
import { MemoriesPage } from './pages/MemoriesPage';

// Component gốc của giao diện: bọc các "Provider" (dữ liệu dùng chung) và khai báo đường dẫn → trang.
// Thứ tự lồng Provider quan trọng: SocialProvider cần biết ai đang đăng nhập nên phải nằm TRONG AuthProvider.

/** Trang cần đăng nhập: đang kiểm tra token thì hiện vòng xoay, chưa đăng nhập thì chuyển về /login. */
const RequireLogin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Đang tải...</div>;
  return currentUser ? <>{children}</> : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <ConfirmDialogProvider>
        <AuthProvider>
          <SocialProvider>
            <ChatWindowsProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />

                {/* Các trang dưới đây cần đăng nhập, hiển thị bên trong MainLayout (navbar + sidebar) */}
                <Route element={<RequireLogin><MainLayout /></RequireLogin>}>
                  <Route path="/" element={<FeedPage />} />
                  <Route path="/profile/:id" element={<ProfilePage />} />
                  <Route path="/settings/profile" element={<EditProfilePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/settings/blocked" element={<BlockedUsersPage />} />
                  <Route path="/friends" element={<FriendsPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/saved" element={<SavedPostsPage />} />
                  <Route path="/memories" element={<MemoriesPage />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ChatWindowsProvider>
          </SocialProvider>
        </AuthProvider>
      </ConfirmDialogProvider>
    </BrowserRouter>
  );
}

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocialProvider } from './context/SocialContext';
import { ChatWindowsProvider } from './context/ChatWindowsContext';
import { ConfirmDialogProvider } from './context/ConfirmDialogContext';
import { ThemeProvider } from './context/ThemeContext';
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
import { HashtagPage } from './pages/HashtagPage';
import { GroupsPage } from './pages/GroupsPage';
import { GroupPage } from './pages/GroupPage';
import { PagesPage } from './pages/PagesPage';
import { PagePage } from './pages/PagePage';
import { ReelsPage } from './pages/ReelsPage';
import { SearchPage } from './pages/SearchPage';
import { PostPage } from './pages/PostPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { PageLoading } from './components/ui';

// Component gốc của giao diện: bọc các "Provider" (dữ liệu dùng chung) và khai báo đường dẫn → trang.
// Thứ tự lồng Provider quan trọng: SocialProvider cần biết ai đang đăng nhập nên phải nằm TRONG AuthProvider.

/** Trang cần đăng nhập: đang kiểm tra token thì hiện vòng xoay, chưa đăng nhập thì chuyển về /login. */
const RequireLogin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen"><PageLoading /></div>;
  return currentUser ? <>{children}</> : <Navigate to="/login" replace />;
};

/** Chuyển sang trang khác thì cuộn lên đầu trang (đổi query như ?tab= thì không cuộn). */
export const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

/** Khai báo đường dẫn → trang (tách riêng để bộ test dựng lại đúng cây Route mà không cần BrowserRouter). */
export const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/verify-email" element={<VerifyEmailPage />} />

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
      <Route path="/hashtag/:tag" element={<HashtagPage />} />
      <Route path="/groups" element={<GroupsPage />} />
      <Route path="/groups/:id" element={<GroupPage />} />
      <Route path="/pages" element={<PagesPage />} />
      <Route path="/pages/:id" element={<PagePage />} />
      <Route path="/reels" element={<ReelsPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/post/:id" element={<PostPage />} />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

/** Các Provider dùng chung. Thứ tự lồng quan trọng: SocialProvider cần biết ai đang đăng nhập nên phải nằm TRONG AuthProvider. */
export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <ConfirmDialogProvider>
      <AuthProvider>
        <SocialProvider>
          <ChatWindowsProvider>{children}</ChatWindowsProvider>
        </SocialProvider>
      </AuthProvider>
    </ConfirmDialogProvider>
  </ThemeProvider>
);

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}

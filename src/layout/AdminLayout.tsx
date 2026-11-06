import React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, MessageSquare, UsersRound, Flag, Megaphone, ScrollText, ArrowLeft, Moon, Sun, ShieldCheck, LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { usePendingReports } from '../hooks/usePendingReports';
import { CountBadge } from '../components/ui';
import { Toast } from '../components/Toast';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Bố cục khu quản trị hệ thống (/admin): thanh trên cùng (về mạng xã hội, đổi giao diện sáng / tối), menu bên trái
// (trên điện thoại là một hàng tab cuộn ngang), nội dung trang ở giữa. Chỉ tài khoản có quyền quản trị mới vào được (xem RequireAdmin ở App.tsx).

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Người dùng', icon: Users },
  { to: '/admin/posts', label: 'Bài viết & Reels', icon: FileText },
  { to: '/admin/comments', label: 'Bình luận', icon: MessageSquare },
  { to: '/admin/groups', label: 'Nhóm & Trang', icon: UsersRound },
  { to: '/admin/reports', label: 'Báo cáo vi phạm', icon: Flag },
  { to: '/admin/announcements', label: 'Thông báo hệ thống', icon: Megaphone },
  { to: '/admin/audit', label: 'Nhật ký quản trị', icon: ScrollText },
];

export const AdminLayout: React.FC = () => {
  const { currentUser } = useAuth();
  const { resolved, toggle: toggleTheme } = useTheme();
  const pendingReports = usePendingReports();
  const { pathname } = useLocation();

  return (
    <div className="bg-page min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="app-container h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center text-white shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-slate-900 truncate">Quản trị hệ thống</h1>
              <p className="text-[11px] text-slate-400 truncate">Xin chào, {currentUser?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={toggleTheme} aria-label={resolved === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'} className="icon-btn">
              {resolved === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Link to="/" className="btn-secondary">
              <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Về mạng xã hội</span>
              <span className="sm:hidden">Thoát</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="app-container flex-1 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] gap-4 lg:gap-6 items-start">
          <nav aria-label="Menu quản trị" className="lg:sticky lg:top-20">
            <div className="card p-2 flex lg:flex-col gap-1 overflow-x-auto no-scrollbar scroll-fade-x">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`
                  }
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {to === '/admin/reports' && <CountBadge count={pendingReports} />}
                </NavLink>
              ))}
            </div>
          </nav>

          <div className="min-w-0">
            <ErrorBoundary resetKey={pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </div>
      </main>
      <Toast />
    </div>
  );
};

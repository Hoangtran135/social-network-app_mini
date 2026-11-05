import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, Plus, Bell, UserCircle, LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { CountBadge } from '../components/ui';

// Thanh điều hướng cố định ở đáy màn hình điện thoại (ẩn từ màn hình sm trở lên):
// Trang chủ, Bạn bè, nút Đăng bài ở giữa, Thông báo, Trang cá nhân.

const Item: React.FC<{ to: string; label: string; icon: LucideIcon; active: boolean; badge?: number }> = ({ to, label, icon: Icon, active, badge = 0 }) => (
  <Link
    to={to}
    aria-label={label}
    aria-current={active ? 'page' : undefined}
    className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active ? 'text-blue-600' : 'text-slate-500'}`}
  >
    <span className="relative">
      <Icon className="w-6 h-6" />
      <CountBadge count={badge} className="absolute -top-1 -right-2" />
    </span>
    {label}
  </Link>
);

export const MobileNav: React.FC<{ onOpenCreatePost: () => void }> = ({ onOpenCreatePost }) => {
  const { currentUser } = useAuth();
  const { notifications, friendRequests } = useSocial();
  const { pathname } = useLocation();
  const unread = notifications.filter((n) => !n.isRead).length;
  const myProfile = `/profile/${currentUser?.id}`;

  return (
    <nav aria-label="Điều hướng chính" className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex items-center px-1 pb-[env(safe-area-inset-bottom)]">
      <Item to="/" label="Trang chủ" icon={Home} active={pathname === '/'} />
      <Item to="/friends" label="Bạn bè" icon={Users} active={pathname.startsWith('/friends')} badge={friendRequests.length} />
      <button
        onClick={onOpenCreatePost}
        aria-label="Đăng bài"
        className="mx-2 w-12 h-12 -mt-5 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/40 flex items-center justify-center shrink-0"
      >
        <Plus className="w-6 h-6" />
      </button>
      <Item to="/notifications" label="Thông báo" icon={Bell} active={pathname.startsWith('/notifications')} badge={unread} />
      <Item to={myProfile} label="Cá nhân" icon={UserCircle} active={pathname === myProfile} />
    </nav>
  );
};

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, Settings, Bell, Bookmark, UserCircle, Clock, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';

// Sidebar bên trái (màn hình lớn): thẻ thông tin của mình và menu lối tắt tới các trang chính.

export const LeftSidebar: React.FC = () => {
  const { currentUser } = useAuth();
  const { notifications } = useSocial();
  const { pathname } = useLocation();
  const unread = notifications.filter((n) => !n.isRead).length;
  const myProfile = `/profile/${currentUser?.id}`;

  const items = [
    { label: 'Bảng tin', path: '/', icon: Home },
    { label: 'Trang cá nhân', path: myProfile, icon: UserCircle },
    { label: 'Bạn bè & Lời mời', path: '/friends', icon: Users },
    { label: 'Thông báo', path: '/notifications', icon: Bell, badge: unread },
    { label: 'Kỷ niệm', path: '/memories', icon: Clock },
    { label: 'Ảnh của tôi', path: `${myProfile}?tab=photos`, icon: ImageIcon },
    { label: 'Đã lưu', path: '/saved', icon: Bookmark },
    { label: 'Cài đặt tài khoản', path: '/settings', icon: Settings },
    
  ];

  return (
    <aside className="hidden lg:block sticky top-20">
      <Link to={myProfile} className="card flex items-center gap-3 p-3 mb-4 hover:border-blue-300">
        <img src={currentUser?.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
        <div className="min-w-0">
          <h4 className="font-bold text-slate-800 text-sm truncate">{currentUser?.name}</h4>
          <p className="text-xs text-slate-400 truncate">@{currentUser?.username}</p>
        </div>
      </Link>

      {items.map(({ label, path, icon: Icon, badge }) => {
        const active = path === '/' ? pathname === '/' : pathname === path.split('?')[0];
        return (
          <Link
            key={path}
            to={path}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${active ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200/70'}`}
          >
            <Icon className="w-5 h-5" />
            <span className="flex-1">{label}</span>
            {!!badge && <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-500 text-white">{badge}</span>}
          </Link>
        );
      })}
    </aside>
  );
};

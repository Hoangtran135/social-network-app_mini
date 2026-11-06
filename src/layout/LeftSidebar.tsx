import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, UsersRound, Flag, Clapperboard, Settings, Bell, Bookmark, UserCircle, Clock, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { CountBadge } from '../components/ui';

// Sidebar bên trái (màn hình lớn): thẻ thông tin của mình và menu lối tắt tới các trang chính, chia 2 nhóm.

export const LeftSidebar: React.FC = () => {
  const { currentUser } = useAuth();
  const { notifications, friendRequests } = useSocial();
  const { pathname, search } = useLocation();
  const unread = notifications.filter((n) => !n.isRead).length;
  const myProfile = `/profile/${currentUser?.id}`;

  const groups = [
    [
      { label: 'Bảng tin', path: '/', icon: Home },
      { label: 'Trang cá nhân', path: myProfile, icon: UserCircle },
      { label: 'Bạn bè & Lời mời', path: '/friends', icon: Users, badge: friendRequests.length },
      { label: 'Nhóm', path: '/groups', icon: UsersRound },
      { label: 'Trang', path: '/pages', icon: Flag },
      { label: 'Reels', path: '/reels', icon: Clapperboard },
      { label: 'Thông báo', path: '/notifications', icon: Bell, badge: unread },
    ],
    [
      { label: 'Kỷ niệm', path: '/memories', icon: Clock },
      { label: 'Ảnh của tôi', path: `${myProfile}?tab=photos`, icon: ImageIcon },
      { label: 'Đã lưu', path: '/saved', icon: Bookmark },
      { label: 'Cài đặt tài khoản', path: '/settings', icon: Settings },
    ],
  ];

  // Mục "Ảnh của tôi" có ?tab=photos nên phải so cả query, nếu không nó và "Trang cá nhân" sẽ cùng sáng lên.
  const isActive = (path: string) => {
    const [pathOnly, query] = path.split('?');
    if (pathOnly === '/settings') return pathname.startsWith('/settings');
    if (pathOnly === '/groups' || pathOnly === '/pages') return pathname.startsWith(pathOnly);
    if (pathname !== pathOnly) return false;
    if (query) return search.includes(query);
    if (pathOnly === myProfile) return !search.includes('tab=photos');
    return true;
  };

  return (
    <aside className="hidden lg:block sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto" aria-label="Menu chính">
      <Link to={myProfile} className="card flex items-center gap-3 p-3 mb-3 hover:border-blue-300">
        <img src={currentUser?.avatar} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-800 truncate">{currentUser?.name}</h4>
          <p className="text-xs text-slate-400 truncate">@{currentUser?.username}</p>
        </div>
      </Link>

      {groups.map((items, i) => (
        <div key={i} className={`space-y-0.5 ${i > 0 ? 'mt-3 pt-3 border-t border-slate-200' : ''}`}>
          {items.map(({ label, path, icon: Icon, badge }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200/70'}`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {!!badge && <CountBadge count={badge} />}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
};

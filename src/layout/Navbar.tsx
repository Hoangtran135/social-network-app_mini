import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Users, MessageCircle, Bell, Plus, LogOut, User as UserIcon, Settings, Sparkles, LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useOpenNotification } from '../hooks/useOpenNotification';
import { useClickOutside } from '../hooks/useClickOutside';
import { ChatListDropdown } from '../components/chat/ChatListDropdown';
import { timeAgo } from '../utils/format';

// Thanh điều hướng trên cùng: logo, nút Trang chủ / Bạn bè, nút Đăng bài,
// và 3 menu thả xuống: tin nhắn, thông báo (5 cái mới nhất), tài khoản (trang cá nhân, cài đặt, đăng xuất).

const NavIconLink: React.FC<{ to: string; title: string; icon: LucideIcon; active: boolean }> = ({ to, title, icon: Icon, active }) => (
  <Link
    to={to}
    title={title}
    className={`p-2.5 sm:px-5 rounded-xl ${active ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600' : 'text-slate-600 hover:bg-slate-100'}`}
  >
    <Icon className="w-5 h-5" />
  </Link>
);

/** Nút tròn có icon và huy hiệu đỏ đếm số chưa đọc. */
const BadgeButton: React.FC<{ icon: LucideIcon; count: number; onClick: () => void }> = ({ icon: Icon, count, onClick }) => (
  <button onClick={onClick} className="relative p-2 rounded-full text-slate-700 bg-slate-100 hover:bg-slate-200">
    <Icon className="w-5 h-5" />
    {count > 0 && (
      <span className="absolute top-0 right-0 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{count}</span>
    )}
  </button>
);

const DROPDOWN = 'absolute right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50';
const MENU_ITEM = 'w-full px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5 font-medium';

export const Navbar: React.FC<{ onOpenCreatePost: () => void }> = ({ onOpenCreatePost }) => {
  const { currentUser, logout } = useAuth();
  const { notifications, conversations } = useSocial();
  const openNotification = useOpenNotification();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Chỉ mở một menu tại một thời điểm; bấm ra ngoài thì đóng
  const [openMenu, setOpenMenu] = useState<'messages' | 'notifications' | 'account' | null>(null);
  const toggle = (menu: typeof openMenu) => setOpenMenu(openMenu === menu ? null : menu);
  const menusRef = useClickOutside(() => setOpenMenu(null));

  const unreadNotifs = notifications.filter((n) => !n.isRead).length;
  const unreadMessages = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="hidden sm:block text-xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">SocialNet</span>
        </Link>

        <nav className="flex items-center gap-2">
          <NavIconLink to="/" title="Trang chủ" icon={Home} active={pathname === '/'} />
          <NavIconLink to="/friends" title="Bạn bè" icon={Users} active={pathname.startsWith('/friends')} />
        </nav>

        <div ref={menusRef} className="flex items-center gap-3">
          <button onClick={onOpenCreatePost} className="hidden lg:flex items-center gap-1.5 btn-primary rounded-full py-1.5">
            <Plus className="w-4 h-4" /> Đăng bài
          </button>

          <div className="relative">
            <BadgeButton icon={MessageCircle} count={unreadMessages} onClick={() => toggle('messages')} />
            {openMenu === 'messages' && <ChatListDropdown onClose={() => setOpenMenu(null)} />}
          </div>

          <div className="relative">
            <BadgeButton icon={Bell} count={unreadNotifs} onClick={() => toggle('notifications')} />
            {openMenu === 'notifications' && (
              <div className={`${DROPDOWN} w-80 sm:w-96`}>
                <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800">Thông báo</h3>
                  <Link to="/notifications" onClick={() => setOpenMenu(null)} className="text-xs text-blue-600 hover:underline font-semibold">
                    Xem tất cả
                  </Link>
                </div>
                {notifications.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Không có thông báo mới</p>}
                {notifications.slice(0, 5).map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      setOpenMenu(null);
                      openNotification(n);
                    }}
                    className={`px-4 py-3 flex items-start gap-3 hover:bg-slate-50 cursor-pointer text-xs ${n.isRead ? '' : 'bg-blue-50/50'}`}
                  >
                    <img src={n.actor.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                    <div className="flex-1">
                      <p className="text-slate-800">
                        <b>{n.actor.name}</b> {n.content}
                      </p>
                      <span className="text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => toggle('account')} className="rounded-full hover:ring-2 hover:ring-blue-400">
              <img src={currentUser?.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
            </button>
            {openMenu === 'account' && (
              <div className={`${DROPDOWN} w-64`} onClick={() => setOpenMenu(null)}>
                <div className="px-4 py-2 border-b border-slate-100">
                  <div className="font-bold text-slate-800 text-sm">{currentUser?.name}</div>
                  <div className="text-xs text-slate-400">@{currentUser?.username}</div>
                </div>
                <Link to={`/profile/${currentUser?.id}`} className={`${MENU_ITEM} text-slate-700`}>
                  <UserIcon className="w-4 h-4 text-slate-400" /> Trang cá nhân
                </Link>
                <Link to="/settings" className={`${MENU_ITEM} text-slate-700`}>
                  <Settings className="w-4 h-4 text-slate-400" /> Cài đặt tài khoản
                </Link>
                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  className={`${MENU_ITEM} text-rose-600 border-t border-slate-100`}
                >
                  <LogOut className="w-4 h-4" /> Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

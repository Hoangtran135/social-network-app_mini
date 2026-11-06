import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Users, UsersRound, Flag, Clapperboard, MessageCircle, Bell, Plus, LogOut, User as UserIcon, Settings, Sparkles, Bookmark, Clock, Moon, Sun, LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSocial } from '../context/SocialContext';
import { useOpenNotification } from '../hooks/useOpenNotification';
import { useClickOutside } from '../hooks/useClickOutside';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { ChatListDropdown } from '../components/chat/ChatListDropdown';
import { CountBadge } from '../components/ui';
import { DROPDOWN } from './dropdown';
import { SearchBox } from './SearchBox';
import { timeAgo } from '../utils/format';

// Thanh điều hướng trên cùng: logo, nút Trang chủ / Bạn bè, nút Đăng bài,
// và 3 menu thả xuống: tin nhắn, thông báo (5 cái mới nhất), tài khoản (trang cá nhân, cài đặt, đăng xuất).
// Trên điện thoại: Trang chủ / Bạn bè / Thông báo chuyển xuống thanh điều hướng dưới (MobileNav), menu thả xuống mở rộng hết bề ngang.

const NavIconLink: React.FC<{ to: string; title: string; icon: LucideIcon; active: boolean; badge?: number }> = ({ to, title, icon: Icon, active, badge = 0 }) => (
  <Link
    to={to}
    title={title}
    aria-label={title}
    aria-current={active ? 'page' : undefined}
    className={`relative flex items-center justify-center h-10 w-14 lg:w-16 rounded-xl transition-colors after:absolute after:inset-x-2 after:-bottom-3 after:h-0.5 after:rounded-full ${active ? 'text-blue-600 bg-blue-50 after:bg-blue-600' : 'text-slate-600 hover:bg-slate-100 after:bg-transparent'}`}
  >
    <Icon className="w-5 h-5" />
    <CountBadge count={badge} className="absolute -top-1 right-1 ring-2 ring-white" />
  </Link>
);

/** Nút tròn có icon và huy hiệu đỏ đếm số chưa đọc. */
const BadgeButton: React.FC<{ icon: LucideIcon; label: string; count: number; active?: boolean; onClick: () => void }> = ({ icon: Icon, label, count, active, onClick }) => (
  <button
    onClick={onClick}
    aria-label={label}
    aria-expanded={active}
    className={`icon-btn ${active ? 'icon-btn--active' : ''}`}
  >
    <Icon className="w-5 h-5" />
    <CountBadge count={count} className="absolute -top-1 -right-1 ring-2 ring-white" />
  </button>
);

const MENU_ITEM = 'w-full px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center gap-2.5 font-medium';

export const Navbar: React.FC<{ onOpenCreatePost: () => void }> = ({ onOpenCreatePost }) => {
  const { currentUser, logout } = useAuth();
  const { resolved, toggle: toggleTheme } = useTheme();
  const { notifications, conversations, friendRequests } = useSocial();
  const openNotification = useOpenNotification();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Chỉ mở một menu tại một thời điểm; bấm ra ngoài hoặc nhấn Esc thì đóng
  const [openMenu, setOpenMenu] = useState<'messages' | 'notifications' | 'account' | null>(null);
  const toggle = (menu: typeof openMenu) => setOpenMenu(openMenu === menu ? null : menu);
  const menusRef = useClickOutside(() => setOpenMenu(null));
  useEscapeKey(() => setOpenMenu(null));

  const unreadNotifs = notifications.filter((n) => !n.isRead).length;
  const unreadMessages = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      {/* Lưới 3 cột (trái | giữa | phải): cụm Trang chủ / Bạn bè luôn nằm đúng giữa; trên điện thoại chỉ còn trái + phải */}
      <div className="app-container h-16 flex sm:grid sm:grid-cols-[1fr_auto_1fr] items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="SocialNet - Trang chủ">
            <div className="size-10 rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="hidden md:block text-xl font-semibold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">SocialNet</span>
          </Link>
          <SearchBox />
        </div>

        <nav aria-label="Điều hướng" className="hidden sm:flex items-center gap-1.5">
          <NavIconLink to="/" title="Trang chủ" icon={Home} active={pathname === '/'} />
          <NavIconLink to="/friends" title="Bạn bè" icon={Users} active={pathname.startsWith('/friends')} badge={friendRequests.length} />
        </nav>

        <div ref={menusRef} className="flex items-center justify-end gap-2">
          <button onClick={onOpenCreatePost} className="hidden lg:inline-flex btn-primary rounded-full pl-3.5 pr-4">
            <Plus className="w-4 h-4" /> Đăng bài
          </button>

          <div className="sm:relative">
            <BadgeButton icon={MessageCircle} label="Tin nhắn" count={unreadMessages} active={openMenu === 'messages'} onClick={() => toggle('messages')} />
            {openMenu === 'messages' && <ChatListDropdown onClose={() => setOpenMenu(null)} />}
          </div>

          {/* Trên điện thoại, Thông báo nằm ở thanh điều hướng dưới nên ẩn nút này */}
          <div className="hidden sm:block relative">
            <BadgeButton icon={Bell} label="Thông báo" count={unreadNotifs} active={openMenu === 'notifications'} onClick={() => toggle('notifications')} />
            {openMenu === 'notifications' && (
              <div className={`${DROPDOWN} sm:w-96 py-0`}>
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
                  <h3 className="section-title">Thông báo</h3>
                  <Link to="/notifications" onClick={() => setOpenMenu(null)} className="text-xs text-blue-600 hover:underline font-semibold">
                    Xem tất cả
                  </Link>
                </div>
                {notifications.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Không có thông báo mới</p>}
                {notifications.slice(0, 5).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setOpenMenu(null);
                      openNotification(n);
                    }}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 text-xs ${n.isRead ? '' : 'bg-blue-50/50'}`}
                  >
                    <img src={n.actor.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 break-words">
                        <b>{n.actor.name}</b> {n.content}
                      </p>
                      <span className={`text-[11px] ${n.isRead ? 'text-slate-400' : 'text-blue-600 font-semibold'}`}>{timeAgo(n.createdAt)}</span>
                    </div>
                    {!n.isRead && <span className="w-2.5 h-2.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sm:relative">
            <button onClick={() => toggle('account')} aria-label="Tài khoản" aria-expanded={openMenu === 'account'} className="block size-10 rounded-full ring-2 ring-transparent hover:ring-blue-400 transition-shadow">
              <img src={currentUser?.avatar} alt="" className="size-full rounded-full object-cover" />
            </button>
            {openMenu === 'account' && (
              <div className={`${DROPDOWN} sm:w-64`} onClick={() => setOpenMenu(null)}>
                <div className="px-4 py-2 border-b border-slate-100 mb-1">
                  <div className="font-semibold text-slate-800 text-sm truncate">{currentUser?.name}</div>
                  <div className="text-xs text-slate-400 truncate">@{currentUser?.username}</div>
                </div>
                <Link to={`/profile/${currentUser?.id}`} className={`${MENU_ITEM} text-slate-700`}>
                  <UserIcon className="w-4 h-4 text-slate-400" /> Trang cá nhân
                </Link>
                {/* Trên màn hình lớn hai mục này đã có ở sidebar trái */}
                <Link to="/groups" className={`${MENU_ITEM} text-slate-700 lg:hidden`}>
                  <UsersRound className="w-4 h-4 text-slate-400" /> Nhóm
                </Link>
                <Link to="/pages" className={`${MENU_ITEM} text-slate-700 lg:hidden`}>
                  <Flag className="w-4 h-4 text-slate-400" /> Trang
                </Link>
                <Link to="/reels" className={`${MENU_ITEM} text-slate-700 lg:hidden`}>
                  <Clapperboard className="w-4 h-4 text-slate-400" /> Reels
                </Link>
                <Link to="/saved" className={`${MENU_ITEM} text-slate-700 lg:hidden`}>
                  <Bookmark className="w-4 h-4 text-slate-400" /> Bài viết đã lưu
                </Link>
                <Link to="/memories" className={`${MENU_ITEM} text-slate-700 lg:hidden`}>
                  <Clock className="w-4 h-4 text-slate-400" /> Kỷ niệm
                </Link>
                <Link to="/settings" className={`${MENU_ITEM} text-slate-700`}>
                  <Settings className="w-4 h-4 text-slate-400" /> Cài đặt tài khoản
                </Link>
                <button onClick={toggleTheme} className={`${MENU_ITEM} text-slate-700`}>
                  {resolved === 'dark' ? <Sun className="w-4 h-4 text-slate-400" /> : <Moon className="w-4 h-4 text-slate-400" />}
                  {resolved === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
                </button>
                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  className={`${MENU_ITEM} text-rose-600 border-t border-slate-100 mt-1`}
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

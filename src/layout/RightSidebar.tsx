import React from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { useChatWindows } from '../context/ChatWindowsContext';
import { Avatar } from '../components/ui';

// Sidebar bên phải của bảng tin (màn hình rất lớn): 2 lời mời kết bạn mới nhất và danh sách bạn bè để nhắn tin nhanh.
// Người đang online được xếp lên đầu danh sách.

export const RightSidebar: React.FC = () => {
  const { friends, friendRequests, acceptFriendRequest, rejectFriendRequest, getOrCreateConversation } = useSocial();
  const { openChat } = useChatWindows();
  const sortedFriends = [...friends].sort((a, b) => Number(!!b.isOnline) - Number(!!a.isOnline));

  return (
    <aside className="sticky top-20 space-y-4 max-h-[calc(100vh-6rem)] overflow-y-auto" aria-label="Bạn bè và lời mời">
      {friendRequests.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-600" /> Lời mời kết bạn
            </h4>
            <Link to="/friends" className="text-xs text-blue-600 hover:underline font-semibold">
              Xem tất cả ({friendRequests.length})
            </Link>
          </div>
          {friendRequests.slice(0, 2).map((req) => (
            <div key={req.id} className="p-2.5 rounded-xl bg-slate-50 mb-2 last:mb-0">
              <Link to={`/profile/${req.sender.id}`} className="flex items-center gap-2.5">
                <Avatar src={req.sender.avatar} />
                <div className="min-w-0">
                  <div className="font-bold text-xs text-slate-800 truncate">{req.sender.name}</div>
                  <div className="text-[11px] text-slate-400 truncate">@{req.sender.username}</div>
                </div>
              </Link>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => acceptFriendRequest(req.id)} className="btn-primary flex-1 py-1.5">
                  Xác nhận
                </button>
                <button onClick={() => rejectFriendRequest(req.id)} className="btn-secondary flex-1 py-1.5">
                  Xoá
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card p-4">
        <h4 className="font-bold text-slate-800 text-sm mb-3">Người liên hệ ({friends.length})</h4>
        {friends.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-400">
            Chưa có người liên hệ nào.{' '}
            <Link to="/friends" className="text-blue-600 font-semibold hover:underline">
              Tìm bạn bè
            </Link>
          </p>
        )}
        <div className="max-h-96 overflow-y-auto -mx-1 px-1">
          {sortedFriends.map((user) => (
            <button
              key={user.id}
              onClick={async () => openChat(await getOrCreateConversation(user))}
              className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-100 text-left"
            >
              <Avatar src={user.avatar} size="w-8 h-8" online={user.isOnline} />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800 truncate">{user.name}</div>
                <div className={`text-[10px] ${user.isOnline ? 'text-emerald-600' : 'text-slate-400'}`}>{user.isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
};

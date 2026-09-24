import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserCheck, UserPlus, UserX, Search, MessageCircle, Clock, Sparkles } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { useChatWindows } from '../context/ChatWindowsContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { User } from '../types';
import { api } from '../utils/api';
import { PageHeader, EmptyState, TabButton } from '../components/ui';

// Trang bạn bè (/friends) có 3 tab:
// - Bạn bè: tìm theo tên, nhắn tin, huỷ kết bạn
// - Lời mời: lời mời gửi đến mình (chấp nhận / từ chối) và lời mời mình đã gửi (huỷ)
// - Gợi ý: những người chưa có quan hệ gì với mình, bấm để gửi lời mời

type Tab = 'friends' | 'requests' | 'suggestions';

/** Thẻ một người: ảnh + tên + @username + dòng phụ; actions = các nút bên dưới. */
const UserCard: React.FC<{ user: User; note?: string; actions: React.ReactNode }> = ({ user, note, actions }) => (
  <div className="card p-4 flex flex-col gap-4">
    <Link to={`/profile/${user.id}`} className="flex items-center gap-3">
      <img src={user.avatar} alt="" className="w-14 h-14 rounded-2xl object-cover" />
      <div className="min-w-0 text-xs">
        <b className="text-sm text-slate-900 block truncate">{user.name}</b>
        <span className="text-slate-400">@{user.username}</span>
        {note && <p className="text-blue-600 mt-1">{note}</p>}
      </div>
    </Link>
    <div className="flex gap-2">{actions}</div>
  </div>
);

const Grid: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;

export const FriendsPage: React.FC = () => {
  const { friends, friendRequests, sentFriendRequests, acceptFriendRequest, rejectFriendRequest, cancelFriendRequest, removeFriend, sendFriendRequest, getOrCreateConversation } =
    useSocial();
  const { openChat } = useChatWindows();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('friends');
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<User[]>([]);

  // Tải lại gợi ý mỗi khi số bạn bè / số lời mời đã gửi thay đổi (để ẩn người vừa kết bạn / vừa mời)
  useEffect(() => {
    api.get<{ users: User[] }>('/friends/suggestions?limit=24').then((d) => setSuggestions(d.users)).catch(() => {});
  }, [friends.length, sentFriendRequests.length]);

  const shownFriends = friends.filter((f) => `${f.name} ${f.username}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-4xl">
      <PageHeader icon={Users} title="Bạn bè" subtitle={`${friends.length} bạn bè · ${friendRequests.length} lời mời`} />

      <div className="card p-3 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1.5 overflow-x-auto">
          <TabButton icon={UserCheck} active={tab === 'friends'} onClick={() => setTab('friends')}>
            Bạn bè ({friends.length})
          </TabButton>
          <TabButton icon={Clock} active={tab === 'requests'} onClick={() => setTab('requests')}>
            Lời mời ({friendRequests.length})
          </TabButton>
          <TabButton icon={Sparkles} active={tab === 'suggestions'} onClick={() => setTab('suggestions')}>
            Gợi ý ({suggestions.length})
          </TabButton>
        </div>
        {tab === 'friends' && (
          <div className="relative sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm bạn bè..." className="input pl-9 py-2" />
          </div>
        )}
      </div>

      {tab === 'friends' && (
        <>
          {shownFriends.length === 0 && <EmptyState icon={Users} title="Không có bạn bè nào" description="Hãy xem tab Gợi ý để kết nối với mọi người!" />}
          <Grid>
            {shownFriends.map((f) => (
              <UserCard
                key={f.id}
                user={f}
                note={f.location}
                actions={
                  <>
                    <button onClick={async () => openChat(await getOrCreateConversation(f))} className="btn-secondary flex-1 flex items-center justify-center gap-1.5">
                      <MessageCircle className="w-4 h-4" /> Nhắn tin
                    </button>
                    <button title="Hủy kết bạn" onClick={async () => (await confirm(`Hủy kết bạn với ${f.name}?`)) && removeFriend(f.id)} className="btn-secondary px-3">
                      <UserX className="w-4 h-4" />
                    </button>
                  </>
                }
              />
            ))}
          </Grid>
        </>
      )}

      {tab === 'requests' && (
        <>
          {friendRequests.length === 0 && <EmptyState icon={UserPlus} title="Không có lời mời kết bạn nào" />}
          <Grid>
            {friendRequests.map((r) => (
              <UserCard
                key={r.id}
                user={r.sender}
                actions={
                  <>
                    <button onClick={() => acceptFriendRequest(r.id)} className="btn-primary flex-1">
                      Chấp nhận
                    </button>
                    <button onClick={() => rejectFriendRequest(r.id)} className="btn-secondary flex-1">
                      Từ chối
                    </button>
                  </>
                }
              />
            ))}
          </Grid>

          {sentFriendRequests.length > 0 && (
            <>
              <h3 className="text-xs font-bold text-slate-500 uppercase mt-8 mb-3">Lời mời đã gửi ({sentFriendRequests.length})</h3>
              <Grid>
                {sentFriendRequests.map((r) =>
                  r.receiver ? (
                    <UserCard
                      key={r.id}
                      user={r.receiver}
                      actions={
                        <button onClick={() => cancelFriendRequest(r.id)} className="btn-secondary w-full">
                          Hủy lời mời
                        </button>
                      }
                    />
                  ) : null
                )}
              </Grid>
            </>
          )}
        </>
      )}

      {tab === 'suggestions' && (
        <>
          {suggestions.length === 0 && <EmptyState icon={Sparkles} title="Không còn gợi ý mới" />}
          <Grid>
            {suggestions.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                note={u.workplace}
                actions={
                  <button onClick={() => sendFriendRequest(u)} className="btn-primary w-full flex items-center justify-center gap-1.5">
                    <UserPlus className="w-4 h-4" /> Thêm bạn bè
                  </button>
                }
              />
            ))}
          </Grid>
        </>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Edit3, UserPlus, UserCheck, MessageCircle, Image as ImageIcon, Users, FileText, Info, Ban } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useChatWindows } from '../context/ChatWindowsContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { User } from '../types';
import { api } from '../utils/api';
import { EmptyState, TabButton } from '../components/ui';
import { CreatePostBox } from '../components/post/CreatePostBox';
import { PostCard } from '../components/post/PostCard';
import { PostFormModal } from '../components/post/PostFormModal';

// Trang cá nhân (/profile/:id): ảnh bìa, ảnh đại diện, thông tin, các nút (kết bạn, nhắn tin, chặn — hoặc sửa hồ sơ nếu là mình)
// và 4 tab: bài viết, bạn bè, hình ảnh, giới thiệu. Mở thẳng một tab bằng ?tab=photos.
// Lưu ý: tab bài viết chỉ lấy từ các bài đã tải trên bảng tin.

type Tab = 'posts' | 'friends' | 'photos' | 'about';

export const ProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const { currentUser, blockUser } = useAuth();
  const { posts, friends, getUserFriends, getOrCreateConversation } = useSocial();
  const { openChat } = useChatWindows();
  const confirm = useConfirm();

  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = đang tải, null = không tìm thấy
  const [userFriends, setUserFriends] = useState<User[]>([]);
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'posts');
  const [isPosting, setIsPosting] = useState(false);
  const isMe = id === currentUser?.id;

  // Tải hồ sơ và bạn bè của người này (của mình thì dùng luôn dữ liệu đã có)
  useEffect(() => {
    if (!id) return;
    if (isMe) {
      setUser(currentUser);
      setUserFriends(friends);
      return;
    }
    setUser(undefined);
    api.get<{ user: User }>(`/users/${id}`).then((d) => setUser(d.user)).catch(() => setUser(null));
    getUserFriends(id).then(setUserFriends);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isMe, currentUser, friends]);

  if (user === undefined) return <p className="text-center text-slate-500 py-12">Đang tải hồ sơ...</p>;
  if (user === null) {
    return (
      <EmptyState icon={Info} title="Không tìm thấy người dùng" description="Trang cá nhân này không tồn tại hoặc đã bị chặn.">
        <Link to="/" className="btn-primary">
          Quay lại Bảng tin
        </Link>
      </EmptyState>
    );
  }

  const isFriend = friends.some((f) => f.id === user.id);
  // Bài của người này + bài người khác đăng lên tường họ; bài được ghim lên đầu
  const userPosts = posts.filter((p) => p.author.id === user.id || p.wallOwnerId === user.id).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  const photos = userPosts.flatMap((p) => p.images || []);
  const info = [
    ['Tiểu sử', user.bio],
    ['Nơi làm việc', user.workplace],
    ['Học vấn', user.education],
    ['Nơi sống', user.location],
    ['Email', user.email],
  ];

  return (
    <div className="max-w-5xl">
      <div className="card rounded-3xl overflow-hidden mb-6">
        <div className="h-56 bg-gradient-to-r from-blue-600 to-purple-600">
          {user.coverImage && <img src={user.coverImage} alt="" className="w-full h-full object-cover" />}
        </div>

        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 -mt-16 mb-4">
            <img src={user.avatar} alt="" className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-xl" />
            <div className="flex gap-2 flex-wrap">
              {isMe ? (
                <Link to="/settings/profile" className="btn-primary flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4" /> Chỉnh sửa trang cá nhân
                </Link>
              ) : (
                <>
                  <FriendButton user={user} />
                  <button onClick={async () => openChat(await getOrCreateConversation(user))} className="btn-primary flex items-center gap-1.5 bg-indigo-600">
                    <MessageCircle className="w-4 h-4" /> Nhắn tin
                  </button>
                  <button
                    title="Chặn người dùng"
                    onClick={async () => (await confirm(`Chặn ${user.name}? Hai bên sẽ không thể xem trang cá nhân, kết bạn hay nhắn tin cho nhau nữa.`)) && blockUser(user.id)}
                    className="btn-secondary px-3"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          <h1 className="text-2xl font-black text-slate-900">{user.name}</h1>
          <p className="text-xs text-slate-500">@{user.username}</p>
          {user.bio && <p className="text-sm text-slate-700 mt-2.5">{user.bio}</p>}
          <p className="text-xs text-slate-500 mt-2">
            {[user.workplace, user.location, `Tham gia ${new Date(user.joinDate).toLocaleDateString('vi-VN')}`].filter(Boolean).join(' · ')}
          </p>

          <div className="flex gap-2 border-t border-slate-100 mt-6 pt-3 overflow-x-auto">
            <TabButton icon={FileText} active={tab === 'posts'} onClick={() => setTab('posts')}>
              Bài viết ({userPosts.length})
            </TabButton>
            <TabButton icon={Users} active={tab === 'friends'} onClick={() => setTab('friends')}>
              Bạn bè ({userFriends.length})
            </TabButton>
            <TabButton icon={ImageIcon} active={tab === 'photos'} onClick={() => setTab('photos')}>
              Hình ảnh ({photos.length})
            </TabButton>
            <TabButton icon={Info} active={tab === 'about'} onClick={() => setTab('about')}>
              Giới thiệu
            </TabButton>
          </div>
        </div>
      </div>

      {tab === 'posts' && (
        <div className="max-w-2xl">
          {/* Chỉ chính mình hoặc bạn bè mới được đăng bài lên tường */}
          {(isMe || isFriend) && <CreatePostBox placeholder={isMe ? undefined : `Viết gì đó cho ${user.name}...`} onClick={() => setIsPosting(true)} />}
          {userPosts.length === 0 && <EmptyState icon={FileText} title="Chưa có bài viết nào" />}
          {userPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {tab === 'friends' && (
        <div className="card p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {userFriends.map((f) => (
            <Link key={f.id} to={`/profile/${f.id}`} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-blue-50">
              <img src={f.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
              <div className="text-xs">
                <b className="text-slate-900">{f.name}</b>
                <div className="text-slate-400">@{f.username}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === 'photos' && (
        <div className="card p-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {photos.length === 0 && <p className="text-xs text-slate-500">Chưa có hình ảnh nào.</p>}
          {photos.map((img) => (
            <img key={img} src={img} alt="" className="aspect-square rounded-2xl object-cover" />
          ))}
        </div>
      )}

      {tab === 'about' && (
        <div className="card p-6 max-w-2xl space-y-4 text-xs">
          {info.map(([label, value]) => (
            <div key={label}>
              <span className="font-bold text-slate-500 uppercase block mb-1">{label}</span>
              <p className="text-slate-800">{value || 'Chưa cập nhật'}</p>
            </div>
          ))}
        </div>
      )}

      {/* Đăng lên tường người khác thì truyền wallOwner */}
      {isPosting && <PostFormModal wallOwner={isMe ? undefined : user} onClose={() => setIsPosting(false)} />}
    </div>
  );
};

/** Nút kết bạn có 4 trạng thái: đã là bạn / họ đã mời mình / mình đã mời họ / chưa có gì. */
const FriendButton: React.FC<{ user: User }> = ({ user }) => {
  const { friends, friendRequests, sentFriendRequests, sendFriendRequest, acceptFriendRequest, cancelFriendRequest, removeFriend } = useSocial();
  const confirm = useConfirm();
  const incoming = friendRequests.find((r) => r.sender.id === user.id);
  const sent = sentFriendRequests.find((r) => r.receiverId === user.id);

  if (friends.some((f) => f.id === user.id)) {
    return (
      <button onClick={async () => (await confirm(`Hủy kết bạn với ${user.name}?`)) && removeFriend(user.id)} className="btn-secondary flex items-center gap-1.5">
        <UserCheck className="w-4 h-4 text-emerald-600" /> Bạn bè
      </button>
    );
  }
  if (incoming) {
    return (
      <button onClick={() => acceptFriendRequest(incoming.id)} className="btn-primary flex items-center gap-1.5">
        <UserPlus className="w-4 h-4" /> Chấp nhận kết bạn
      </button>
    );
  }
  if (sent) {
    return (
      <button onClick={() => cancelFriendRequest(sent.id)} className="btn-secondary flex items-center gap-1.5">
        <UserPlus className="w-4 h-4" /> Hủy lời mời
      </button>
    );
  }
  return (
    <button onClick={() => sendFriendRequest(user)} className="btn-primary flex items-center gap-1.5">
      <UserPlus className="w-4 h-4" /> Thêm bạn bè
    </button>
  );
};

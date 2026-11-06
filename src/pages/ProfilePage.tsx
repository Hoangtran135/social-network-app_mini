import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Edit3, UserPlus, UserCheck, MessageCircle, Image as ImageIcon, Users, FileText, Info, Ban, Flag, Briefcase, GraduationCap, MapPin, CalendarDays, Globe,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useChatWindows } from '../context/ChatWindowsContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { User } from '../types';
import { api } from '../utils/api';
import { EmptyState, PageLoading, TabButton, AvatarFrame } from '../components/ui';
import { ReportButton } from '../components/SystemReport';
import { SOCIAL_PLATFORMS } from '../utils/socialLinks';
import { CreatePostBox } from '../components/post/CreatePostBox';
import { PostCard } from '../components/post/PostCard';
import { PostFormModal } from '../components/post/PostFormModal';

// Trang cá nhân (/profile/:id): ảnh bìa, ảnh đại diện, thông tin, các nút (kết bạn, nhắn tin, chặn — hoặc sửa hồ sơ nếu là mình)
// và 4 tab: bài viết, bạn bè, hình ảnh, giới thiệu. Mở thẳng một tab bằng ?tab=photos.
// Tab bài viết chia 2 cột trên màn hình lớn: thẻ giới thiệu bên trái, danh sách bài bên phải.
// Lưu ý: tab bài viết chỉ lấy từ các bài đã tải trên bảng tin.

type Tab = 'posts' | 'friends' | 'photos' | 'about';
const TABS: Tab[] = ['posts', 'friends', 'photos', 'about'];
const toTab = (value: string | null): Tab => (TABS.includes(value as Tab) ? (value as Tab) : 'posts');

/** Một dòng thông tin có icon (nơi làm việc, học vấn...). Không có giá trị thì không hiện. */
const InfoRow: React.FC<{ icon: React.ElementType; children?: React.ReactNode }> = ({ icon: Icon, children }) =>
  children ? (
    <li className="flex items-start gap-2.5 text-sm text-slate-700">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  ) : null;

export const ProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const { currentUser, blockUser } = useAuth();
  const { posts, friends, following, followUser, unfollowUser, getUserFriends, getOrCreateConversation } = useSocial();
  const { openChat } = useChatWindows();
  const confirm = useConfirm();

  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = đang tải, null = không tìm thấy
  const [userFriends, setUserFriends] = useState<User[]>([]);
  const [tab, setTab] = useState<Tab>(toTab(params.get('tab')));
  const [isPosting, setIsPosting] = useState(false);
  const [stats, setStats] = useState<{ followersCount: number; followingCount: number } | null>(null);
  const isMe = id === currentUser?.id;
  const tabParam = params.get('tab');

  // Đổi người xem, hoặc bấm lối tắt có ?tab= (vd "Ảnh của tôi" ở sidebar) khi đang ở trang cá nhân → chuyển đúng tab
  useEffect(() => {
    setTab(toTab(tabParam));
  }, [id, tabParam]);

  // Người khác: tải hồ sơ và bạn bè của họ (chỉ tải lại khi đổi người xem, không tải lại mỗi khi danh sách bạn của mình đổi)
  useEffect(() => {
    if (!id || isMe) return;
    let cancelled = false;
    setUser(undefined);
    setUserFriends([]);
    api.get<{ user: User }>(`/users/${id}`).then((d) => !cancelled && setUser(d.user)).catch(() => !cancelled && setUser(null));
    getUserFriends(id).then((list) => !cancelled && setUserFriends(list));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isMe]);

  // Số người theo dõi / đang theo dõi (cả của mình)
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStats(null);
    api.get<{ followersCount: number; followingCount: number }>(`/users/${id}/follow-stats`).then((d) => !cancelled && setStats(d)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Của mình: dùng luôn dữ liệu đã có (tự cập nhật khi sửa hồ sơ / kết bạn)
  useEffect(() => {
    if (!isMe) return;
    setUser(currentUser);
    setUserFriends(friends);
  }, [isMe, currentUser, friends]);

  if (user === undefined) return <PageLoading text="Đang tải hồ sơ..." />;
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
  const userPosts = posts.filter((p) => !p.groupId && !p.kind && !p.pageId && (p.author.id === user.id || p.wallOwnerId === user.id)).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  const photos = userPosts.flatMap((p) => p.images || []);
  const joined = new Date(user.joinDate).toLocaleDateString('vi-VN');
  const links = SOCIAL_PLATFORMS.filter((p) => user.socialLinks?.[p.key]);
  const info: [string, React.ReactNode][] = [
    ['Tiểu sử', user.bio],
    ['Nơi làm việc', user.workplace],
    ['Học vấn', user.education],
    ['Nơi sống', user.location],
    ['Website', user.website && <a href={/^https?:\/\//.test(user.website) ? user.website : `https://${user.website}`} target="_blank" rel="noreferrer noopener" className="text-blue-600 hover:underline break-all">{user.website}</a>],
    ['Email', isMe ? user.email : undefined], // email chỉ hiện với chính chủ
    ['Tham gia', joined],
  ];

  return (
    <div className="page-wide">
      <div className="card rounded-2xl overflow-hidden mb-5">
        <div className="h-40 sm:h-56 lg:h-64 bg-gradient-to-r from-blue-600 to-purple-600">
          {user.coverImage && <img src={user.coverImage} alt="" className="w-full h-full object-cover" />}
        </div>

        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 -mt-14 sm:-mt-16 mb-4">
            <AvatarFrame frame={user.avatarFrame} className="shadow-xl">
              <img src={user.avatar} alt="" className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-white bg-slate-200 shrink-0" />
            </AvatarFrame>
            <div className="flex gap-2 flex-wrap justify-center">
              {isMe ? (
                <Link to="/settings/profile" className="btn-primary">
                  <Edit3 className="w-4 h-4" /> Chỉnh sửa trang cá nhân
                </Link>
              ) : (
                <>
                  <FriendButton user={user} />
                  <button
                    onClick={async () => {
                      const count = following.some((f) => f.id === user.id) ? await unfollowUser(user) : await followUser(user);
                      if (count !== undefined) setStats((s) => ({ followingCount: s?.followingCount ?? 0, followersCount: count }));
                    }}
                    aria-pressed={following.some((f) => f.id === user.id)}
                    className={`btn-stable ${following.some((f) => f.id === user.id) ? 'btn-secondary' : 'btn-primary'}`}
                  >
                    {following.some((f) => f.id === user.id) ? 'Đang theo dõi' : 'Theo dõi'}
                  </button>
                  <button onClick={async () => openChat(await getOrCreateConversation(user))} className="btn-secondary">
                    <MessageCircle className="w-4 h-4" /> Nhắn tin
                  </button>
                  <button
                    title="Chặn người dùng"
                    aria-label="Chặn người dùng"
                    onClick={async () => (await confirm(`Chặn ${user.name}? Hai bên sẽ không thể xem trang cá nhân, kết bạn hay nhắn tin cho nhau nữa.`)) && blockUser(user.id)}
                    className="btn-secondary px-3 hover:!bg-rose-50 hover:!text-rose-600"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                  <ReportButton targetType="user" targetId={user.id} label="Báo cáo người dùng" className="btn-secondary px-3 hover:!bg-rose-50 hover:!text-rose-600">
                    <Flag className="w-4 h-4" />
                  </ReportButton>
                </>
              )}
            </div>
          </div>

          <div className="text-center sm:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 break-words">{user.name}</h1>
            <p className="text-xs text-slate-500">@{user.username}</p>
            {user.bio && <p className="text-sm text-slate-700 mt-2.5 whitespace-pre-line break-words">{user.bio}</p>}
            {links.length > 0 && (
              <ul aria-label="Mạng xã hội" className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                {links.map(({ key, label, icon: Icon }) => (
                  <li key={key}>
                    <a href={user.socialLinks![key]} target="_blank" rel="noreferrer noopener nofollow" aria-label={label} title={label} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-blue-100 hover:text-blue-600 text-slate-600 flex items-center justify-center transition-colors">
                      <Icon className="w-4 h-4" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-500 mt-2">
              <b className="text-slate-700">{userFriends.length}</b> bạn bè · <b className="text-slate-700">{userPosts.length}</b> bài viết
              {stats && (
                <>
                  {' · '}
                  <b className="text-slate-700">{isMe ? following.length : stats.followingCount}</b> đang theo dõi · <b className="text-slate-700">{stats.followersCount}</b> người theo dõi
                </>
              )}
            </p>
          </div>

          <div className="flex gap-1 border-t border-slate-100 mt-5 pt-3 overflow-x-auto no-scrollbar scroll-fade-x">
            <TabButton icon={FileText} active={tab === 'posts'} onClick={() => setTab('posts')}>
              Bài viết
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
        <div className="grid lg:grid-cols-[19rem_minmax(0,1fr)] gap-5 items-start">
          {/* Thẻ giới thiệu nhanh (dính khi cuộn trên màn hình lớn) */}
          <aside className="card p-5 lg:sticky lg:top-20">
            <h2 className="section-title mb-3">Giới thiệu</h2>
            <ul className="space-y-3">
              <InfoRow icon={Briefcase}>{user.workplace && `Làm việc tại ${user.workplace}`}</InfoRow>
              <InfoRow icon={GraduationCap}>{user.education && `Học tại ${user.education}`}</InfoRow>
              <InfoRow icon={MapPin}>{user.location && `Sống tại ${user.location}`}</InfoRow>
              <InfoRow icon={Globe}>{user.website}</InfoRow>
              <InfoRow icon={CalendarDays}>Tham gia {joined}</InfoRow>
            </ul>
            {!user.workplace && !user.education && !user.location && !user.website && (
              <p className="text-xs text-slate-400 mt-3">{isMe ? 'Hãy thêm thông tin để mọi người hiểu bạn hơn.' : 'Chưa có thông tin giới thiệu.'}</p>
            )}
          </aside>

          <div className="min-w-0 max-w-2xl w-full">
            {/* Chỉ chính mình hoặc bạn bè mới được đăng bài lên tường */}
            {(isMe || isFriend) && <CreatePostBox placeholder={isMe ? undefined : `Viết gì đó cho ${user.name}...`} onClick={() => setIsPosting(true)} />}
            {userPosts.length === 0 && <EmptyState icon={FileText} title="Chưa có bài viết nào" />}
            {userPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      )}

      {tab === 'friends' &&
        (userFriends.length === 0 ? (
          <EmptyState icon={Users} title="Chưa có bạn bè nào" />
        ) : (
          <div className="card p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {userFriends.map((f) => (
              <Link key={f.id} to={`/profile/${f.id}`} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-blue-50 min-w-0">
                <img src={f.avatar} alt="" loading="lazy" className="w-12 h-12 rounded-full object-cover shrink-0" />
                <div className="text-xs min-w-0">
                  <b className="text-slate-900 block truncate">{f.name}</b>
                  <div className="text-slate-400 truncate">@{f.username}</div>
                </div>
              </Link>
            ))}
          </div>
        ))}

      {tab === 'photos' &&
        (photos.length === 0 ? (
          <EmptyState icon={ImageIcon} title="Chưa có hình ảnh nào" />
        ) : (
          <div className="card p-3 sm:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
            {photos.map((img) => (
              <a key={img} href={img} target="_blank" rel="noreferrer noopener" className="block aspect-square rounded-2xl overflow-hidden bg-slate-100">
                <img src={img} alt="" loading="lazy" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
              </a>
            ))}
          </div>
        ))}

      {tab === 'about' && (
        <div className="card p-5 sm:p-6 max-w-2xl space-y-4 text-sm">
          {info.map(([label, value]) => (
            <div key={label}>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">{label}</span>
              <div className="text-slate-800 break-words">{value || <span className="text-slate-400">Chưa cập nhật</span>}</div>
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
      <button onClick={async () => (await confirm(`Hủy kết bạn với ${user.name}?`)) && removeFriend(user.id)} className="btn-secondary btn-stable">
        <UserCheck className="w-4 h-4 text-emerald-600" /> Bạn bè
      </button>
    );
  }
  if (incoming) {
    return (
      <button onClick={() => acceptFriendRequest(incoming.id)} className="btn-primary btn-stable">
        <UserPlus className="w-4 h-4" /> Chấp nhận kết bạn
      </button>
    );
  }
  if (sent) {
    return (
      <button onClick={() => cancelFriendRequest(sent.id)} className="btn-secondary btn-stable">
        <UserPlus className="w-4 h-4" /> Hủy lời mời
      </button>
    );
  }
  return (
    <button onClick={() => sendFriendRequest(user)} className="btn-primary btn-stable">
      <UserPlus className="w-4 h-4" /> Thêm bạn bè
    </button>
  );
};

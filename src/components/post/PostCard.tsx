import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, MoreHorizontal, ThumbsUp, MessageCircle, Share2, Bookmark, Globe, Users, Lock, Edit2, Copy, Pin, LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocial } from '../../context/SocialContext';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useChatWindows } from '../../context/ChatWindowsContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { Post, ReactionType } from '../../types';
import { feelingText, timeAgo } from '../../utils/format';
import { UserLinks } from '../ui';
import { CommentSection } from './CommentSection';
import { PostFormModal } from './PostFormModal';

// Thẻ hiển thị MỘT bài viết (dùng ở bảng tin, trang cá nhân, đã lưu, kỷ niệm):
// phần đầu (tác giả, thời gian, quyền riêng tư, menu "..."), nội dung + ảnh/video, số cảm xúc / bình luận / chia sẻ,
// hàng nút (Thích — rê chuột để chọn cảm xúc, Bình luận, Chia sẻ, Lưu) và khung bình luận.
// Thẻ có id="post-<id>" để có thể cuộn tới khi bấm vào thông báo.

const REACTIONS: Record<ReactionType, { emoji: string; label: string; color: string }> = {
  like: { emoji: '👍', label: 'Thích', color: 'text-blue-600' },
  love: { emoji: '❤️', label: 'Yêu thích', color: 'text-rose-500' },
  haha: { emoji: '😄', label: 'Haha', color: 'text-amber-500' },
  wow: { emoji: '😮', label: 'Wow', color: 'text-amber-500' },
  sad: { emoji: '😢', label: 'Buồn', color: 'text-yellow-600' },
  angry: { emoji: '😡', label: 'Phẫn nộ', color: 'text-orange-600' },
};

const PRIVACY_ICONS = { public: Globe, friends: Users, only_me: Lock };

const MenuItem: React.FC<{ icon: LucideIcon; label: string; onClick: () => void; danger?: boolean }> = ({ icon: Icon, label, onClick, danger }) => (
  <button onClick={onClick} className={`w-full px-3.5 py-2.5 text-left flex items-center gap-2.5 hover:bg-slate-50 ${danger ? 'text-rose-600' : 'text-slate-700'}`}>
    <Icon className="w-4 h-4" /> {label}
  </button>
);

export const PostCard: React.FC<{ post: Post }> = ({ post }) => {
  const { currentUser } = useAuth();
  const { toggleReaction, toggleSavePost, togglePinPost, sharePost, sharePostToChat, getOrCreateConversation, deletePost, showToast, friends } = useSocial();
  const { openChat } = useChatWindows();
  const confirm = useConfirm();

  const [menu, setMenu] = useState<'options' | 'reactions' | 'share' | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showSendToFriend, setShowSendToFriend] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const menuRef = useClickOutside(() => setMenu(null));
  // Rê chuột vào nút Thích 300ms mới hiện bảng cảm xúc
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isOwner = currentUser?.id === post.author.id;
  const myReaction = post.reactions.find((r) => r.userId === currentUser?.id);
  const reactionTypes = [...new Set(post.reactions.map((r) => r.type))];
  const PrivacyIcon = PRIVACY_ICONS[post.privacy];

  /** Chọn mục trong menu thì đóng menu rồi mới làm việc. */
  const run = (action: () => void) => () => {
    setMenu(null);
    action();
  };

  const sendToFriend = async (friendId: string) => {
    const friend = friends.find((f) => f.id === friendId)!;
    const conversationId = await getOrCreateConversation(friend);
    await sharePostToChat(conversationId, post.id);
    setShowSendToFriend(false);
    openChat(conversationId);
  };

  return (
    <article id={`post-${post.id}`} className="card mb-5 scroll-mt-20">
      {/* ----- Phần đầu: tác giả, thời gian, menu "..." ----- */}
      <div className="p-5 pb-3 flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={`/profile/${post.author.id}`}>
            <img src={post.author.avatar} alt="" className="w-11 h-11 rounded-full object-cover" />
          </Link>
          <div className="min-w-0 text-sm">
            <div>
              <Link to={`/profile/${post.author.id}`} className="font-bold text-slate-900 hover:text-blue-600">
                {post.author.name}
              </Link>
              {post.wallOwnerId && (
                <span className="text-xs text-slate-500">
                  {' ➜ '}
                  <UserLinks users={[{ id: post.wallOwnerId, name: post.wallOwnerName || '' }]} />
                </span>
              )}
              {!!post.taggedUsers?.length && (
                <span className="text-xs text-slate-500">
                  {' cùng với '}
                  <UserLinks users={post.taggedUsers} />
                </span>
              )}
              {post.feeling && <span className="text-xs text-slate-500"> {feelingText(post.feeling)}</span>}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
              {post.pinned && <span className="text-blue-600 font-semibold">📌 Đã ghim ·</span>}
              <span>{timeAgo(post.createdAt)}</span>
              {post.updatedAt && <span className="italic">(đã chỉnh sửa)</span>}
              <span>·</span>
              <PrivacyIcon className="w-3.5 h-3.5" />
              {post.location && <span>· 📍 {post.location}</span>}
            </div>
          </div>
        </div>

        <div className="relative" ref={menu === 'options' ? menuRef : undefined}>
          <button onClick={() => setMenu(menu === 'options' ? null : 'options')} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {menu === 'options' && (
            <div className="absolute right-0 mt-1 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-30 text-xs font-semibold">
              <MenuItem icon={Bookmark} label={post.isSaved ? 'Bỏ lưu bài viết' : 'Lưu bài viết'} onClick={run(() => toggleSavePost(post.id))} />
              <MenuItem
                icon={Copy}
                label="Sao chép liên kết"
                onClick={run(() => {
                  navigator.clipboard.writeText(`${window.location.origin}/#post-${post.id}`);
                  showToast('Đã sao chép liên kết bài viết!');
                })}
              />
              {isOwner && (
                <>
                  <MenuItem icon={Pin} label={post.pinned ? 'Bỏ ghim bài viết' : 'Ghim bài viết'} onClick={run(() => togglePinPost(post.id))} />
                  <MenuItem icon={Edit2} label="Chỉnh sửa bài viết" onClick={run(() => setIsEditing(true))} />
                  <MenuItem
                    icon={Trash2}
                    label="Xóa bài viết"
                    danger
                    onClick={run(async () => (await confirm('Bạn có chắc muốn xóa bài viết này?')) && deletePost(post.id))}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ----- Nội dung, video, lưới ảnh (bấm ảnh để phóng to) ----- */}
      <p className="px-5 pb-3 text-slate-800 whitespace-pre-line">{post.content}</p>
      {post.video && <video src={post.video} controls className="w-full max-h-[32rem] bg-black" />}
      {post.images && (
        <div className={`grid gap-1 ${post.images.length === 1 ? 'grid-cols-1' : post.images.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {post.images.map((img) => (
            <img key={img} src={img} alt="" onClick={() => setPreviewImage(img)} className="w-full aspect-video object-cover cursor-pointer" />
          ))}
        </div>
      )}

      {/* ----- Số cảm xúc, bình luận, chia sẻ ----- */}
      <div className="px-5 py-2.5 flex items-center justify-between text-xs text-slate-500 border-b border-slate-100">
        <span>
          {reactionTypes.slice(0, 3).map((t) => REACTIONS[t].emoji)} {post.reactions.length} lượt thích
        </span>
        <span>
          <button onClick={() => setShowComments(!showComments)} className="hover:underline">
            {post.commentsCount} bình luận
          </button>
          {' · '}
          {post.sharesCount} lượt chia sẻ
        </span>
      </div>

      {/* ----- Hàng nút ----- */}
      <div className="px-2 py-1 flex text-slate-600 font-semibold text-sm">
        <div
          className="flex-1 relative"
          onMouseEnter={() => (hoverTimer.current = setTimeout(() => setMenu('reactions'), 300))}
          onMouseLeave={() => {
            clearTimeout(hoverTimer.current);
            if (menu === 'reactions') setMenu(null);
          }}
        >
          {menu === 'reactions' && (
            <div className="absolute -top-12 left-2 bg-white rounded-full px-2.5 py-1.5 shadow-2xl border border-slate-200 flex gap-2 z-40">
              {(Object.keys(REACTIONS) as ReactionType[]).map((type) => (
                <button key={type} title={REACTIONS[type].label} onClick={run(() => toggleReaction(post.id, type))} className="text-xl hover:scale-125 transition-transform">
                  {REACTIONS[type].emoji}
                </button>
              ))}
            </div>
          )}
          {/* Bấm nhanh: đã thả cảm xúc thì bấm lại = bỏ (server xử lý), chưa thả thì thả "like" */}
          <button
            onClick={() => toggleReaction(post.id, myReaction?.type || 'like')}
            className={`w-full py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-100 ${myReaction ? REACTIONS[myReaction.type].color : ''}`}
          >
            {myReaction ? `${REACTIONS[myReaction.type].emoji} ${REACTIONS[myReaction.type].label}` : <><ThumbsUp className="w-4 h-4" /> Thích</>}
          </button>
        </div>

        <button onClick={() => setShowComments(!showComments)} className="flex-1 py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-100">
          <MessageCircle className="w-4 h-4" /> Bình luận
        </button>

        <div className="relative flex-1" ref={menu === 'share' ? menuRef : undefined}>
          <button onClick={() => setMenu(menu === 'share' ? null : 'share')} className="w-full py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-100">
            <Share2 className="w-4 h-4" /> Chia sẻ
          </button>
          {menu === 'share' && (
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-20 text-xs">
              <MenuItem icon={Share2} label="Chia sẻ lên trang cá nhân" onClick={run(() => sharePost(post.id))} />
              <MenuItem icon={MessageCircle} label="Gửi qua tin nhắn" onClick={run(() => setShowSendToFriend(true))} />
            </div>
          )}
        </div>

        <button onClick={() => toggleSavePost(post.id)} title="Lưu" className={`px-3 py-2 rounded-xl hover:bg-slate-100 ${post.isSaved ? 'text-amber-500' : ''}`}>
          <Bookmark className={`w-4 h-4 ${post.isSaved ? 'fill-current' : ''}`} />
        </button>
      </div>

      {showComments && <CommentSection postId={post.id} />}

      {/* ----- Các hộp thoại ----- */}
      {isEditing && <PostFormModal post={post} onClose={() => setIsEditing(false)} />}

      {showSendToFriend && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={() => setShowSendToFriend(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 text-sm mb-3">Gửi bài viết cho bạn bè</h3>
            {friends.map((f) => (
              <button key={f.id} onClick={() => sendToFriend(f.id)} className="w-full flex items-center gap-3 p-2.5 hover:bg-blue-50 rounded-xl text-left">
                <img src={f.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                <span className="text-xs font-semibold text-slate-700">{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {previewImage && (
        <div onClick={() => setPreviewImage(null)} className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-pointer">
          <img src={previewImage} alt="" className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl" />
        </div>
      )}
    </article>
  );
};

import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, MoreHorizontal, ThumbsUp, MessageCircle, Share2, Bookmark, Globe, Users, Lock, Edit2, Copy, Pin, EyeOff, MessageSquareOff, MessageSquare, Flag, LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocial } from '../../context/SocialContext';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useChatWindows } from '../../context/ChatWindowsContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { GroupRole, Post, ReactionType } from '../../types';
import { feelingText, timeAgo } from '../../utils/format';
import { UserLinks, AvatarFrame, SquareAvatar } from '../ui';
import { CommentSection } from './CommentSection';
import { PostFormModal } from './PostFormModal';
import { PostContent } from './PostContent';
import { EditHistoryDialog, ImagePreview, ReportDialog, SendToFriendDialog, ShareDialog } from './PostDialogs';
import { REACTIONS } from '../../utils/reactions';

// Thẻ hiển thị MỘT bài viết (dùng ở bảng tin, trang cá nhân, đã lưu, kỷ niệm):
// phần đầu (tác giả, thời gian, quyền riêng tư, menu "..."), nội dung + ảnh/video, số cảm xúc / bình luận / chia sẻ,
// hàng nút (Thích — rê chuột để chọn cảm xúc, Bình luận, Chia sẻ, Lưu) và khung bình luận.
// Thẻ có id="post-<id>" để có thể cuộn tới khi bấm vào thông báo.

const PRIVACY_ICONS = { public: Globe, friends: Users, only_me: Lock };
const PRIVACY_LABELS = { public: 'Công khai', friends: 'Bạn bè', only_me: 'Chỉ mình tôi' };

/** Lưới ảnh của bài: 1 ảnh = ảnh lớn; 2 ảnh = 2 cột; 3 ảnh = 1 ảnh lớn bên trái + 2 ảnh nhỏ; từ 4 ảnh = lưới 2x2 (ảnh thứ 4 có "+N" nếu còn nữa). */
const ImageGrid: React.FC<{ images: string[]; onOpen: (img: string) => void }> = ({ images, onOpen }) => {
  const shown = images.slice(0, 4);
  const extra = images.length - shown.length;
  const layout = images.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
  return (
    <div className={`grid gap-0.5 ${layout}`}>
      {shown.map((img, i) => (
        <button
          key={img}
          type="button"
          aria-label="Xem ảnh lớn"
          onClick={() => onOpen(img)}
          className={`relative block overflow-hidden bg-slate-100 ${images.length === 1 ? 'max-h-[32rem]' : images.length === 3 && i === 0 ? 'row-span-2' : 'aspect-square'}`}
        >
          <img src={img} alt="" loading="lazy" className={`w-full object-cover ${images.length === 1 ? 'max-h-[32rem]' : 'h-full'}`} />
          {extra > 0 && i === 3 && <span className="absolute inset-0 bg-black/55 text-white text-2xl font-semibold flex items-center justify-center">+{extra}</span>}
        </button>
      ))}
    </div>
  );
};

const MenuItem: React.FC<{ icon: LucideIcon; label: string; onClick: () => void; danger?: boolean }> = ({ icon: Icon, label, onClick, danger }) => (
  <button onClick={onClick} className={`w-full px-3.5 py-2.5 text-left flex items-center gap-2.5 hover:bg-slate-50 whitespace-nowrap ${danger ? 'text-rose-600' : 'text-slate-700'}`}>
    <Icon className="w-4 h-4" /> {label}
  </button>
);

/** groupRole: vai trò của người xem trong nhóm của bài (chỉ truyền ở trang nhóm) — quản trị viên được xoá bài người khác, thành viên được báo cáo. */
/** pageAdmin: người xem là quản trị viên của Trang đã đăng bài này (chỉ truyền ở trang của Trang) — được xoá bài của trang. */
export const PostCard: React.FC<{ post: Post; groupRole?: GroupRole | null; pageAdmin?: boolean }> = ({ post, groupRole = null, pageAdmin = false }) => {
  const { currentUser } = useAuth();
  const { toggleReaction, toggleSavePost, togglePinPost, sharePost, sharePostToChat, getOrCreateConversation, deletePost, hidePost, toggleComments, showToast, friends, deleteGroupPost, reportGroupPost, deletePagePost } = useSocial();
  const { openChat } = useChatWindows();
  const confirm = useConfirm();

  const [menu, setMenu] = useState<'options' | 'reactions' | 'share' | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showSendToFriend, setShowSendToFriend] = useState(false);
  const [shareDialog, setShareDialog] = useState(false); // hộp thoại chia sẻ kèm lời bình
  const [showHistory, setShowHistory] = useState(false); // lịch sử chỉnh sửa
  const [reportOpen, setReportOpen] = useState(false); // hộp thoại báo cáo bài trong nhóm
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const menuRef = useClickOutside(() => setMenu(null));
  const hasReactions = post.reactions.length > 0;
  const hasStats = hasReactions || post.commentsCount > 0 || post.sharesCount > 0;
  // Rê chuột vào nút Thích 300ms mới hiện bảng cảm xúc
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Màn hình cảm ứng không có "rê chuột" → nhấn giữ nút Thích 400ms để mở bảng cảm xúc
  const longPress = useRef(false);
  useEscapeKey(() => {
    setPreviewImage(null);
    setShowSendToFriend(false);
    setShareDialog(false);
    setShowHistory(false);
    setReportOpen(false);
  });

  const isOwner = currentUser?.id === post.author.id;
  const myReaction = post.reactions.find((r) => r.userId === currentUser?.id);
  const reactionTypes = [...new Set(post.reactions.map((r) => r.type))];
  const isGroupPost = !!post.groupId;
  const canModerate = isGroupPost && (groupRole === 'owner' || groupRole === 'admin');
  const PrivacyIcon = isGroupPost ? Users : PRIVACY_ICONS[post.privacy];
  const privacyLabel = isGroupPost ? `Bài viết trong nhóm ${post.groupName || ''}`.trim() : PRIVACY_LABELS[post.privacy];

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
          <Link to={post.pageId ? `/pages/${post.pageId}` : `/profile/${post.author.id}`} aria-label={post.pageId ? `Trang ${post.pageName}` : undefined}>
            {post.pageId ? (
              <SquareAvatar item={{ name: post.pageName || '?', avatar: post.pageAvatar }} size="w-11 h-11" />
            ) : (
              <AvatarFrame frame={post.author.avatarFrame}>
                <img src={post.author.avatar} alt="" loading="lazy" className="w-11 h-11 rounded-full object-cover shrink-0" />
              </AvatarFrame>
            )}
          </Link>
          <div className="min-w-0 text-sm">
            <div>
              <Link to={post.pageId ? `/pages/${post.pageId}` : `/profile/${post.author.id}`} className="tap-area font-semibold text-slate-900 hover:text-blue-600 break-words">
                {post.pageId ? post.pageName : post.author.name}
              </Link>
              {post.pageId && pageAdmin && <span className="text-xs text-slate-500"> · đăng bởi {post.author.name}</span>}
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
            <div className="flex items-center flex-wrap gap-x-1.5 text-xs text-slate-400 mt-0.5">
              {post.pinned && <span className="text-blue-600 font-semibold">📌 Đã ghim ·</span>}
              <span>{timeAgo(post.createdAt)}</span>
              {post.updatedAt && (
                <button onClick={() => setShowHistory(true)} className="italic hover:underline" title="Xem lịch sử chỉnh sửa">
                  (đã chỉnh sửa)
                </button>
              )}
              <span>·</span>
              <span title={privacyLabel} className="inline-flex">
                <PrivacyIcon className="w-3.5 h-3.5" />
              </span>
              {post.groupStatus === 'pending' && <span className="text-amber-600 font-semibold">· Đang chờ duyệt</span>}
              {post.location && <span>· 📍 {post.location}</span>}
            </div>
          </div>
        </div>

        <div className="relative" ref={menu === 'options' ? menuRef : undefined}>
          <button onClick={() => setMenu(menu === 'options' ? null : 'options')} aria-label="Tuỳ chọn bài viết" aria-expanded={menu === 'options'} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {menu === 'options' && (
            <div className="animate-pop absolute right-0 mt-1 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-30 text-xs font-semibold">
              {!isGroupPost && <MenuItem icon={Bookmark} label={post.isSaved ? 'Bỏ lưu bài viết' : 'Lưu bài viết'} onClick={run(() => toggleSavePost(post.id))} />}
              {!isOwner && <MenuItem icon={EyeOff} label="Ẩn bài viết" onClick={run(() => hidePost(post.id))} />}
              <MenuItem
                icon={Copy}
                label="Sao chép liên kết"
                onClick={run(() => {
                  navigator.clipboard.writeText(`${window.location.origin}/#post-${post.id}`);
                  showToast('Đã sao chép liên kết bài viết!');
                })}
              />
              {isGroupPost && !isOwner && !!groupRole && post.groupStatus !== 'pending' && <MenuItem icon={Flag} label="Báo cáo bài viết" onClick={run(() => setReportOpen(true))} />}
              {pageAdmin && !isOwner && !!post.pageId && (
                <MenuItem
                  icon={Trash2}
                  label="Xóa khỏi trang"
                  danger
                  onClick={run(async () => (await confirm('Xóa bài viết này khỏi trang?')) && deletePagePost(post.pageId!, post.id))}
                />
              )}
              {canModerate && !isOwner && (
                <MenuItem
                  icon={Trash2}
                  label="Xóa khỏi nhóm"
                  danger
                  onClick={run(async () => (await confirm('Xóa bài viết này khỏi nhóm?')) && deleteGroupPost(post.groupId!, post.id))}
                />
              )}
              {isOwner && (
                <>
                  {!isGroupPost && <MenuItem icon={Pin} label={post.pinned ? 'Bỏ ghim bài viết' : 'Ghim bài viết'} onClick={run(() => togglePinPost(post.id))} />}
                  <MenuItem
                    icon={post.commentsDisabled ? MessageSquare : MessageSquareOff}
                    label={post.commentsDisabled ? 'Bật bình luận' : 'Tắt bình luận'}
                    onClick={run(() => toggleComments(post.id))}
                  />
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
      {post.content && <PostContent text={post.content} className="px-5 pb-3 text-slate-800" />}
      {post.video && <video src={post.video} controls preload="metadata" className="w-full max-h-[32rem] bg-black" />}
      {!!post.images?.length && <ImageGrid images={post.images} onOpen={setPreviewImage} />}

      {/* ----- Số cảm xúc, bình luận, chia sẻ ----- */}
      {hasStats && (
        <div className="px-5 py-2.5 flex items-center justify-between gap-3 text-xs text-slate-500 border-b border-slate-100">
          <span>{hasReactions && `${reactionTypes.slice(0, 3).map((t) => REACTIONS[t].emoji).join('')} ${post.reactions.length}`}</span>
          <span className="text-right">
            {post.commentsCount > 0 && (
              <button onClick={() => setShowComments(!showComments)} className="tap-area hover:underline">
                {post.commentsCount} bình luận
              </button>
            )}
            {post.commentsCount > 0 && post.sharesCount > 0 && ' · '}
            {post.sharesCount > 0 && `${post.sharesCount} lượt chia sẻ`}
          </span>
        </div>
      )}

      {/* ----- Hàng nút ----- */}
      <div className={`px-2 py-1 flex text-slate-600 font-semibold text-xs sm:text-sm ${hasStats ? '' : 'border-t border-slate-100'}`}>
        <div
          className="flex-1 relative"
          ref={menu === 'reactions' ? menuRef : undefined}
          onMouseEnter={() => (hoverTimer.current = setTimeout(() => setMenu('reactions'), 300))}
          onMouseLeave={() => {
            clearTimeout(hoverTimer.current);
            if (menu === 'reactions') setMenu(null);
          }}
        >
          {menu === 'reactions' && (
            <div className="animate-pop absolute -top-12 left-2 bg-white rounded-full px-2.5 py-1.5 shadow-2xl border border-slate-200 flex gap-2 z-40">
              {(Object.keys(REACTIONS) as ReactionType[]).map((type) => (
                <button key={type} title={REACTIONS[type].label} aria-label={REACTIONS[type].label} onClick={run(() => toggleReaction(post.id, type))} className="text-xl hover:scale-125 transition-transform">
                  {REACTIONS[type].emoji}
                </button>
              ))}
            </div>
          )}
          {/* Bấm nhanh: đã thả cảm xúc thì bấm lại = bỏ (server xử lý), chưa thả thì thả "like". Nhấn giữ (cảm ứng) = mở bảng cảm xúc */}
          <button
            onClick={() => {
              if (longPress.current) {
                longPress.current = false;
                return;
              }
              toggleReaction(post.id, myReaction?.type || 'like');
            }}
            onTouchStart={() => {
              longPress.current = false;
              hoverTimer.current = setTimeout(() => {
                longPress.current = true;
                setMenu('reactions');
              }, 400);
            }}
            onTouchEnd={() => clearTimeout(hoverTimer.current)}
            onTouchMove={() => clearTimeout(hoverTimer.current)}
            onContextMenu={(e) => e.preventDefault()}
            className={`w-full py-2 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 hover:bg-slate-100 select-none ${myReaction ? REACTIONS[myReaction.type].color : ''}`}
          >
            {myReaction ? `${REACTIONS[myReaction.type].emoji} ${REACTIONS[myReaction.type].label}` : <><ThumbsUp className="w-4 h-4" /> Thích</>}
          </button>
        </div>

        <button onClick={() => setShowComments(!showComments)} aria-expanded={showComments} className="flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 hover:bg-slate-100">
          <MessageCircle className="w-4 h-4" /> Bình luận
        </button>

        {!isGroupPost && (
        <div className="relative flex-1" ref={menu === 'share' ? menuRef : undefined}>
          <button onClick={() => setMenu(menu === 'share' ? null : 'share')} className="w-full py-2 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 hover:bg-slate-100">
            <Share2 className="w-4 h-4" /> Chia sẻ
          </button>
          {menu === 'share' && (
            <div className="animate-pop absolute bottom-full mb-1 right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 w-60 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-20 text-xs">
              <MenuItem icon={Share2} label="Chia sẻ lên trang cá nhân" onClick={run(() => setShareDialog(true))} />
              <MenuItem icon={MessageCircle} label="Gửi qua tin nhắn" onClick={run(() => setShowSendToFriend(true))} />
            </div>
          )}
        </div>
        )}

        {!isGroupPost && (
        <button
          onClick={() => toggleSavePost(post.id)}
          title={post.isSaved ? 'Bỏ lưu' : 'Lưu bài viết'}
          aria-label={post.isSaved ? 'Bỏ lưu bài viết' : 'Lưu bài viết'}
          aria-pressed={!!post.isSaved}
          className={`px-3 py-2 rounded-xl hover:bg-slate-100 ${post.isSaved ? 'text-amber-500' : ''}`}
        >
          <Bookmark className={`w-4 h-4 ${post.isSaved ? 'fill-current' : ''}`} />
        </button>
        )}
      </div>

      {showComments && <CommentSection postId={post.id} disabled={!!post.commentsDisabled} />}

      {/* ----- Các hộp thoại ----- */}
      {isEditing && <PostFormModal post={post} onClose={() => setIsEditing(false)} />}

      {showSendToFriend && <SendToFriendDialog friends={friends} onPick={sendToFriend} onClose={() => setShowSendToFriend(false)} />}
      {shareDialog && (
        <ShareDialog
          post={post}
          onClose={() => setShareDialog(false)}
          onShare={(message) => {
            sharePost(post.id, message);
            setShareDialog(false);
          }}
        />
      )}
      {reportOpen && (
        <ReportDialog
          onClose={() => setReportOpen(false)}
          onSubmit={async (reason) => {
            await reportGroupPost(post.groupId!, post.id, reason);
            setReportOpen(false);
          }}
        />
      )}
      {showHistory && <EditHistoryDialog post={post} onClose={() => setShowHistory(false)} />}
      {previewImage && <ImagePreview src={previewImage} onClose={() => setPreviewImage(null)} />}
    </article>
  );
};

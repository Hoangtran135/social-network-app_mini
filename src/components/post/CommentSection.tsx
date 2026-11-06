import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, Trash2, Loader2, UserPlus, Send } from 'lucide-react';
import { ReportButton } from '../SystemReport';
import { useAuth } from '../../context/AuthContext';
import { useSocial } from '../../context/SocialContext';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useMention } from '../../hooks/useMention';
import { Comment, ReactionType } from '../../types';
import { useReactionPicker } from '../../hooks/useReactionPicker';
import { useClickOutside } from '../../hooks/useClickOutside';
import { REACTIONS, REACTION_TYPES } from '../../utils/reactions';
import { timeAgo } from '../../utils/format';
import { UserLinks } from '../ui';
import { FriendPicker, toggleId } from '../FriendPicker';
import { MentionSuggestions } from './MentionSuggestions';

// Khung bình luận bên dưới một bài viết: ô viết bình luận (đính kèm ảnh, gắn thẻ bạn bè bằng @ hoặc bằng danh sách)
// và danh sách bình luận 2 cấp: bình luận gốc, bên dưới là các câu trả lời của nó.

export const CommentSection: React.FC<{ postId: string; disabled?: boolean; focusCommentId?: string }> = ({ postId, disabled = false, focusCommentId }) => {
  const { currentUser } = useAuth();
  const { comments, fetchComments, addComment, friends } = useSocial();
  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  const [taggedIds, setTaggedIds] = useState<string[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);

  const mention = useMention(text, setText, friends, (f) => setTaggedIds((ids) => (ids.includes(f.id) ? ids : [...ids, f.id])));
  const imageUpload = useFileUpload((files) => setImage(files[0].url));

  // Tải bình luận khi khung bình luận được mở lần đầu
  useEffect(() => {
    fetchComments(postId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const all = comments[postId] || [];

  // Từ thông báo: bình luận tải về xong thì cuộn tới và viền sáng 2 giây (chỉ một lần)
  const focused = useRef(false);
  const hasFocusTarget = !!focusCommentId && all.some((c) => c.id === focusCommentId);
  useEffect(() => {
    if (!hasFocusTarget || focused.current) return;
    focused.current = true;
    const el = document.getElementById(`comment-${focusCommentId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('ring-2', 'ring-blue-500', 'rounded-2xl');
    setTimeout(() => el?.classList.remove('ring-2', 'ring-blue-500', 'rounded-2xl'), 2000);
  }, [hasFocusTarget, focusCommentId]);
  const [sort, setSort] = useState<'oldest' | 'newest' | 'top'>('oldest');
  const byTime = (a: Comment, b: Comment) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  const sorters = { oldest: byTime, newest: (a: Comment, b: Comment) => byTime(b, a), top: (a: Comment, b: Comment) => reactionsOf(b).length - reactionsOf(a).length || byTime(a, b) };
  const topLevel = all.filter((c) => !c.parentId).sort(sorters[sort]);
  const repliesOf = (id: string) => all.filter((c) => c.parentId === id);
  const taggedUsers = friends.filter((f) => taggedIds.includes(f.id));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !image) return;
    addComment(postId, { content: text, image: image || undefined, taggedUserIds: taggedIds });
    setText('');
    setImage('');
    setTaggedIds([]);
    setShowTagPicker(false);
    mention.reset();
  };

  return (
    <div className="px-3 sm:px-5 py-3 bg-slate-50 border-t border-slate-100 space-y-3 rounded-b-2xl">
      {disabled && <p className="text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200 py-2.5">🔕 Chủ bài viết đã tắt bình luận.</p>}
      {!disabled && (
      <form onSubmit={handleSubmit} className="flex items-start gap-2.5">
        <img src={currentUser?.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 p-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/10">
          <div className="relative">
            <textarea
              ref={mention.textareaRef}
              rows={2}
              value={text}
              onChange={mention.onChange}
              placeholder="Viết bình luận... (gõ @ để gắn thẻ)"
              className="w-full text-xs resize-none focus:outline-none p-1"
            />
            <MentionSuggestions matches={mention.matches} onSelect={mention.select} />
          </div>
          {image && (
            <div className="relative inline-block mt-2">
              <img src={image} alt="" className="h-16 rounded-lg" />
              <button type="button" aria-label="Bỏ ảnh" onClick={() => setImage('')} className="absolute top-1 right-1 p-1 bg-slate-900/80 text-white rounded-full">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
          {taggedUsers.length > 0 && <p className="text-[11px] text-slate-500 mt-1">cùng với <UserLinks users={taggedUsers} /></p>}

          <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1 text-slate-400">
            <div className="flex gap-1">
              <input ref={imageUpload.inputRef} type="file" accept="image/*" className="hidden" onChange={imageUpload.onChange} />
              <button type="button" title="Đính kèm ảnh" aria-label="Đính kèm ảnh" onClick={imageUpload.open} className="p-1.5 rounded-md hover:text-emerald-600 hover:bg-slate-50">
                {imageUpload.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              </button>
              <button type="button" title="Gắn thẻ bạn bè" aria-label="Gắn thẻ bạn bè" onClick={() => setShowTagPicker(!showTagPicker)} className={`p-1.5 rounded-md hover:text-blue-600 hover:bg-slate-50 ${showTagPicker ? 'text-blue-600' : ''}`}>
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
            <button type="submit" aria-label="Gửi bình luận" disabled={(!text.trim() && !image) || imageUpload.isUploading} className="p-2 rounded-full bg-blue-600 text-white disabled:opacity-40">
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          {showTagPicker && (
            <div className="mt-2">
              <FriendPicker friends={friends} selectedIds={taggedIds} onToggle={(id) => setTaggedIds(toggleId(taggedIds, id))} />
            </div>
          )}
        </div>
      </form>
      )}

      {topLevel.length > 1 && (
        <div className="flex justify-end">
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sắp xếp bình luận" className="text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <option value="oldest">Cũ nhất</option>
            <option value="newest">Mới nhất</option>
            <option value="top">Nổi bật</option>
          </select>
        </div>
      )}
      {topLevel.length === 0 && !disabled && <p className="text-center text-xs text-slate-400 py-2">Chưa có bình luận nào. Hãy là người đầu tiên bình luận!</p>}
      {topLevel.map((c) => (
        <CommentItem key={c.id} comment={c} postId={postId} canReply={!disabled}>
          {repliesOf(c.id).map((r) => (
            <CommentItem key={r.id} comment={r} postId={postId} canReply={false} />
          ))}
        </CommentItem>
      ))}
    </div>
  );
};

/** Các cảm xúc của bình luận (dữ liệu cũ chỉ có likes thì coi như toàn "like"). */
const reactionsOf = (c: Comment) => c.reactions ?? c.likes.map((userId) => ({ type: 'like' as ReactionType, userId }));

/** Một bình luận: nội dung, nút Thích (rê chuột / nhấn giữ để chọn cảm xúc) / Trả lời / Sửa / Xoá. children = các câu trả lời (chỉ bình luận gốc mới có). */
const CommentItem: React.FC<{ comment: Comment; postId: string; canReply?: boolean; children?: React.ReactNode }> = ({ comment: c, postId, canReply = true, children }) => {
  const { currentUser } = useAuth();
  const { reactToComment, editComment, deleteComment, addComment } = useSocial();
  const confirm = useConfirm();
  const picker = useReactionPicker();
  const pickerRef = useClickOutside(() => picker.close());
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.content);
  const isReply = !!c.parentId;
  const isMine = currentUser?.id === c.author.id;
  const reactions = reactionsOf(c);
  const myReaction = reactions.find((r) => r.userId === currentUser?.id)?.type;
  const topEmojis = [...new Set(reactions.map((r) => r.type))].slice(0, 3).map((t) => REACTIONS[t].emoji).join('');

  const sendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    addComment(postId, { content: reply, parentId: c.id });
    setReply('');
    setReplying(false);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() && !c.image) return;
    if (await editComment(postId, c.id, draft)) setEditing(false);
  };

  return (
    <div id={`comment-${c.id}`} className="flex items-start gap-2.5">
      <Link to={`/profile/${c.author.id}`}>
        <img src={c.author.avatar} alt="" className={`${isReply ? 'w-6 h-6' : 'w-7 h-7'} rounded-full object-cover shrink-0`} />
      </Link>
      <div className="flex-1 min-w-0">
        {editing ? (
          <form onSubmit={saveEdit} className="space-y-1.5">
            <textarea autoFocus rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Sửa bình luận" className="w-full text-xs bg-white border border-blue-300 rounded-2xl p-2.5 focus:outline-none resize-none" />
            <div className="flex gap-2 text-[11px] font-semibold">
              <button type="submit" disabled={!draft.trim() && !c.image} className="px-3 py-1 rounded-full bg-blue-600 text-white disabled:opacity-40">
                Lưu
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(c.content);
                }}
                className="px-3 py-1 rounded-full bg-slate-200 text-slate-700"
              >
                Hủy
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-white rounded-2xl p-2.5 border border-slate-200 inline-block max-w-full text-xs">
            <Link to={`/profile/${c.author.id}`} className="font-semibold text-slate-900 hover:underline">
              {c.author.name}
            </Link>
            <p className="text-slate-800 mt-0.5 whitespace-pre-line break-words">{c.content}</p>
            {!!c.taggedUsers?.length && <p className="text-[11px] text-slate-500 mt-1">cùng với <UserLinks users={c.taggedUsers} /></p>}
            {c.image && <img src={c.image} alt="" className="mt-2 rounded-lg max-h-40" />}
          </div>
        )}

        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500 mt-1 pl-2">
          <span>{timeAgo(c.createdAt)}</span>
          {c.editedAt && <span className="italic font-normal">(đã chỉnh sửa)</span>}
          <div className="relative" ref={pickerRef} {...picker.containerProps}>
            {picker.open && (
              <div className="animate-pop absolute bottom-full mb-1 left-0 bg-white rounded-full px-2 py-1 shadow-xl border border-slate-200 flex gap-1.5 z-30">
                {REACTION_TYPES.map((type) => (
                  <button
                    key={type}
                    title={REACTIONS[type].label}
                    aria-label={`${REACTIONS[type].label} (bình luận)`}
                    onClick={() => {
                      picker.close();
                      reactToComment(postId, c.id, type);
                    }}
                    className="text-lg hover:scale-125 transition-transform"
                  >
                    {REACTIONS[type].emoji}
                  </button>
                ))}
              </div>
            )}
            <button
              {...picker.buttonProps}
              onClick={() => !picker.consumeLongPress() && reactToComment(postId, c.id, myReaction ?? 'like')}
              className={myReaction ? REACTIONS[myReaction].color : 'hover:underline'}
            >
              {myReaction ? `${REACTIONS[myReaction].emoji} ${REACTIONS[myReaction].label}` : 'Thích'}
            </button>
          </div>
          {reactions.length > 0 && (
            <span title={`${reactions.length} cảm xúc`} className="bg-white border border-slate-200 rounded-full px-1.5 py-0.5 text-[11px]">
              {topEmojis} {reactions.length}
            </span>
          )}
          {!isReply && canReply && (
            <button onClick={() => setReplying(!replying)} className="hover:underline">
              Trả lời
            </button>
          )}
          {isMine && !editing && (
            <button
              onClick={() => {
                setDraft(c.content);
                setEditing(true);
              }}
              className="hover:underline"
            >
              Sửa
            </button>
          )}
          {!isMine && (
            <ReportButton targetType="comment" targetId={c.id} label="Báo cáo bình luận" className="hover:underline">
              Báo cáo
            </ReportButton>
          )}
          {isMine && (
            <button onClick={async () => (await confirm('Xóa bình luận này?')) && deleteComment(postId, c.id)} className="text-rose-500 hover:underline">
              Xóa
            </button>
          )}
        </div>

        {replying && (
          <form onSubmit={sendReply} className="flex items-center gap-2 mt-2 pl-2">
            <input autoFocus value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Trả lời ${c.author.name}...`} className="flex-1 min-w-0 text-xs bg-white border border-slate-200 rounded-full px-3.5 py-2 focus:outline-none focus:border-blue-400" />
            <button type="submit" aria-label="Gửi trả lời" disabled={!reply.trim()} className="p-2 rounded-full bg-blue-600 text-white disabled:opacity-40">
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {children && <div className="mt-2.5 pl-2 space-y-2.5 border-l-2 border-slate-100">{children}</div>}
      </div>
    </div>
  );
};

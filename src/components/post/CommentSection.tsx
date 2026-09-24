import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, Trash2, Loader2, UserPlus, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocial } from '../../context/SocialContext';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useMention } from '../../hooks/useMention';
import { Comment } from '../../types';
import { timeAgo } from '../../utils/format';
import { UserLinks } from '../ui';
import { FriendPicker, toggleId } from '../FriendPicker';
import { MentionSuggestions } from './MentionSuggestions';

// Khung bình luận bên dưới một bài viết: ô viết bình luận (đính kèm ảnh, gắn thẻ bạn bè bằng @ hoặc bằng danh sách)
// và danh sách bình luận 2 cấp: bình luận gốc, bên dưới là các câu trả lời của nó.

export const CommentSection: React.FC<{ postId: string }> = ({ postId }) => {
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
  const topLevel = all.filter((c) => !c.parentId);
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
    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 space-y-3 rounded-b-2xl">
      <form onSubmit={handleSubmit} className="flex items-start gap-2.5">
        <img src={currentUser?.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-2">
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
              <button type="button" onClick={() => setImage('')} className="absolute top-1 right-1 p-0.5 bg-slate-900/80 text-white rounded-full">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
          {taggedUsers.length > 0 && <p className="text-[11px] text-slate-500 mt-1">cùng với <UserLinks users={taggedUsers} /></p>}

          <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1 text-slate-400">
            <div className="flex gap-1">
              <input ref={imageUpload.inputRef} type="file" accept="image/*" className="hidden" onChange={imageUpload.onChange} />
              <button type="button" title="Đính kèm ảnh" onClick={imageUpload.open} className="p-1 rounded-md hover:text-emerald-600">
                {imageUpload.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              </button>
              <button type="button" title="Gắn thẻ bạn bè" onClick={() => setShowTagPicker(!showTagPicker)} className="p-1 rounded-md hover:text-blue-600">
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
            <button type="submit" disabled={!text.trim() && !image} className="p-1.5 rounded-full bg-blue-600 text-white disabled:opacity-40">
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

      {topLevel.map((c) => (
        <CommentItem key={c.id} comment={c} postId={postId}>
          {repliesOf(c.id).map((r) => (
            <CommentItem key={r.id} comment={r} postId={postId} />
          ))}
        </CommentItem>
      ))}
    </div>
  );
};

/** Một bình luận: nội dung, nút Thích / Trả lời / Xoá. children = các câu trả lời (chỉ bình luận gốc mới có). */
const CommentItem: React.FC<{ comment: Comment; postId: string; children?: React.ReactNode }> = ({ comment: c, postId, children }) => {
  const { currentUser } = useAuth();
  const { toggleLikeComment, deleteComment, addComment } = useSocial();
  const confirm = useConfirm();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const isReply = !!c.parentId;
  const liked = c.likes.includes(currentUser?.id || '');

  const sendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    addComment(postId, { content: reply, parentId: c.id });
    setReply('');
    setReplying(false);
  };

  return (
    <div className="flex items-start gap-2.5">
      <Link to={`/profile/${c.author.id}`}>
        <img src={c.author.avatar} alt="" className={`${isReply ? 'w-6 h-6' : 'w-7 h-7'} rounded-full object-cover`} />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-2xl p-2.5 border border-slate-200 inline-block max-w-full text-xs">
          <Link to={`/profile/${c.author.id}`} className="font-bold text-slate-900 hover:underline">
            {c.author.name}
          </Link>
          <p className="text-slate-800 mt-0.5">{c.content}</p>
          {!!c.taggedUsers?.length && <p className="text-[11px] text-slate-500 mt-1">cùng với <UserLinks users={c.taggedUsers} /></p>}
          {c.image && <img src={c.image} alt="" className="mt-2 rounded-lg max-h-40" />}
        </div>

        <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500 mt-1 pl-2">
          <span>{timeAgo(c.createdAt)}</span>
          <button onClick={() => toggleLikeComment(postId, c.id)} className={liked ? 'text-blue-600' : 'hover:underline'}>
            Thích {c.likes.length > 0 && `(${c.likes.length})`}
          </button>
          {!isReply && (
            <button onClick={() => setReplying(!replying)} className="hover:underline">
              Trả lời
            </button>
          )}
          {currentUser?.id === c.author.id && (
            <button onClick={async () => (await confirm('Xóa bình luận này?')) && deleteComment(postId, c.id)} className="text-rose-500 hover:underline">
              Xóa
            </button>
          )}
        </div>

        {replying && (
          <form onSubmit={sendReply} className="flex items-center gap-2 mt-2 pl-2">
            <input autoFocus value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Trả lời ${c.author.name}...`} className="flex-1 text-xs bg-white border border-slate-200 rounded-full px-3 py-1.5" />
            <button type="submit" disabled={!reply.trim()} className="p-1.5 rounded-full bg-blue-600 text-white disabled:opacity-40">
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {children && <div className="mt-2.5 pl-2 space-y-2.5 border-l-2 border-slate-100">{children}</div>}
      </div>
    </div>
  );
};

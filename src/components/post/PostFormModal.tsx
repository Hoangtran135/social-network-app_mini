import React, { useState } from 'react';
import { Smile, X, Image as ImageIcon, Trash2, Loader2, UserPlus, Video as VideoIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocial } from '../../context/SocialContext';
import { Post, Privacy, User } from '../../types';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useMention } from '../../hooks/useMention';
import { feelingText } from '../../utils/format';
import { FriendPicker, toggleId } from '../FriendPicker';
import { MentionSuggestions } from './MentionSuggestions';

// Hộp thoại đăng bài MỚI hoặc SỬA bài (có truyền post = đang sửa bài đó).
// Gồm: nội dung (gõ @ để gắn thẻ), quyền riêng tư, ảnh HOẶC video, cảm xúc, gắn thẻ bạn bè.
// wallOwner: có giá trị khi đăng lên tường người khác (mở từ trang cá nhân của họ).
// Cách dùng: {open && <PostFormModal onClose={() => setOpen(false)} />}

const FEELINGS = ['hạnh phúc 😊', 'hào hứng 🌟', 'thư giãn ☕', 'tuyệt vời 🌄', 'đang ăn 🍕', 'đang du lịch ✈️', 'đang code 💻', 'yêu đời ❤️'];

export const PostFormModal: React.FC<{ post?: Post; wallOwner?: User; onClose: () => void }> = ({ post, wallOwner, onClose }) => {
  const { createPost, updatePost, friends } = useSocial();
  const { currentUser } = useAuth();
  const isEdit = !!post;

  const [content, setContent] = useState(post?.content || '');
  const [privacy, setPrivacy] = useState<Privacy>(post?.privacy || 'public');
  const [feeling, setFeeling] = useState(post?.feeling || '');
  const [images, setImages] = useState<string[]>(post?.images || []);
  const [video, setVideo] = useState(post?.video || '');
  const [taggedIds, setTaggedIds] = useState<string[]>([]);
  const [panel, setPanel] = useState<'feelings' | 'tags' | null>(null);

  const mention = useMention(content, setContent, friends, (f) => setTaggedIds((ids) => (ids.includes(f.id) ? ids : [...ids, f.id])));
  const imageUpload = useFileUpload((files) => setImages((list) => [...list, ...files.map((f) => f.url)]));
  const videoUpload = useFileUpload((files) => setVideo(files[0].url));

  const isEmpty = !content.trim() && images.length === 0 && !video;
  const taggedUsers = friends.filter((f) => taggedIds.includes(f.id));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmpty) return;
    const data = { content, privacy, feeling: feeling || undefined, images, video: video || undefined };
    if (isEdit) updatePost(post.id, data);
    else createPost({ ...data, wallOwner, taggedUserIds: taggedIds });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">{isEdit ? 'Chỉnh sửa bài viết' : wallOwner ? `Đăng lên tường của ${wallOwner.name}` : 'Tạo bài viết mới'}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <img src={currentUser?.avatar} alt="" className="w-11 h-11 rounded-full object-cover" />
          <div>
            <div className="font-bold text-sm text-slate-800">
              {currentUser?.name}
              {feeling && <span className="font-normal text-slate-500 text-xs"> {feelingText(feeling)}</span>}
              {taggedUsers.length > 0 && <span className="font-normal text-slate-500 text-xs"> cùng với {taggedUsers.map((u) => u.name).join(', ')}</span>}
            </div>
            <select value={privacy} onChange={(e) => setPrivacy(e.target.value as Privacy)} className="mt-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-lg px-2 py-0.5">
              <option value="public">🌐 Công khai</option>
              <option value="friends">👥 Bạn bè</option>
              <option value="only_me">🔒 Chỉ mình tôi</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <textarea
            ref={mention.textareaRef}
            rows={4}
            autoFocus
            value={content}
            onChange={mention.onChange}
            placeholder={wallOwner ? `Viết gì đó cho ${wallOwner.name}...` : 'Bạn đang nghĩ gì thế? (gõ @ để gắn thẻ bạn bè)'}
            className="w-full text-sm resize-none focus:outline-none"
          />
          <MentionSuggestions matches={mention.matches} onSelect={mention.select} />
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, i) => (
              <div key={img} className="relative aspect-square rounded-lg overflow-hidden">
                <img src={img} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} className="absolute top-1 right-1 p-1 bg-slate-900/80 text-white rounded-full">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {video && (
          <div className="relative">
            <video src={video} controls className="w-full max-h-64 rounded-xl bg-black" />
            <button type="button" onClick={() => setVideo('')} className="absolute top-2 right-2 p-1.5 bg-slate-900/80 text-white rounded-full">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {(imageUpload.isUploading || videoUpload.isUploading) && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải lên...
          </p>
        )}

        {panel === 'feelings' && (
          <div className="flex flex-wrap gap-1.5">
            {FEELINGS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFeeling(feeling === f ? '' : f);
                  setPanel(null);
                }}
                className={`text-xs px-3 py-1 rounded-full ${feeling === f ? 'bg-amber-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
        {panel === 'tags' && <FriendPicker friends={friends} selectedIds={taggedIds} onToggle={(id) => setTaggedIds(toggleId(taggedIds, id))} />}

        {/* Mỗi bài chỉ có ảnh HOẶC video: đã có cái này thì khoá nút thêm cái kia */}
        <input ref={imageUpload.inputRef} type="file" accept="image/*" multiple className="hidden" onChange={imageUpload.onChange} />
        <input ref={videoUpload.inputRef} type="file" accept="video/*" className="hidden" onChange={videoUpload.onChange} />
        <div className="p-3 border border-slate-200 rounded-xl flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">Thêm vào bài viết</span>
          <div className="flex gap-1">
            <button type="button" title="Ảnh" onClick={imageUpload.open} disabled={!!video} className="p-2 rounded-lg hover:bg-slate-100 text-emerald-600 disabled:opacity-40">
              <ImageIcon className="w-5 h-5" />
            </button>
            <button type="button" title="Video" onClick={videoUpload.open} disabled={images.length > 0 || !!video} className="p-2 rounded-lg hover:bg-slate-100 text-rose-500 disabled:opacity-40">
              <VideoIcon className="w-5 h-5" />
            </button>
            <button type="button" title="Cảm xúc" onClick={() => setPanel(panel === 'feelings' ? null : 'feelings')} className="p-2 rounded-lg hover:bg-slate-100 text-amber-500">
              <Smile className="w-5 h-5" />
            </button>
            {!isEdit && (
              <button type="button" title="Gắn thẻ bạn bè" onClick={() => setPanel(panel === 'tags' ? null : 'tags')} className="p-2 rounded-lg hover:bg-slate-100 text-blue-600">
                <UserPlus className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <button type="submit" disabled={isEmpty} className="btn-primary w-full py-2.5 text-sm disabled:opacity-50">
          {isEdit ? 'Lưu thay đổi' : wallOwner ? 'Đăng lên tường' : 'Đăng bài viết'}
        </button>
      </form>
    </div>
  );
};

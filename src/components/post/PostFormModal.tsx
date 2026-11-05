import React, { useState } from 'react';
import { Smile, X, Image as ImageIcon, Trash2, Loader2, UserPlus, Video as VideoIcon, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocial } from '../../context/SocialContext';
import { Post, Privacy, User } from '../../types';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useMention } from '../../hooks/useMention';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { feelingText } from '../../utils/format';
import { FriendPicker, toggleId } from '../FriendPicker';
import { MentionSuggestions } from './MentionSuggestions';

// Hộp thoại đăng bài MỚI hoặc SỬA bài (có truyền post = đang sửa bài đó).
// Gồm: nội dung (gõ @ để gắn thẻ, #hashtag tự thành liên kết), quyền riêng tư, ảnh HOẶC video, cảm xúc, check-in vị trí, gắn thẻ bạn bè.
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
  const [location, setLocation] = useState(post?.location || '');
  const [images, setImages] = useState<string[]>(post?.images || []);
  const [video, setVideo] = useState(post?.video || '');
  const [taggedIds, setTaggedIds] = useState<string[]>([]);
  const [panel, setPanel] = useState<'feelings' | 'tags' | 'location' | null>(null);

  const mention = useMention(content, setContent, friends, (f) => setTaggedIds((ids) => (ids.includes(f.id) ? ids : [...ids, f.id])));
  const imageUpload = useFileUpload((files) => setImages((list) => [...list, ...files.map((f) => f.url)]));
  const videoUpload = useFileUpload((files) => setVideo(files[0].url));

  useEscapeKey(onClose);

  const isUploading = imageUpload.isUploading || videoUpload.isUploading;
  const isEmpty = !content.trim() && images.length === 0 && !video;
  const taggedUsers = friends.filter((f) => taggedIds.includes(f.id));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmpty || isUploading) return;
    const data = { content, privacy, feeling: feeling || undefined, images, video: video || undefined };
    // Sửa bài gửi cả chuỗi rỗng để XOÁ vị trí; đăng mới thì bỏ trống = không gửi
    if (isEdit) updatePost(post.id, { ...data, location: location.trim() });
    else createPost({ ...data, location: location.trim() || undefined, wallOwner, taggedUserIds: taggedIds });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Đăng bài"
        className="animate-pop bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto overscroll-contain"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">{isEdit ? 'Chỉnh sửa bài viết' : wallOwner ? `Đăng lên tường của ${wallOwner.name}` : 'Tạo bài viết mới'}</h3>
          <button type="button" aria-label="Đóng" onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <img src={currentUser?.avatar} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
          <div className="min-w-0">
            <div className="font-bold text-sm text-slate-800 break-words">
              {currentUser?.name}
              {feeling && <span className="font-normal text-slate-500 text-xs"> {feelingText(feeling)}</span>}
              {taggedUsers.length > 0 && <span className="font-normal text-slate-500 text-xs"> cùng với {taggedUsers.map((u) => u.name).join(', ')}</span>}
              {location.trim() && <span className="font-normal text-slate-500 text-xs"> tại {location.trim()}</span>}
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
            className="w-full text-sm resize-none focus:outline-none min-h-24"
          />
          <MentionSuggestions matches={mention.matches} onSelect={mention.select} />
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, i) => (
              <div key={img} className="relative aspect-square rounded-lg overflow-hidden">
                <img src={img} alt="" className="w-full h-full object-cover" />
                <button type="button" aria-label="Bỏ ảnh" onClick={() => setImages(images.filter((_, j) => j !== i))} className="absolute top-1 right-1 p-1 bg-slate-900/80 text-white rounded-full">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {video && (
          <div className="relative">
            <video src={video} controls className="w-full max-h-64 rounded-xl bg-black" />
            <button type="button" aria-label="Bỏ video" onClick={() => setVideo('')} className="absolute top-2 right-2 p-1.5 bg-slate-900/80 text-white rounded-full">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {isUploading && (
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
        {panel === 'location' && (
          <div className="relative">
            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input autoFocus value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} placeholder="Bạn đang ở đâu?" aria-label="Vị trí" className="input pl-9" />
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
            <button type="button" title="Check-in" onClick={() => setPanel(panel === 'location' ? null : 'location')} className={`p-2 rounded-lg hover:bg-slate-100 text-rose-600 ${location ? 'bg-rose-50' : ''}`}>
              <MapPin className="w-5 h-5" />
            </button>
            {!isEdit && (
              <button type="button" title="Gắn thẻ bạn bè" onClick={() => setPanel(panel === 'tags' ? null : 'tags')} className="p-2 rounded-lg hover:bg-slate-100 text-blue-600">
                <UserPlus className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <button type="submit" disabled={isEmpty || isUploading} className="btn-primary w-full py-3 text-sm sticky bottom-0">
          {isEdit ? 'Lưu thay đổi' : wallOwner ? 'Đăng lên tường' : 'Đăng bài viết'}
        </button>
      </form>
    </div>
  );
};

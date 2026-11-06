import React, { useState } from 'react';
import { X, Video as VideoIcon, Trash2, Loader2 } from 'lucide-react';
import { useSocial } from '../../context/SocialContext';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { Post } from '../../types';

// Hộp thoại đăng Reel (video ngắn): chọn video (bắt buộc), chú thích tối đa 300 ký tự (gõ #hashtag), quyền riêng tư công khai / bạn bè.

export const CreateReelModal: React.FC<{ onClose: () => void; onCreated: (reel: Post) => void }> = ({ onClose, onCreated }) => {
  const { createReel } = useSocial();
  const [video, setVideo] = useState('');
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'friends'>('public');
  const [saving, setSaving] = useState(false);
  const upload = useFileUpload((files) => setVideo(files[0].url));
  useEscapeKey(onClose);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!video || saving || upload.isUploading) return;
    setSaving(true);
    const reel = await createReel({ video, caption: caption.trim(), privacy });
    if (reel) {
      onCreated(reel);
      onClose();
    } else setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Tạo Reel" className="animate-pop bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="section-title">Tạo Reel</h3>
          <button type="button" aria-label="Đóng" onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <input ref={upload.inputRef} type="file" accept="video/*" className="hidden" onChange={upload.onChange} />
        {video ? (
          <div className="relative">
            <video src={video} controls className="w-full max-h-72 rounded-xl bg-black" />
            <button type="button" aria-label="Bỏ video" onClick={() => setVideo('')} className="absolute top-2 right-2 p-1.5 bg-slate-900/80 text-white rounded-full">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={upload.open} disabled={upload.isUploading} className="w-full h-40 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 flex flex-col items-center justify-center gap-2 text-slate-500">
            {upload.isUploading ? <Loader2 className="w-7 h-7 animate-spin" /> : <VideoIcon className="w-7 h-7" />}
            <span className="text-sm font-semibold">{upload.isUploading ? 'Đang tải video lên...' : 'Chọn video'}</span>
          </button>
        )}

        <div>
          <label htmlFor="reel-caption" className="field-label block mb-1.5">
            Chú thích
          </label>
          <textarea id="reel-caption" rows={3} maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Viết chú thích, thêm #hashtag..." className="input resize-none" />
          <p className="mt-1 text-right text-[11px] text-slate-400">{caption.length}/300</p>
        </div>

        <div>
          <label htmlFor="reel-privacy" className="field-label block mb-1.5">
            Ai xem được
          </label>
          <select id="reel-privacy" value={privacy} onChange={(e) => setPrivacy(e.target.value as 'public' | 'friends')} className="input">
            <option value="public">🌐 Công khai</option>
            <option value="friends">👥 Bạn bè</option>
          </select>
        </div>

        <button type="submit" disabled={!video || saving || upload.isUploading} className="btn-primary w-full">
          {saving ? 'Đang đăng...' : 'Đăng Reel'}
        </button>
      </form>
    </div>
  );
};

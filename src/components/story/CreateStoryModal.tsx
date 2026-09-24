import React, { useState } from 'react';
import { X, Image as ImageIcon, Type, Loader2 } from 'lucide-react';
import { useSocial } from '../../context/SocialContext';
import { useFileUpload } from '../../hooks/useFileUpload';

// Hộp thoại tạo story: dạng chữ trên nền màu hoặc dạng ảnh, chọn công khai / chỉ bạn bè, có khung xem trước.

const GRADIENTS = [
  'from-indigo-500 via-purple-500 to-pink-500',
  'from-amber-500 via-rose-500 to-purple-600',
  'from-emerald-400 via-teal-500 to-cyan-600',
  'from-blue-600 via-indigo-600 to-violet-800',
  'from-rose-500 via-red-500 to-orange-500',
  'from-slate-900 via-purple-900 to-slate-900',
];

export const CreateStoryModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { createStory } = useSocial();
  const [type, setType] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [gradient, setGradient] = useState(GRADIENTS[0]);
  const [privacy, setPrivacy] = useState<'public' | 'friends'>('public');
  const upload = useFileUpload((files) => setImageUrl(files[0].url));

  const canSubmit = type === 'text' ? !!text.trim() : !!imageUrl;

  const handleSubmit = () => {
    createStory(type === 'text' ? { type, textContent: text.trim(), backgroundGradient: gradient, privacy } : { type, mediaUrl: imageUrl, privacy });
    onClose();
  };

  const choice = (active: boolean) => `flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Tạo tin / Story mới</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setType('text')} className={choice(type === 'text')}>
            <Type className="w-4 h-4" /> Tin dạng chữ
          </button>
          <button onClick={() => setType('image')} className={choice(type === 'image')}>
            <ImageIcon className="w-4 h-4" /> Tin dạng ảnh
          </button>
        </div>

        {/* Khung xem trước */}
        <div className={`mx-auto w-56 h-72 rounded-2xl flex items-center justify-center text-center text-white p-5 overflow-hidden ${type === 'text' ? `bg-gradient-to-br ${gradient}` : 'bg-slate-900'}`}>
          {type === 'text' ? (
            <p className="font-bold">{text || 'Nội dung tin của bạn...'}</p>
          ) : imageUrl ? (
            <img src={imageUrl} alt="" className="w-full h-full object-cover rounded-xl" />
          ) : (
            <span className="text-xs text-slate-400">Chưa chọn hình ảnh</span>
          )}
        </div>

        {type === 'text' ? (
          <>
            <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Gõ suy nghĩ của bạn..." className="input resize-none" />
            <div className="flex gap-2 justify-center">
              {GRADIENTS.map((g) => (
                <button key={g} onClick={() => setGradient(g)} className={`w-8 h-8 rounded-full bg-gradient-to-br ${g} ${gradient === g ? 'ring-2 ring-indigo-600 ring-offset-2' : ''}`} />
              ))}
            </div>
          </>
        ) : (
          <>
            <input ref={upload.inputRef} type="file" accept="image/*" className="hidden" onChange={upload.onChange} />
            <button onClick={upload.open} disabled={upload.isUploading} className="btn-secondary w-full flex items-center justify-center gap-2">
              {upload.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              {upload.isUploading ? 'Đang tải ảnh lên...' : 'Chọn ảnh từ thiết bị'}
            </button>
          </>
        )}

        <div className="flex gap-2">
          <button onClick={() => setPrivacy('public')} className={choice(privacy === 'public')}>
            Công khai
          </button>
          <button onClick={() => setPrivacy('friends')} className={choice(privacy === 'friends')}>
            Chỉ bạn bè
          </button>
        </div>

        <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary w-full disabled:opacity-50">
          Chia sẻ lên Tin
        </button>
      </div>
    </div>
  );
};

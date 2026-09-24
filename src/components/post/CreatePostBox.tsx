import React from 'react';
import { Image as ImageIcon, Smile } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// Ô "Bạn đang nghĩ gì?" ở đầu bảng tin / trang cá nhân. Chỉ là nút giả làm ô nhập — bấm vào thì mở hộp thoại đăng bài.

export const CreatePostBox: React.FC<{ onClick: () => void; placeholder?: string }> = ({ onClick, placeholder }) => {
  const { currentUser } = useAuth();
  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center gap-3">
        <img src={currentUser?.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
        <button onClick={onClick} className="flex-1 text-left px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 text-sm truncate">
          {placeholder || `${currentUser?.name} ơi, bạn đang nghĩ gì thế?`}
        </button>
      </div>
      <div className="flex pt-3 mt-3 border-t border-slate-100 text-slate-600 text-sm font-semibold">
        <button onClick={onClick} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl hover:bg-slate-100">
          <ImageIcon className="w-5 h-5 text-emerald-500" /> Ảnh / Video
        </button>
        <button onClick={onClick} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl hover:bg-slate-100">
          <Smile className="w-5 h-5 text-amber-500" /> Cảm xúc / Hoạt động
        </button>
      </div>
    </div>
  );
};

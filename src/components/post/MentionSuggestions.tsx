import React from 'react';
import { User } from '../../types';

// Danh sách gợi ý bạn bè hiện ngay dưới ô nhập khi đang gõ "@" (dùng với hook useMention).
// Đặt bên trong một thẻ có class "relative" để danh sách hiện đúng vị trí.

export const MentionSuggestions: React.FC<{ matches: User[]; onSelect: (friend: User) => void }> = ({ matches, onSelect }) =>
  matches.length === 0 ? null : (
    <div className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-20">
      {matches.map((f) => (
        <div key={f.id} onClick={() => onSelect(f)} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100 cursor-pointer">
          <img src={f.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
          <span className="text-xs font-semibold text-slate-800">{f.name}</span>
        </div>
      ))}
    </div>
  );

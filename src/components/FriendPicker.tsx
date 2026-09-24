import React from 'react';
import { Check } from 'lucide-react';
import { User } from '../types';

// Danh sách bạn bè có ô tích chọn. Dùng khi gắn thẻ bạn bè (bài viết, bình luận) và khi tạo nhóm chat.

export const FriendPicker: React.FC<{ friends: User[]; selectedIds: string[]; onToggle: (id: string) => void }> = ({ friends, selectedIds, onToggle }) => (
  <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
    {friends.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Bạn chưa có bạn bè nào.</p>}
    {friends.map((f) => {
      const selected = selectedIds.includes(f.id);
      return (
        <div key={f.id} onClick={() => onToggle(f.id)} className={`flex items-center gap-2.5 p-2 cursor-pointer ${selected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
          <img src={f.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
          <span className="text-xs font-semibold text-slate-700 flex-1">{f.name}</span>
          {selected && <Check className="w-4 h-4 text-blue-600" />}
        </div>
      );
    })}
  </div>
);

/** Thêm id nếu chưa có, bỏ đi nếu đã có. */
// eslint-disable-next-line react-refresh/only-export-components
export const toggleId = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

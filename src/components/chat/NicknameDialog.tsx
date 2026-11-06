import React from 'react';
import { Conversation } from '../../types';
import { Avatar, DialogShell } from '../ui';

// Hộp thoại "Biệt danh": mỗi thành viên (cả mình) một dòng có ô nhập sẵn biệt danh hiện có.
// Gõ xong bấm Enter hoặc bấm ra ngoài ô để lưu; để trống = xoá biệt danh.

export const NicknameDialog: React.FC<{ conversation: Conversation; meId: string; onSave: (userId: string, nickname: string) => void; onClose: () => void }> = ({ conversation, meId, onSave, onClose }) => (
  <DialogShell label="Biệt danh" title="Biệt danh" size="sm" onClose={onClose}>
    <ul className="space-y-3">
      {/* Mình ở cuối danh sách để người kia hiện trước */}
      {[...conversation.participants].sort((a, b) => Number(a.id === meId) - Number(b.id === meId)).map((m) => (
        <li key={m.id} className="flex items-center gap-3">
          <Avatar src={m.avatar} size="size-10" />
          <input
            defaultValue={conversation.nicknames?.[m.id] || ''}
            maxLength={60}
            placeholder={`Đặt biệt danh cho ${m.name}`}
            aria-label={`Biệt danh của ${m.name}`}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            onBlur={(e) => e.target.value.trim() !== (conversation.nicknames?.[m.id] || '') && onSave(m.id, e.target.value.trim())}
            className="input flex-1 min-w-0"
          />
        </li>
      ))}
    </ul>
  </DialogShell>
);

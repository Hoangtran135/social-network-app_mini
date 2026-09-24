import React, { useRef, useState } from 'react';
import { User } from '../types';
import { detectMention, insertMention } from '../utils/mention';

// Hook gắn thẻ bạn bè bằng cách gõ "@tên" trong ô nhập (dùng cho ô đăng bài và ô bình luận).
// Khi gõ "@Ng" → matches là danh sách bạn có tên chứa "Ng"; chọn một người → chèn "@Tên đầy đủ" vào ô nhập.

export function useMention(text: string, setText: (value: string) => void, friends: User[], onSelect: (friend: User) => void) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ atIndex: number; query: string } | null>(null);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    setMention(detectMention(e.target.value, e.target.selectionStart));
  };

  const matches = mention ? friends.filter((f) => f.name.toLowerCase().includes(mention.query.toLowerCase())) : [];

  const select = (friend: User) => {
    const textarea = textareaRef.current;
    if (!mention || !textarea) return;
    const result = insertMention(text, mention.atIndex, textarea.selectionStart, friend.name);
    setText(result.text);
    setMention(null);
    onSelect(friend);
    // Đợi giao diện vẽ lại xong rồi đưa con trỏ về ngay sau tên vừa chèn
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.cursor, result.cursor);
    });
  };

  return { textareaRef, onChange, matches, select, reset: () => setMention(null) };
}

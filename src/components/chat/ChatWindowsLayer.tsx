import React from 'react';
import { useChatWindows } from '../../context/ChatWindowsContext';
import { ChatWindow } from './ChatWindow';

// Vẽ các cửa sổ chat đang mở, xếp cạnh nhau từ phải sang trái ở góc dưới màn hình (ẩn trên điện thoại).

const WIDTH = 330;
const MINIMIZED_WIDTH = 280;
const GAP = 12;

export const ChatWindowsLayer: React.FC = () => {
  const { windows, closeChat, toggleMinimize } = useChatWindows();
  let right = 16;

  return (
    <div className="hidden sm:block">
      {windows.map((w) => {
        const position = right;
        right += (w.minimized ? MINIMIZED_WIDTH : WIDTH) + GAP;
        return (
          <ChatWindow
            key={w.conversationId}
            conversationId={w.conversationId}
            minimized={w.minimized}
            right={position}
            onClose={() => closeChat(w.conversationId)}
            onToggleMinimize={() => toggleMinimize(w.conversationId)}
          />
        );
      })}
    </div>
  );
};

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { getSocket } from '../utils/socket';
import { Message } from '../types';

// Quản lý các cửa sổ chat nổi ở góc dưới màn hình (tối đa 2 cửa sổ, mỗi cửa sổ có thể thu nhỏ).
// Bất kỳ đâu cũng mở chat được bằng: const { openChat } = useChatWindows(); openChat(conversationId);
// Có tin nhắn mới từ người khác (kể cả người lạ chưa kết bạn) thì cửa sổ chat tự bật lên (chỉ trên màn hình rộng;
// điện thoại chat chiếm cả màn hình nên không tự bật, người dùng thấy huy hiệu + thông báo và tự mở).

export interface ChatWindow {
  conversationId: string;
  minimized: boolean;
}

const MAX_WINDOWS = 2;

function useChatWindowsState() {
  const { currentUser } = useAuth();
  const myId = currentUser?.id;
  const [windows, setWindows] = useState<ChatWindow[]>([]);
  const without = (list: ChatWindow[], id: string) => list.filter((w) => w.conversationId !== id);

  const openChat = (id: string) => setWindows((prev) => [...without(prev, id), { conversationId: id, minimized: false }].slice(-MAX_WINDOWS));

  // Tin nhắn đến mà cửa sổ của hội thoại đó chưa mở → mở ra (đã mở rồi, kể cả đang thu nhỏ, thì để nguyên)
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  useEffect(() => {
    if (!myId) return;
    const socket = getSocket();
    const onMessage = ({ conversationId, message }: { conversationId: string; message: Message }) => {
      if (message.senderId === myId || message.isRecalled || message.kind === 'system') return;
      if (!window.matchMedia('(min-width: 640px)').matches) return;
      if (windowsRef.current.some((w) => w.conversationId === conversationId)) return;
      setWindows((prev) => [...without(prev, conversationId), { conversationId, minimized: false }].slice(-MAX_WINDOWS));
    };
    socket.on('message:new', onMessage);
    return () => {
      socket.off('message:new', onMessage);
    };
  }, [myId]);

  return {
    windows,
    /** Mở (hoặc đưa lên mới nhất) cửa sổ của hội thoại; quá số cửa sổ tối đa thì bỏ cửa sổ cũ nhất. */
    openChat,
    closeChat: (id: string) => setWindows((prev) => without(prev, id)),
    toggleMinimize: (id: string) =>
      setWindows((prev) => prev.map((w) => (w.conversationId === id ? { ...w, minimized: !w.minimized } : w))),
  };
}

const ChatWindowsContext = createContext<ReturnType<typeof useChatWindowsState> | null>(null);

export const ChatWindowsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ChatWindowsContext.Provider value={useChatWindowsState()}>{children}</ChatWindowsContext.Provider>
);

// eslint-disable-next-line react-refresh/only-export-components
export const useChatWindows = () => useContext(ChatWindowsContext)!;

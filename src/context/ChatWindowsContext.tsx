import React, { createContext, useContext, useState } from 'react';

// Quản lý các cửa sổ chat nổi ở góc dưới màn hình (tối đa 3 cửa sổ, mỗi cửa sổ có thể thu nhỏ).
// Bất kỳ đâu cũng mở chat được bằng: const { openChat } = useChatWindows(); openChat(conversationId);

export interface ChatWindow {
  conversationId: string;
  minimized: boolean;
}

const MAX_WINDOWS = 4;

function useChatWindowsState() {
  const [windows, setWindows] = useState<ChatWindow[]>([]);
  const without = (list: ChatWindow[], id: string) => list.filter((w) => w.conversationId !== id);

  return {
    windows,
    /** Mở (hoặc đưa lên mới nhất) cửa sổ của hội thoại; quá 3 cửa sổ thì bỏ cửa sổ cũ nhất. */
    openChat: (id: string) => setWindows((prev) => [...without(prev, id), { conversationId: id, minimized: false }].slice(-MAX_WINDOWS)),
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

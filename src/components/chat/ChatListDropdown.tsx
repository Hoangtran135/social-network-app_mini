import React, { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useSocial } from '../../context/SocialContext';
import { useAuth } from '../../context/AuthContext';
import { useChatWindows } from '../../context/ChatWindowsContext';
import { timeAgo } from '../../utils/format';
import { Avatar, CountBadge } from '../ui';
import { DROPDOWN } from '../../layout/dropdown';
import { FriendPicker, toggleId } from '../FriendPicker';

// Menu "Đoạn chat" thả xuống từ nút tin nhắn trên Navbar: tìm hội thoại, bấm vào để mở cửa sổ chat,
// nút "+" để tạo tin nhắn mới (chọn 1 người = chat 1-1, chọn từ 2 người = tạo nhóm chat, bắt buộc đặt tên nhóm).

export const ChatListDropdown: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { conversations, friends, getOrCreateConversation, createGroupChat } = useSocial();
  const { currentUser } = useAuth();
  const { openChat } = useChatWindows();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');

  const open = (conversationId: string) => {
    openChat(conversationId);
    onClose();
  };

  const createChat = async () => {
    const members = friends.filter((f) => selectedIds.includes(f.id));
    open(members.length === 1 ? await getOrCreateConversation(members[0]) : await createGroupChat(members, groupName.trim()));
  };

  // Tên + ảnh hiển thị của hội thoại: nhóm thì dùng của nhóm, 1-1 thì dùng của người còn lại (ưu tiên biệt danh)
  const rows = conversations
    .map((c) => {
      const other = c.participants.find((p) => p.id !== currentUser?.id);
      return {
        c,
        other,
        title: (c.isGroup ? c.name : c.nicknames?.[other?.id || ''] || other?.name) || '',
        avatar: c.isGroup ? c.avatar : other?.avatar,
      };
    })
    .filter((r) => r.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className={`${DROPDOWN} sm:w-96`}>
      <div className="px-4 py-2 flex items-center justify-between">
        <h3 className="section-title">Đoạn chat</h3>
        <button onClick={() => setCreating(!creating)} title={creating ? 'Quay lại' : 'Tin nhắn mới'} aria-label={creating ? 'Quay lại danh sách' : 'Tin nhắn mới'} className="p-1.5 rounded-full bg-blue-600 text-white">
          <Plus className={`w-4 h-4 transition-transform ${creating ? 'rotate-45' : ''}`} />
        </button>
      </div>

      {creating ? (
        <div className="px-4 pb-2 space-y-3">
          <p className="text-xs text-slate-500">Chọn 1 người để nhắn riêng, hoặc từ 2 người để tạo nhóm:</p>
          <FriendPicker friends={friends} selectedIds={selectedIds} onToggle={(id) => setSelectedIds(toggleId(selectedIds, id))} />
          {selectedIds.length >= 2 && <input autoFocus value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Đặt tên nhóm chat..." className="input" />}
          <button onClick={createChat} disabled={selectedIds.length === 0 || (selectedIds.length >= 2 && !groupName.trim())} className="btn-primary w-full disabled:opacity-50">
            {selectedIds.length >= 2 ? `Tạo nhóm (${selectedIds.length} người)` : 'Bắt đầu trò chuyện'}
          </button>
        </div>
      ) : (
        <>
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm kiếm cuộc trò chuyện" className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            </div>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {rows.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Không tìm thấy cuộc trò chuyện nào</p>}
            {rows.map(({ c, other, title, avatar }) => (
              <button key={c.id} onClick={() => open(c.id)} className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 ${c.unreadCount > 0 ? 'bg-blue-50/50' : ''}`}>
                <Avatar src={avatar} size="w-11 h-11" online={!c.isGroup && other?.isOnline} />
                <div className="flex-1 min-w-0 text-xs">
                  <div className="flex justify-between gap-2">
                    <b className="truncate text-slate-800">{title}</b>
                    <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(c.lastMessage?.createdAt || c.updatedAt)}</span>
                  </div>
                  <p className={`truncate ${c.unreadCount > 0 ? 'text-slate-800 font-semibold' : 'text-slate-400'}`}>
                    {c.lastMessage
                      ? `${c.lastMessage.senderId === currentUser?.id ? 'Bạn: ' : ''}${c.lastMessage.content || 'Đã gửi một tệp đính kèm'}`
                      : 'Bắt đầu cuộc trò chuyện'}
                  </p>
                </div>
                <CountBadge count={c.unreadCount} className="shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

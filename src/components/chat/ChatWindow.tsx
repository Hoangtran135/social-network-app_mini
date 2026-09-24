import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Send, Image as ImageIcon, Paperclip, Smile, X, Minus, MoreHorizontal, CheckCheck, FileText, Loader2, SmilePlus, RotateCcw } from 'lucide-react';
import { useSocial } from '../../context/SocialContext';
import { useAuth } from '../../context/AuthContext';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useClickOutside } from '../../hooks/useClickOutside';
import { Message, MessageAttachment } from '../../types';
import { UploadResult } from '../../utils/api';
import { fileSize, timeAgo } from '../../utils/format';

// Một cửa sổ chat nổi ở góc dưới màn hình (có thể thu nhỏ):
// danh sách tin nhắn, gửi chữ / emoji / ảnh / tệp, thả cảm xúc, thu hồi tin của mình,
// menu "..." để xem trang cá nhân, đổi màu chủ đề (chỉ lưu trên trình duyệt này), đặt biệt danh.

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏'];
const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '🚀', '😍', '👏'];
const THEME_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#475569'];

export const ChatWindow: React.FC<{ conversationId: string; minimized: boolean; right: number; onClose: () => void; onToggleMinimize: () => void }> = ({
  conversationId,
  minimized,
  right,
  onClose,
  onToggleMinimize,
}) => {
  const { conversations, messages, sendMessage, loadMessages, setNickname } = useSocial();
  const { currentUser } = useAuth();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [panel, setPanel] = useState<'emoji' | 'attach' | 'options' | 'nickname' | null>(null);
  const [nickname, setNicknameText] = useState('');
  const [color, setColor] = useState(() => localStorage.getItem(`chatTheme:${conversationId}`) || THEME_COLORS[0]);
  const optionsRef = useClickOutside(() => panel === 'options' && setPanel(null));
  const endRef = useRef<HTMLDivElement>(null);

  // Tệp upload xong chỉ nằm trong danh sách "chờ gửi"; bấm Gửi mới gửi kèm tin nhắn
  const addFiles = (type: 'image' | 'file') => (files: UploadResult[]) =>
    setAttachments((list) => [...list, ...files.map((f) => ({ type, url: f.url, name: f.name, size: fileSize(f.size) }))]);
  const imageUpload = useFileUpload(addFiles('image'));
  const fileUpload = useFileUpload(addFiles('file'));

  const list = messages[conversationId];
  const conversation = conversations.find((c) => c.id === conversationId);

  // Mở cửa sổ → tải tin nhắn (server đánh dấu đã đọc)
  useEffect(() => {
    loadMessages(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);
  // Có tin mới hoặc vừa mở rộng cửa sổ → cuộn xuống cuối
  useEffect(() => {
    if (!minimized) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [list, minimized]);

  if (!conversation || !currentUser) return null;

  // Chat 1-1: hiện tên (ưu tiên biệt danh) và ảnh của người còn lại; nhóm chat: tên và ảnh của nhóm
  const partner = conversation.isGroup ? undefined : conversation.participants.find((p) => p.id !== currentUser.id);
  const title = conversation.isGroup ? conversation.name : conversation.nicknames?.[partner!.id] || partner?.name;
  const avatar = conversation.isGroup ? conversation.avatar : partner?.avatar;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && attachments.length === 0) return;
    sendMessage(conversationId, text.trim(), attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
    setPanel(null);
  };

  const pickColor = (c: string) => {
    setColor(c);
    localStorage.setItem(`chatTheme:${conversationId}`, c);
  };

  if (minimized) {
    return (
      <div onClick={onToggleMinimize} style={{ right }} className="fixed bottom-0 w-[280px] h-12 px-3 bg-white rounded-t-xl shadow-2xl border border-slate-200 z-40 cursor-pointer flex items-center gap-2">
        <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
        <span className="flex-1 font-bold text-xs text-slate-800 truncate">{title}</span>
        <button
          onClick={(e) => {
            e.stopPropagation(); // không để cú bấm "đóng" lan ra thanh (sẽ vừa đóng vừa mở rộng)
            onClose();
          }}
          className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div style={{ right }} className="fixed bottom-0 w-[330px] h-[440px] bg-white rounded-t-2xl shadow-2xl border border-slate-200 z-40 flex flex-col">
      {/* ----- Thanh tiêu đề (màu chủ đề): bấm để thu nhỏ ----- */}
      <div onClick={onToggleMinimize} style={{ backgroundColor: color }} className="h-14 px-3 flex items-center gap-2 text-white cursor-pointer rounded-t-2xl">
        <img src={avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-xs truncate">{title}</div>
          {partner && <div className="text-[10px] opacity-80">{partner.isOnline ? 'Đang hoạt động' : 'Không hoạt động'}</div>}
        </div>
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <div className="relative" ref={optionsRef}>
            <button onClick={() => setPanel(panel === 'options' ? null : 'options')} className="p-1.5 rounded-full hover:bg-white/20">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {panel === 'options' && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 p-2 z-50 text-slate-700 text-xs font-semibold space-y-1">
                {partner && (
                  <>
                    <Link to={`/profile/${partner.id}`} className="block px-2 py-1.5 rounded hover:bg-slate-50">
                      Xem trang cá nhân
                    </Link>
                    <button
                      onClick={() => {
                        setNicknameText(conversation.nicknames?.[partner.id] || '');
                        setPanel('nickname');
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50"
                    >
                      Đặt biệt danh
                    </button>
                  </>
                )}
                <p className="px-2 pt-1 text-slate-400">Màu chủ đề</p>
                <div className="grid grid-cols-8 gap-1 px-2">
                  {THEME_COLORS.map((c) => (
                    <button key={c} onClick={() => pickColor(c)} style={{ backgroundColor: c }} className={`w-5 h-5 rounded-full ${color === c ? 'ring-2 ring-slate-800' : ''}`} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={onToggleMinimize} className="p-1.5 rounded-full hover:bg-white/20">
            <Minus className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {panel === 'nickname' && partner && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setNickname(conversationId, partner.id, nickname);
            setPanel(null);
          }}
          className="px-3 py-2 border-b border-slate-100 flex gap-2"
        >
          <input autoFocus value={nickname} onChange={(e) => setNicknameText(e.target.value)} placeholder={`Biệt danh cho ${partner.name} (để trống = xoá)`} className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200" />
          <button type="submit" className="btn-primary px-3 py-1.5">
            Lưu
          </button>
        </form>
      )}

      {/* ----- Danh sách tin nhắn ----- */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-slate-50">
        {list?.length === 0 && (
          <p className="h-full flex flex-col items-center justify-center text-xs text-slate-400">
            <MessageCircle className="w-8 h-8 mb-2" /> Hãy gửi lời chào để bắt đầu trò chuyện!
          </p>
        )}
        {list?.map((m) => <MessageBubble key={m.id} message={m} conversationId={conversationId} color={color} />)}
        <div ref={endRef} />
      </div>

      {/* ----- Tệp chờ gửi, emoji nhanh, ô nhập ----- */}
      {attachments.length > 0 && (
        <div className="px-2.5 py-1.5 bg-slate-100 flex gap-1.5 overflow-x-auto">
          {attachments.map((a, i) => (
            <div key={a.url} className="relative shrink-0 bg-white p-1 rounded-lg border border-slate-300">
              {a.type === 'image' ? <img src={a.url} alt="" className="w-9 h-9 rounded-md object-cover" /> : <FileText className="w-9 h-9 text-blue-600" />}
              <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 p-0.5 rounded-full bg-slate-700 text-white">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {panel === 'emoji' && (
        <div className="px-2.5 py-1.5 bg-white border-t border-slate-200 flex gap-1.5">
          {QUICK_EMOJIS.map((e) => (
            <button key={e} onClick={() => setText(text + e)} className="p-1 text-base hover:scale-125 transition-transform">
              {e}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={send} className="p-2 border-t border-slate-200 flex items-center gap-1">
        <input ref={imageUpload.inputRef} type="file" accept="image/*" className="hidden" onChange={imageUpload.onChange} />
        <input ref={fileUpload.inputRef} type="file" className="hidden" onChange={fileUpload.onChange} />
        <div className="relative">
          <button type="button" onClick={() => setPanel(panel === 'attach' ? null : 'attach')} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600">
            {imageUpload.isUploading || fileUpload.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
          {panel === 'attach' && (
            <div className="absolute bottom-9 left-0 w-36 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-30 text-[11px] font-semibold">
              <button type="button" onClick={() => (setPanel(null), imageUpload.open())} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-blue-50">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-500" /> Hình ảnh
              </button>
              <button type="button" onClick={() => (setPanel(null), fileUpload.open())} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-blue-50">
                <FileText className="w-3.5 h-3.5 text-blue-500" /> Tệp
              </button>
            </div>
          )}
        </div>
        <button type="button" onClick={() => setPanel(panel === 'emoji' ? null : 'emoji')} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600">
          <Smile className="w-4 h-4" />
        </button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhập tin nhắn..." className="flex-1 px-3 py-1.5 text-xs bg-slate-100 rounded-full focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500" />
        <button type="submit" disabled={!text.trim() && attachments.length === 0} style={{ backgroundColor: color }} className="p-2 rounded-full text-white disabled:opacity-40">
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};

/** Một tin nhắn: tin của mình bên phải (màu chủ đề), của người khác bên trái. Rê chuột để thả cảm xúc / thu hồi. */
const MessageBubble: React.FC<{ message: Message; conversationId: string; color: string }> = ({ message: m, conversationId, color }) => {
  const { recallMessage, reactToMessage } = useSocial();
  const { currentUser } = useAuth();
  const [showReactions, setShowReactions] = useState(false);

  // Tin hệ thống (vd "A đã đặt biệt danh...") hiện ở giữa
  if (m.kind === 'system') return <p className="text-center text-[10px] text-slate-400">{m.content}</p>;

  const isMine = m.senderId === currentUser?.id;
  const reactions = Object.values(m.reactions || {});
  const react = (emoji: string) => {
    reactToMessage(conversationId, m.id, emoji);
    setShowReactions(false);
  };

  return (
    <div className={`group flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : ''}`}>
      {!isMine && <img src={m.senderAvatar} alt="" className="w-6 h-6 rounded-full object-cover" />}

      <div className="max-w-[75%]">
        <div style={isMine && !m.isRecalled ? { backgroundColor: color } : undefined} className={`rounded-2xl px-3 py-2 text-xs ${m.isRecalled ? 'bg-slate-100 text-slate-400 italic' : isMine ? 'text-white' : 'bg-white text-slate-800 border border-slate-200'}`}>
          {m.isRecalled ? (
            'Tin nhắn đã được thu hồi'
          ) : (
            <>
              {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
              {m.sharedPostId && !m.content && <p>📄 Đã chia sẻ một bài viết</p>}
              {m.attachments?.map((a) =>
                a.type === 'image' ? (
                  <img key={a.url} src={a.url} alt="" className="mt-1.5 rounded-lg max-h-40 w-full object-cover" />
                ) : (
                  <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1.5 underline">
                    <FileText className="w-4 h-4" /> {a.name}
                  </a>
                )
              )}
              <div className="text-[9px] mt-1 flex items-center justify-end gap-1 opacity-70">
                {timeAgo(m.createdAt)} {isMine && m.isRead && <CheckCheck className="w-3 h-3" />}
              </div>
            </>
          )}
        </div>
        {reactions.length > 0 && (
          <div className={`mt-1 text-[11px] ${isMine ? 'text-right' : ''}`}>
            {[...new Set(reactions)].join('')} {reactions.length > 1 && reactions.length}
          </div>
        )}
      </div>

      {!m.isRecalled && (
        <div className="relative flex gap-0.5 opacity-0 group-hover:opacity-100">
          <button onClick={() => setShowReactions(!showReactions)} className="p-1 rounded-full bg-white border border-slate-200 text-slate-500">
            <SmilePlus className="w-3 h-3" />
          </button>
          {isMine && (
            <button title="Thu hồi" onClick={() => recallMessage(conversationId, m.id)} className="p-1 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-rose-600">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          {showReactions && (
            <div className={`absolute bottom-full mb-1 flex bg-white border border-slate-200 rounded-full shadow-lg p-1 z-20 ${isMine ? 'right-0' : 'left-0'}`}>
              {REACTION_EMOJIS.map((e) => (
                <button key={e} onClick={() => react(e)} className="p-0.5 text-sm hover:scale-125 transition-transform">
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

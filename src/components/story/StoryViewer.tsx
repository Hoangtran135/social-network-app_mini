import React, { useEffect, useState } from 'react';
import { X, Send, Eye, Trash2 } from 'lucide-react';
import { useSocial } from '../../context/SocialContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { timeAgo } from '../../utils/format';

// Trình xem story toàn màn hình: mỗi story hiện 5 giây rồi tự chuyển sang story sau (giữ chuột để tạm dừng),
// bấm nửa trái / phải để lùi / tiến. Story của mình: xem ai đã xem, xoá. Story người khác: thả cảm xúc hoặc trả lời
// (gửi thành tin nhắn cho người đăng).

export const StoryViewer: React.FC<{ startIndex: number; onClose: () => void }> = ({ startIndex, onClose }) => {
  const { stories, viewStory, deleteStory, sendMessage, getOrCreateConversation, showToast } = useSocial();
  const { currentUser } = useAuth();
  const confirm = useConfirm();
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0); // 0 → 100 (%)
  const [holding, setHolding] = useState(false); // đang giữ chuột / ngón tay trên story
  const [typing, setTyping] = useState(false); // đang gõ trả lời
  const [reply, setReply] = useState('');
  const [showViewers, setShowViewers] = useState(false);
  const paused = holding || typing || showViewers; // giữ, đang gõ hoặc đang xem danh sách người xem thì tạm dừng
  useEscapeKey(onClose);

  const story = stories[index];
  const isMine = story?.user.id === currentUser?.id;
  const next = () => (index < stories.length - 1 ? setIndex(index + 1) : onClose());
  const prev = () => index > 0 && setIndex(index - 1);

  // Phím mũi tên trái / phải để lùi / tiến
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, stories.length]);

  // Sang story mới: tính lại tiến trình từ 0 và báo server là đã xem. Hết story (vd vừa xoá cái cuối) thì đóng.
  useEffect(() => {
    if (!story) return onClose();
    setProgress(0);
    viewStory(story.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  // Mỗi 100ms tăng 2% → 5 giây / story; đầy 100% thì chuyển tiếp
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setProgress((p) => p + 2), 100);
    return () => clearInterval(timer);
  }, [paused]);
  useEffect(() => {
    if (progress >= 100) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  if (!story) return null;

  const messageAuthor = async (text: string) => {
    await sendMessage(await getOrCreateConversation(story.user), text);
    showToast(`Đã gửi tới ${story.user.name}`);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Xem tin" className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center sm:p-4 select-none">
      <div className="absolute top-6 right-3 sm:top-4 sm:right-4 z-40 flex gap-2 text-white">
        {isMine && (
          <button aria-label="Xóa tin" onClick={async () => (await confirm('Xóa Story này?')) && deleteStory(story.id)} className="p-2.5 rounded-full bg-white/10 hover:bg-rose-500">
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        <button aria-label="Đóng" onClick={onClose} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div
        onMouseDown={() => setHolding(true)}
        onMouseUp={() => setHolding(false)}
        onMouseLeave={() => setHolding(false)}
        onTouchStart={() => setHolding(true)}
        onTouchEnd={() => setHolding(false)}
        className="w-full max-w-sm h-[100dvh] sm:h-[85dvh] bg-slate-900 sm:rounded-3xl overflow-hidden relative flex flex-col"
      >
        {/* Thanh tiến trình: story đã qua đầy, story hiện tại theo progress, story sau trống */}
        <div className="absolute top-3 inset-x-3 z-30 flex gap-1.5">
          {stories.map((s, i) => (
            <div key={s.id} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white" style={{ width: i < index ? '100%' : i === index ? `${progress}%` : '0%' }} />
            </div>
          ))}
        </div>
        <div className="absolute top-7 left-4 right-24 z-30 flex items-center gap-2.5 text-white">
          <img src={story.user.avatar} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-white shrink-0" />
          <div className="text-xs min-w-0">
            <b className="block truncate">{story.user.name}</b>
            <div className="text-white/80">{timeAgo(story.createdAt)}</div>
          </div>
        </div>

        <div className="flex-1 relative">
          {story.type === 'text' ? (
            <div className={`w-full h-full p-8 flex items-center justify-center text-center bg-gradient-to-br ${story.backgroundGradient} text-white text-2xl font-extrabold`}>
              {story.textContent}
            </div>
          ) : (
            <img src={story.mediaUrl} alt="" className="w-full h-full object-cover" />
          )}
          {/* Vùng bấm vô hình: 1/3 bên trái = lùi, phần còn lại = tiến */}
          <div onClick={prev} className="absolute left-0 inset-y-0 w-1/3 z-20" />
          <div onClick={next} className="absolute right-0 inset-y-0 w-2/3 z-20" />
        </div>

        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/80 to-transparent space-y-3 text-white relative z-30 max-h-[45%] overflow-y-auto">
          {isMine ? (
            <>
              <button onClick={() => setShowViewers(!showViewers)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 rounded-full text-xs font-bold">
                <Eye className="w-4 h-4" /> {story.viewers.length} người đã xem
              </button>
              {showViewers && story.viewers.length === 0 && <p className="text-xs text-white/60">Chưa có ai xem tin này.</p>}
              {showViewers &&
                story.viewers.map((v) => (
                  <div key={v.userId} className="flex items-center gap-2 text-xs">
                    <img src={v.avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                    {v.userName}
                    <span className="ml-auto text-white/60">{timeAgo(v.viewedAt)}</span>
                  </div>
                ))}
            </>
          ) : (
            <>
              <div className="flex justify-around text-2xl">
                {['❤️', '🔥', '👏', '😮', '😂'].map((emoji) => (
                  <button key={emoji} aria-label={`Phản hồi ${emoji}`} onClick={() => messageAuthor(`Đã phản hồi Story của bạn: ${emoji}`)} className="p-1 hover:scale-125 transition-transform">
                    {emoji}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reply.trim()) return;
                  messageAuthor(`Trả lời Story: "${reply.trim()}"`);
                  setReply('');
                }}
                className="flex gap-2"
              >
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  placeholder={`Gửi tin nhắn cho ${story.user.name}...`}
                  className="flex-1 text-xs px-3.5 py-2 bg-white/20 rounded-full placeholder-white/60 focus:outline-none"
                />
                <button type="submit" aria-label="Gửi" disabled={!reply.trim()} className="p-2.5 bg-indigo-600 rounded-full disabled:opacity-50">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

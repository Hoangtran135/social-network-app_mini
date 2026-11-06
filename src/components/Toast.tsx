import React from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { useOpenNotification } from '../hooks/useOpenNotification';
import { useChatWindows } from '../context/ChatWindowsContext';

// Thông báo nhỏ hiện vài giây ở góc màn hình (vd "Đã đăng bài viết!").
// Nội dung lấy từ SocialContext; ở bất kỳ đâu gọi showToast('...') là hiện.
// Trên điện thoại toast nằm phía trên thanh điều hướng dưới cùng; trên màn hình rộng nằm góc trái dưới (góc phải dành cho cửa sổ chat).

const STYLES = {
  success: { color: 'bg-emerald-600', Icon: CheckCircle2 },
  error: { color: 'bg-rose-600', Icon: AlertCircle },
  info: { color: 'bg-slate-900', Icon: Info },
};

export const Toast: React.FC = () => {
  const { toast, dismissToast } = useSocial();
  const openNotification = useOpenNotification();
  const { openChat } = useChatWindows();
  if (!toast) return null;
  const { color, Icon } = STYLES[toast.type];

  return (
    <div role={toast.type === 'error' ? 'alert' : 'status'} className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:right-auto sm:left-6 z-[70] pointer-events-none">
      <div className={`animate-pop flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-white text-sm font-medium sm:max-w-sm ${color}`}>
        <Icon className="w-5 h-5 shrink-0" />
        {toast.notification || toast.conversationId ? (
          // Toast của thông báo / tin nhắn mới: bấm vào là mở đúng nội dung (bài viết, bình luận, nhóm, cửa sổ chat...) rồi tắt toast
          <button
            onClick={() => {
              if (toast.notification) openNotification(toast.notification);
              else openChat(toast.conversationId!);
              dismissToast();
            }}
            className="pointer-events-auto min-w-0 flex-1 text-left break-words hover:underline"
          >
            {toast.message}
          </button>
        ) : (
          <span className="min-w-0 break-words">{toast.message}</span>
        )}
        {toast.action && (
          <button onClick={toast.action.onClick} className="pointer-events-auto ml-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold shrink-0">
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
};

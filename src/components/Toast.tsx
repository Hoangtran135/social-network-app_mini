import React from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useSocial } from '../context/SocialContext';

// Thông báo nhỏ hiện vài giây ở góc màn hình (vd "Đã đăng bài viết!").
// Nội dung lấy từ SocialContext; ở bất kỳ đâu gọi showToast('...') là hiện.

const STYLES = {
  success: { color: 'bg-emerald-600', Icon: CheckCircle2 },
  error: { color: 'bg-rose-600', Icon: AlertCircle },
  info: { color: 'bg-slate-900', Icon: Info },
};

export const Toast: React.FC = () => {
  const { toast } = useSocial();
  if (!toast) return null;
  const { color, Icon } = STYLES[toast.type];

  return (
    <div className="fixed bottom-6 right-6 left-4 sm:left-auto z-50">
      <div className={`flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-white text-sm font-medium ${color}`}>
        <Icon className="w-5 h-5 shrink-0" />
        <span>{toast.message}</span>
      </div>
    </div>
  );
};

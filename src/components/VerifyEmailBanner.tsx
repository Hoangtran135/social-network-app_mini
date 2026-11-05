import React, { useState } from 'react';
import { MailWarning, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { ApiError } from '../utils/api';

// Dải nhắc xác minh email (hiện dưới thanh điều hướng khi tài khoản mới đăng ký chưa bấm link trong email).
// Xác minh "mềm": vẫn dùng được mọi chức năng, chỉ nhắc nhở. Có nút gửi lại email và nút "Tôi đã xác minh" để kiểm tra lại.

export const VerifyEmailBanner: React.FC = () => {
  const { currentUser, resendVerification, refreshUser } = useAuth();
  const { showToast } = useSocial();
  const [busy, setBusy] = useState<'resend' | 'check' | null>(null);

  if (!currentUser || currentUser.emailVerified !== false) return null;

  const resend = async () => {
    setBusy('resend');
    try {
      await resendVerification();
      showToast('Đã gửi lại email xác minh. Hãy kiểm tra hộp thư (kể cả thư rác).');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Không thể gửi lại email lúc này.', 'error');
    }
    setBusy(null);
  };

  const check = async () => {
    setBusy('check');
    const verified = await refreshUser();
    if (verified === false) showToast('Email vẫn chưa được xác minh. Hãy bấm vào link trong email.', 'info');
    else showToast('Cảm ơn bạn, email đã được xác minh!');
    setBusy(null);
  };

  return (
    <div role="alert" className="bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm">
        <MailWarning className="w-5 h-5 shrink-0 text-amber-600" />
        <p className="flex-1 min-w-[14rem]">
          Email <b className="break-all">{currentUser.email}</b> chưa được xác minh. Hãy mở email chúng tôi đã gửi và bấm vào liên kết để bảo vệ tài khoản.
        </p>
        <div className="flex gap-2">
          <button onClick={resend} disabled={busy !== null} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center gap-1.5 disabled:opacity-60">
            {busy === 'resend' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Gửi lại email
          </button>
          <button onClick={check} disabled={busy !== null} className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 font-semibold text-xs disabled:opacity-60">
            Tôi đã xác minh
          </button>
        </div>
      </div>
    </div>
  );
};

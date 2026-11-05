import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api, ApiError } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { AuthLayout, ErrorBox, SuccessMessage } from '../layout/AuthLayout';

// Trang xác minh email (/verify-email?token=...&email=...), mở từ link trong email: gửi mã lên server và báo kết quả.
// Đang đăng nhập thì làm mới thông tin tài khoản để banner nhắc xác minh biến mất.

type State = 'loading' | 'success' | 'error' | 'invalid';

export const VerifyEmailPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const { currentUser, refreshUser } = useAuth();
  const [state, setState] = useState<State>(token && email ? 'loading' : 'invalid');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token || !email) return;
    let cancelled = false;
    api
      .post('/auth/verify-email', { email, token })
      .then(() => {
        if (cancelled) return;
        setState('success');
        refreshUser().catch(() => {}); // chưa đăng nhập thì /auth/me trả 401 — bỏ qua, chỉ là cập nhật phụ
      })
      .catch((err) => {
        if (cancelled) return;
        setMessage(err instanceof ApiError ? err.message : 'Đã có lỗi xảy ra, vui lòng thử lại.');
        setState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, email]);

  return (
    <AuthLayout subtitle="Xác minh email">
      {state === 'loading' && (
        <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Đang xác minh email...
        </div>
      )}
      {state === 'success' && (
        <>
          <SuccessMessage title="Đã xác minh email!">Cảm ơn bạn. Email <b>{email}</b> đã được xác minh.</SuccessMessage>
          <Link to={currentUser ? '/' : '/login'} className="btn-primary w-full mt-4 block text-center">
            {currentUser ? 'Vào SocialNet' : 'Đăng nhập'}
          </Link>
        </>
      )}
      {state === 'error' && (
        <>
          <ErrorBox message={message} />
          <p className="text-xs text-slate-500">Bạn có thể đăng nhập rồi bấm "Gửi lại email" ở dải thông báo phía trên để nhận liên kết mới.</p>
          <Link to="/login" className="btn-secondary w-full mt-4 block text-center">
            Về trang đăng nhập
          </Link>
        </>
      )}
      {state === 'invalid' && (
        <div className="text-center py-4 space-y-3">
          <h3 className="text-lg font-bold text-slate-800">Liên kết không hợp lệ</h3>
          <p className="text-xs text-slate-500">Liên kết xác minh bị thiếu thông tin. Hãy mở lại đúng liên kết trong email.</p>
          <Link to="/" className="text-xs font-bold text-blue-600">
            Về trang chủ
          </Link>
        </div>
      )}
    </AuthLayout>
  );
};

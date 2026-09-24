import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { api, ApiError } from '../utils/api';
import { FormField } from '../components/ui';
import { AuthLayout, SubmitButton, ErrorBox, SuccessMessage, BackToLogin } from '../layout/AuthLayout';

// Trang đặt lại mật khẩu, mở từ link trong email: /reset-password?token=...&email=...
// Gửi token + mật khẩu mới lên server; server kiểm tra token có khớp và còn hạn (1 giờ) không.

export const ResetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError('Mật khẩu phải có ít nhất 6 ký tự.');
    if (password !== confirm) return setError('Mật khẩu xác nhận không khớp.');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đã có lỗi xảy ra, vui lòng thử lại.');
    }
    setLoading(false);
  };

  let content;
  if (!token || !email) {
    content = (
      <div className="text-center py-4 space-y-3">
        <h3 className="text-lg font-bold text-slate-800">Liên kết không hợp lệ</h3>
        <Link to="/forgot-password" className="text-xs font-bold text-blue-600">
          Yêu cầu liên kết mới
        </Link>
      </div>
    );
  } else if (done) {
    content = <SuccessMessage title="Đã đặt lại mật khẩu!">Bạn có thể đăng nhập bằng mật khẩu mới ngay bây giờ.</SuccessMessage>;
  } else {
    content = (
      <>
        <h2 className="text-xl font-black text-slate-800 mb-2">Mật khẩu mới</h2>
        <p className="text-xs text-slate-500 mb-5">
          Đặt mật khẩu mới cho tài khoản <b>{email}</b>.
        </p>
        <ErrorBox message={error} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Mật khẩu mới" icon={Lock} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <FormField label="Xác nhận mật khẩu" icon={Lock} type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <SubmitButton loading={loading}>{loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}</SubmitButton>
        </form>
      </>
    );
  }

  return (
    <AuthLayout subtitle="Đặt lại mật khẩu">
      {content}
      <BackToLogin />
    </AuthLayout>
  );
};

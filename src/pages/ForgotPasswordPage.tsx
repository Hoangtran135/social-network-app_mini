import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { api } from '../utils/api';
import { FormField } from '../components/ui';
import { AuthLayout, SubmitButton, SuccessMessage, BackToLogin } from '../layout/AuthLayout';

// Trang quên mật khẩu (/forgot-password): nhập email → server gửi email chứa link đặt lại mật khẩu.
// Server luôn trả "ok" (không cho biết email có tồn tại hay không) nên trang luôn hiện "Đã gửi hướng dẫn".

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await api.post('/auth/forgot-password', { email }).catch(() => {});
    setLoading(false);
    setSent(true);
  };

  return (
    <AuthLayout subtitle="Khôi phục quyền truy cập tài khoản">
      {sent ? (
        <SuccessMessage title="Đã gửi hướng dẫn!">
          Vui lòng kiểm tra hòm thư <b>{email}</b> để đặt lại mật khẩu.
        </SuccessMessage>
      ) : (
        <>
          <h2 className="text-xl font-black text-slate-800 mb-2">Quên mật khẩu?</h2>
          <p className="text-xs text-slate-500 mb-5">Nhập email đăng ký, chúng tôi sẽ gửi liên kết để đặt lại mật khẩu mới.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Email tài khoản" icon={Mail} type="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <SubmitButton loading={loading}>{loading ? 'Đang gửi...' : 'Gửi yêu cầu khôi phục'}</SubmitButton>
          </form>
        </>
      )}
      <BackToLogin />
    </AuthLayout>
  );
};

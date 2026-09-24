import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FormField } from '../components/ui';
import { AuthLayout, SubmitButton, ErrorBox } from '../layout/AuthLayout';

// Trang đăng nhập (/login): nhập email + mật khẩu, thành công thì vào bảng tin.

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) navigate('/');
    else setError('Email hoặc mật khẩu không chính xác.');
  };

  return (
    <AuthLayout subtitle="Kết nối, chia sẻ và lan tỏa khoảnh khắc cuộc sống">
      <h2 className="text-xl font-black text-slate-800 mb-5">Đăng nhập tài khoản</h2>
      <ErrorBox message={error} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Email" icon={Mail} type="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormField
          label="Mật khẩu"
          icon={Lock}
          type="password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          labelRight={
            <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline font-semibold">
              Quên mật khẩu?
            </Link>
          }
        />
        <SubmitButton loading={loading}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'} <ArrowRight className="w-4 h-4" />
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-xs text-slate-500">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="text-blue-600 hover:underline font-bold">
          Đăng ký ngay
        </Link>
      </p>
    </AuthLayout>
  );
};

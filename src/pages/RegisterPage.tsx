import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight, User as UserIcon, AtSign } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FormField } from '../components/ui';
import { AuthLayout, SubmitButton, ErrorBox } from '../layout/AuthLayout';

// Trang đăng ký (/register): tạo tài khoản mới; server trả token luôn nên đăng ký xong là vào thẳng bảng tin.

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setField = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await register(form.name, form.username, form.email, form.password);
    setLoading(false);
    if (ok) navigate('/');
    else setError('Email hoặc tên người dùng đã tồn tại.');
  };

  return (
    <AuthLayout subtitle="Tạo tài khoản mới và kết nối với bạn bè">
      <h2 className="text-xl font-black text-slate-800 mb-5">Đăng ký tài khoản</h2>
      <ErrorBox message={error} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Họ và tên" icon={UserIcon} required placeholder="Nguyễn Văn A" value={form.name} onChange={setField('name')} />
        <FormField
          label="Tên người dùng (@username)"
          icon={AtSign}
          required
          placeholder="nguyenvana"
          value={form.username}
          // username: chữ thường, không khoảng trắng
          onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
        />
        <FormField label="Email" icon={Mail} type="email" required placeholder="name@example.com" value={form.email} onChange={setField('email')} />
        <FormField label="Mật khẩu" icon={Lock} type="password" required placeholder="Tối thiểu 6 ký tự" value={form.password} onChange={setField('password')} />
        <SubmitButton loading={loading}>
          {loading ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản'} <ArrowRight className="w-4 h-4" />
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-xs text-slate-500">
        Đã có tài khoản?{' '}
        <Link to="/login" className="text-blue-600 hover:underline font-bold">
          Đăng nhập ngay
        </Link>
      </p>
    </AuthLayout>
  );
};

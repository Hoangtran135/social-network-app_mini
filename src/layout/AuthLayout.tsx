import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowLeft, CheckCircle2, Loader2, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// Khung chung cho 4 trang chưa đăng nhập (đăng nhập, đăng ký, quên / đặt lại mật khẩu):
// logo SocialNet ở trên, một thẻ trắng ở giữa chứa nội dung. Kèm vài mảnh giao diện mà cả 4 trang cùng dùng.

export const AuthLayout: React.FC<{ subtitle: string; children: React.ReactNode }> = ({ subtitle, children }) => {
  const { resolved, toggle } = useTheme();
  return (
  <div className="bg-auth min-h-screen flex items-center justify-center px-4 py-8 relative">
    <button onClick={toggle} aria-label={resolved === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'} className="absolute top-4 right-4 p-2.5 rounded-full bg-white/80 hover:bg-white text-slate-600 shadow">
      {resolved === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
    <div className="max-w-md w-full">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-violet-600 text-white shadow-xl mb-3">
          <Sparkles className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">SocialNet</h1>
        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      </div>
      <div className="animate-pop bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200/80">{children}</div>
    </div>
  </div>
  );
};

export const SubmitButton: React.FC<{ loading: boolean; children: React.ReactNode }> = ({ loading, children }) => (
  <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
    {children}
  </button>
);

export const ErrorBox: React.FC<{ message: string }> = ({ message }) =>
  message ? <div role="alert" className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{message}</div> : null;

export const SuccessMessage: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="text-center py-4 space-y-3">
    <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
    <h3 className="text-lg font-bold text-slate-800">{title}</h3>
    <p className="text-xs text-slate-600">{children}</p>
  </div>
);

export const BackToLogin: React.FC = () => (
  <div className="mt-6 pt-5 border-t border-slate-100 text-center">
    <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 font-bold">
      <ArrowLeft className="w-4 h-4" />
      Quay lại trang đăng nhập
    </Link>
  </div>
);

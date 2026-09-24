import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, KeyRound, ShieldOff, ChevronRight, User as UserIcon } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { api, ApiError } from '../utils/api';
import { PageHeader, FormField } from '../components/ui';

// Trang cài đặt (/settings): đổi mật khẩu (phải nhập đúng mật khẩu hiện tại) và lối vào trang Danh sách chặn.

export const SettingsPage: React.FC = () => {
  const { showToast } = useSocial();
  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) return showToast('Mật khẩu mới phải có ít nhất 6 ký tự', 'error');
    if (newPassword !== confirm) return showToast('Mật khẩu xác nhận không khớp', 'error');
    try {
      await api.patch('/users/me/password', { currentPassword: current, newPassword });
      showToast('Đã đổi mật khẩu thành công!');
      setCurrent('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Không thể đổi mật khẩu.', 'error');
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader icon={Settings} title="Cài đặt tài khoản" subtitle="Quản lý mật khẩu và quyền riêng tư">
        <Link to="/settings/profile" className="btn-secondary flex items-center gap-1.5">
          <UserIcon className="w-4 h-4" /> Sửa hồ sơ
        </Link>
      </PageHeader>

      <div className="card rounded-3xl p-6 mb-6">
        <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-blue-600" /> Đổi mật khẩu
        </h2>
        <form onSubmit={changePassword} className="space-y-4 max-w-md">
          <FormField label="Mật khẩu hiện tại" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          <FormField label="Mật khẩu mới" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <FormField label="Xác nhận mật khẩu mới" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button type="submit" className="btn-primary">
            Cập nhật mật khẩu
          </button>
        </form>
      </div>

      <Link to="/settings/blocked" className="card rounded-3xl p-6 flex items-center justify-between hover:bg-slate-50">
        <div className="flex items-center gap-2">
          <ShieldOff className="w-5 h-5 text-blue-600" />
          <div>
            <p className="font-bold text-slate-800">Danh sách chặn</p>
            <p className="text-xs text-slate-500">Quản lý những người dùng bạn đã chặn</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400" />
      </Link>
    </div>
  );
};

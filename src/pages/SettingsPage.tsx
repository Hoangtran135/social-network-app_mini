import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, KeyRound, ShieldOff, ChevronRight, User as UserIcon, Loader2, LucideIcon } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { api, ApiError } from '../utils/api';
import { PageHeader, FormField } from '../components/ui';

// Trang cài đặt (/settings): lối vào Chỉnh sửa hồ sơ và Danh sách chặn, và form đổi mật khẩu (phải nhập đúng mật khẩu hiện tại).

const SettingsLink: React.FC<{ to: string; icon: LucideIcon; title: string; description: string }> = ({ to, icon: Icon, title, description }) => (
  <Link to={to} className="flex items-center justify-between gap-3 p-4 sm:p-5 hover:bg-slate-50 transition-colors">
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-slate-800 text-sm">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
  </Link>
);

export const SettingsPage: React.FC = () => {
  const { showToast } = useSocial();
  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) return showToast('Mật khẩu mới phải có ít nhất 6 ký tự', 'error');
    if (newPassword !== confirm) return showToast('Mật khẩu xác nhận không khớp', 'error');
    setSaving(true);
    try {
      await api.patch('/users/me/password', { currentPassword: current, newPassword });
      showToast('Đã đổi mật khẩu thành công!');
      setCurrent('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Không thể đổi mật khẩu.', 'error');
    }
    setSaving(false);
  };

  return (
    <div className="page-medium">
      <PageHeader icon={Settings} title="Cài đặt tài khoản" subtitle="Quản lý hồ sơ, mật khẩu và quyền riêng tư" />

      <div className="card rounded-2xl overflow-hidden divide-y divide-slate-100 mb-5">
        <SettingsLink to="/settings/profile" icon={UserIcon} title="Chỉnh sửa hồ sơ" description="Đổi ảnh đại diện, ảnh bìa, tên và thông tin cá nhân" />
        <SettingsLink to="/settings/blocked" icon={ShieldOff} title="Danh sách chặn" description="Quản lý những người dùng bạn đã chặn" />
      </div>

      <div className="card rounded-2xl p-5 sm:p-6">
        <h2 className="section-title flex items-center gap-2 mb-1">
          <KeyRound className="w-5 h-5 text-blue-600" /> Đổi mật khẩu
        </h2>
        <p className="text-xs text-slate-500 mb-4">Dùng mật khẩu mạnh, ít nhất 6 ký tự, và không dùng lại ở nơi khác.</p>
        <form onSubmit={changePassword} className="space-y-4 max-w-md">
          <FormField label="Mật khẩu hiện tại" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <FormField label="Mật khẩu mới" type="password" required minLength={6} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <FormField label="Xác nhận mật khẩu mới" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Cập nhật mật khẩu
          </button>
        </form>
      </div>
    </div>
  );
};

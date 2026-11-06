import React from 'react';
import { Globe, Lock, Crown, ShieldCheck } from 'lucide-react';
import { Group, GroupRole } from '../../types';

// Mảnh giao diện nhỏ dùng chung cho các màn hình nhóm: nhãn quyền riêng tư và nhãn vai trò.

export const GroupPrivacyBadge: React.FC<{ privacy: Group['privacy'] }> = ({ privacy }) => (
  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
    {privacy === 'public' ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
    {privacy === 'public' ? 'Nhóm công khai' : 'Nhóm riêng tư'}
  </span>
);

/** Nhãn vai trò (chỉ hiện cho chủ nhóm / quản trị viên). */
export const RoleBadge: React.FC<{ role?: GroupRole | null }> = ({ role }) => {
  if (role === 'owner')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
        <Crown className="w-3 h-3" /> Chủ nhóm
      </span>
    );
  if (role === 'admin')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
        <ShieldCheck className="w-3 h-3" /> Quản trị viên
      </span>
    );
  return null;
};

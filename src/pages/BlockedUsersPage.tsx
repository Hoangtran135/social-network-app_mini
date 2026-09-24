import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldOff, ArrowLeft, UserX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { User } from '../types';
import { api } from '../utils/api';
import { PageHeader, EmptyState } from '../components/ui';

// Trang danh sách chặn (/settings/blocked): xem những người mình đã chặn và bỏ chặn.
// Khi chặn nhau, hai bên không xem được trang cá nhân, bài viết, không kết bạn hay nhắn tin được.

export const BlockedUsersPage: React.FC = () => {
  const { unblockUser } = useAuth();
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[] | null>(null); // null = đang tải

  useEffect(() => {
    api.get<{ users: User[] }>('/users/me/blocked').then((d) => setUsers(d.users)).catch(() => setUsers([]));
  }, []);

  const unblock = async (user: User) => {
    if (!(await confirm(`Bỏ chặn ${user.name}?`))) return;
    await unblockUser(user.id);
    setUsers((list) => list!.filter((u) => u.id !== user.id));
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        icon={ShieldOff}
        iconColor="bg-rose-50 text-rose-600"
        title="Danh sách chặn"
        subtitle={users ? `Bạn đang chặn ${users.length} người dùng` : 'Đang tải...'}
        before={
          <Link to="/settings" title="Quay lại Cài đặt" className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        }
      />
      {users?.length === 0 && <EmptyState icon={UserX} title="Bạn chưa chặn ai" />}
      {!!users?.length && (
        <div className="card rounded-3xl p-4 divide-y divide-slate-100">
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-3 py-3">
              <img src={user.avatar} alt="" className="w-12 h-12 rounded-full object-cover grayscale" />
              <div className="flex-1 text-sm">
                <b className="text-slate-800">{user.name}</b>
                <div className="text-xs text-slate-400">@{user.username}</div>
              </div>
              <button onClick={() => unblock(user)} className="btn-secondary">
                Bỏ chặn
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

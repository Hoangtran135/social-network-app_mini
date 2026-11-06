import React, { useState } from 'react';
import { Users, Ban, ShieldCheck, ShieldOff, RotateCcw } from 'lucide-react';
import { api } from '../../utils/api';
import { AdminUser } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useAdminList } from '../../hooks/useAdminList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useManageAction } from '../../hooks/useManageAction';
import { formatDateTime } from '../../utils/adminLabels';
import { PageHeader } from '../../components/ui';
import { AdminTable, AdminToolbar, Cell, Person, Pill } from '../../components/admin/AdminUi';
import { ReasonDialog } from '../../components/admin/ReasonDialog';

// Quản lý người dùng (/admin/users): tìm / lọc, khoá (kèm lý do) / mở khoá tài khoản, cấp / thu hồi quyền quản trị.

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'admin', label: 'Quản trị viên' },
  { key: 'user', label: 'Người dùng' },
  { key: 'online', label: 'Đang online' },
  { key: 'banned', label: 'Bị khoá' },
];

export const AdminUsersPage: React.FC = () => {
  const { currentUser } = useAuth();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [banning, setBanning] = useState<AdminUser | null>(null);
  const list = useAdminList<AdminUser>('/admin/users', 'users', { q: useDebouncedValue(search.trim()), filter: filter === 'all' ? '' : filter });
  const { act, busy } = useManageAction(list.reload);

  const ban = async (user: AdminUser, reason: string) => {
    if (await act(() => api.patch(`/admin/users/${user.id}/ban`, { banned: true, reason }), `Đã khoá tài khoản ${user.name}`)) setBanning(null);
  };
  const unban = async (user: AdminUser) => {
    if (await confirm(`Mở khoá tài khoản của ${user.name}?`)) await act(() => api.patch(`/admin/users/${user.id}/ban`, { banned: false }), `Đã mở khoá ${user.name}`);
  };
  const setRole = async (user: AdminUser, role: 'user' | 'admin') => {
    const question = role === 'admin' ? `Cấp quyền quản trị cho ${user.name}? Họ sẽ có toàn quyền quản lý hệ thống.` : `Thu hồi quyền quản trị của ${user.name}?`;
    if (await confirm(question)) await act(() => api.patch(`/admin/users/${user.id}/role`, { role }), role === 'admin' ? `${user.name} đã là quản trị viên` : `Đã thu hồi quyền của ${user.name}`);
  };

  return (
    <div>
      <PageHeader icon={Users} title="Người dùng" subtitle={list.status === 'ready' ? `${list.total} tài khoản` : undefined} />
      <AdminToolbar search={search} onSearch={setSearch} placeholder="Tìm theo tên, username, email..." filters={FILTERS} filter={filter} onFilter={setFilter} />
      <AdminTable
        list={list}
        emptyTitle="Không tìm thấy người dùng"
        emptyIcon={Users}
        columns={[
          { label: 'Người dùng' },
          { label: 'Email', className: 'hidden md:table-cell' },
          { label: 'Vai trò' },
          { label: 'Trạng thái' },
          { label: 'Ngày tham gia', className: 'hidden lg:table-cell' },
          { label: 'Thao tác', className: 'text-right' },
        ]}
        renderRow={(user) => {
          const isMe = user.id === currentUser?.id;
          return (
            <tr key={user.id}>
              <Cell>
                <Person person={user} />
              </Cell>
              <Cell className="hidden md:table-cell text-slate-600 break-all">{user.email}</Cell>
              <Cell>{user.role === 'admin' ? <Pill tone="blue">Quản trị viên</Pill> : <Pill>Người dùng</Pill>}</Cell>
              <Cell>
                {user.banned ? (
                  <div>
                    <Pill tone="red">Bị khoá</Pill>
                    {user.banReason && <p className="text-xs text-slate-400 mt-1 max-w-48 truncate" title={user.banReason}>{user.banReason}</p>}
                  </div>
                ) : user.isOnline ? (
                  <Pill tone="green">Online</Pill>
                ) : (
                  <Pill>Offline</Pill>
                )}
              </Cell>
              <Cell className="hidden lg:table-cell text-slate-500 whitespace-nowrap">{formatDateTime(user.joinDate)}</Cell>
              <Cell>
                <div className="flex justify-end gap-2">
                  {isMe ? (
                    <span className="text-xs text-slate-400">Tài khoản của bạn</span>
                  ) : (
                    <>
                      {user.banned ? (
                        <button disabled={busy} onClick={() => unban(user)} className="btn-secondary btn-sm">
                          <RotateCcw className="w-3.5 h-3.5" /> Mở khoá
                        </button>
                      ) : (
                        user.role !== 'admin' && (
                          <button disabled={busy} onClick={() => setBanning(user)} className="btn-danger btn-sm">
                            <Ban className="w-3.5 h-3.5" /> Khoá
                          </button>
                        )
                      )}
                      {user.role === 'admin' ? (
                        <button disabled={busy} onClick={() => setRole(user, 'user')} className="btn-secondary btn-sm">
                          <ShieldOff className="w-3.5 h-3.5" /> Thu hồi quyền
                        </button>
                      ) : (
                        !user.banned && (
                          <button disabled={busy} onClick={() => setRole(user, 'admin')} className="btn-secondary btn-sm">
                            <ShieldCheck className="w-3.5 h-3.5" /> Cấp quyền
                          </button>
                        )
                      )}
                    </>
                  )}
                </div>
              </Cell>
            </tr>
          );
        }}
      />
      {banning && (
        <ReasonDialog
          title={`Khoá tài khoản ${banning.name}`}
          description="Người này sẽ bị đăng xuất ngay và không thể đăng nhập hay dùng ứng dụng cho tới khi được mở khoá."
          label="Lý do khoá (hiện cho người bị khoá khi họ đăng nhập — không bắt buộc)"
          submitLabel="Khoá tài khoản"
          danger
          busy={busy}
          onSubmit={(reason) => ban(banning, reason)}
          onClose={() => setBanning(null)}
        />
      )}
    </div>
  );
};

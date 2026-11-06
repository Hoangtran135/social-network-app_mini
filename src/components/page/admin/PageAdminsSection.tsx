import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { api } from '../../../utils/api';
import { Page, User } from '../../../types';
import { useConfirm } from '../../../context/ConfirmDialogContext';
import { useAuth } from '../../../context/AuthContext';
import { useManageAction } from '../../../hooks/useManageAction';
import { AdminSection, Avatar } from '../../ui';

// Mục "Quản trị viên" của tab Quản trị: danh sách, chủ trang thêm (tìm người) / gỡ, quản trị viên tự rời.

export const PageAdmins: React.FC<{ page: Page; reload: () => void }> = ({ page, reload }) => {
  const { currentUser } = useAuth();
  const confirm = useConfirm();
  const { act, busy } = useManageAction(reload);
  const isOwner = page.myRole === 'owner';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[] | null>(null);
  const adminIds = new Set((page.admins || []).map((a) => a.id));

  // Tìm người để thêm làm quản trị viên (gõ xong 250ms mới gọi server)
  useEffect(() => {
    const q = query.trim();
    if (!q) return setResults(null);
    let stale = false;
    const timer = setTimeout(() => {
      api
        .get<{ users: User[] }>(`/users?q=${encodeURIComponent(q)}&limit=8`)
        .then((d) => !stale && setResults(d.users))
        .catch(() => !stale && setResults([]));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <AdminSection icon={UserPlus} title="Quản trị viên">
      <ul className="divide-y divide-slate-100" aria-label="Danh sách quản trị viên">
        {(page.admins || []).map((a) => {
          const owner = a.id === page.ownerId;
          const me = a.id === currentUser?.id;
          return (
            <li key={a.id} className="py-2.5 flex items-center gap-3">
              <Link to={`/profile/${a.id}`}>
                <Avatar src={a.avatar} size="w-10 h-10" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/profile/${a.id}`} className="block text-sm font-semibold text-slate-900 truncate hover:text-blue-600">
                  {a.name}
                  {me && <span className="font-normal text-slate-400"> (bạn)</span>}
                </Link>
                <span className="text-xs text-slate-500">{owner ? 'Chủ trang' : 'Quản trị viên'}</span>
              </div>
              {!owner && (isOwner || me) && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (!(await confirm(me ? 'Rời vị trí quản trị viên của trang này?' : `Gỡ quyền quản trị viên của ${a.name}?`))) return;
                    act(() => api.delete(`/pages/${page.id}/admins/${a.id}`), me ? 'Bạn đã rời vị trí quản trị viên.' : `Đã gỡ quyền quản trị viên của ${a.name}.`);
                  }}
                  className="btn-secondary btn-sm"
                >
                  {me ? 'Rời vị trí' : 'Gỡ quyền'}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {isOwner && (
        <div className="mt-3">
          <label htmlFor="page-add-admin" className="field-label block mb-1.5">
            Thêm quản trị viên
          </label>
          <input id="page-add-admin" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc @username..." className="input" />
          {results?.length === 0 && <p className="mt-2 text-sm text-slate-400">Không tìm thấy người dùng nào.</p>}
          <ul className="mt-2 space-y-1">
            {results
              ?.filter((u) => !adminIds.has(u.id))
              .map((u) => (
                <li key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50">
                  <Avatar src={u.avatar} size="w-9 h-9" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800 truncate">{u.name}</div>
                    <div className="text-xs text-slate-400 truncate">@{u.username}</div>
                  </div>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (await act(() => api.post(`/pages/${page.id}/admins`, { userId: u.id }), `Đã thêm ${u.name} làm quản trị viên.`)) setQuery('');
                    }}
                    className="btn-primary btn-sm"
                  >
                    Thêm
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </AdminSection>
  );
};

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api } from '../../../utils/api';
import { Page, User } from '../../../types';
import { AdminSection, Avatar } from '../../ui';

// Mục "Người theo dõi" của tab Quản trị: danh sách người theo dõi trang.

export const PageFollowers: React.FC<{ page: Page }> = ({ page }) => {
  const [users, setUsers] = useState<User[] | null>(null);
  useEffect(() => {
    api
      .get<{ users: User[] }>(`/pages/${page.id}/followers?limit=50`)
      .then((d) => setUsers(d.users))
      .catch(() => setUsers([]));
  }, [page.id, page.followersCount]);

  return (
    <AdminSection icon={Users} title={`Người theo dõi (${page.followersCount})`}>
      {users?.length === 0 && <p className="text-sm text-slate-400">Chưa có ai theo dõi trang này.</p>}
      <ul className="grid sm:grid-cols-2 gap-1">
        {users?.map((u) => (
          <li key={u.id}>
            <Link to={`/profile/${u.id}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50">
              <Avatar src={u.avatar} size="w-9 h-9" />
              <span className="text-sm font-semibold text-slate-800 truncate">{u.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
};

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, UsersRound, Plus } from 'lucide-react';
import { api } from '../utils/api';
import { Group } from '../types';
import { CreateGroupModal } from '../components/group/CreateGroupModal';
import { GroupPrivacyBadge } from '../components/group/groupUi';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, TabButton, SquareAvatar } from '../components/ui';

// Trang danh sách nhóm (/groups): tab "Nhóm của tôi" và "Khám phá" (nhóm chưa tham gia), tìm theo tên, nút tạo nhóm mới.

type Scope = 'mine' | 'discover';

const GroupCard: React.FC<{ group: Group }> = ({ group }) => (
  <Link to={`/groups/${group.id}`} className="card w-full overflow-hidden flex flex-col hover:border-blue-300 hover:shadow-md transition">
    <div className="h-20 bg-gradient-to-r from-blue-600 to-violet-600">{group.cover && <img src={group.cover} alt="" loading="lazy" className="w-full h-full object-cover" />}</div>
    <div className="p-4 pt-0 flex-1 flex flex-col">
      <SquareAvatar item={group} size="size-14 -mt-7 border-4 border-white shadow" className="text-xl" />
      <h3 className="mt-2 text-sm font-semibold text-slate-900 break-words line-clamp-2">{group.name}</h3>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
        <GroupPrivacyBadge privacy={group.privacy} />
        <span>· {group.membersCount} thành viên</span>
      </div>
      {group.description && <p className="mt-2 text-xs text-slate-500 line-clamp-2 break-words">{group.description}</p>}
      {group.myStatus === 'pending' && <p className="mt-2 text-xs font-semibold text-amber-600">Đã gửi yêu cầu · đang chờ duyệt</p>}
    </div>
  </Link>
);

export const GroupsPage: React.FC = () => {
  const [scope, setScope] = useState<Scope>('mine');
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Gõ xong 250ms mới gọi server; bỏ kết quả của những lần gọi cũ hơn
  useEffect(() => {
    setGroups(null);
    setFailed(false);
    let stale = false;
    const timer = setTimeout(() => {
      api
        .get<{ groups: Group[] }>(`/groups?scope=${scope}&q=${encodeURIComponent(query.trim())}&limit=60`)
        .then((d) => !stale && setGroups(d.groups))
        .catch(() => !stale && setFailed(true));
    }, query ? 250 : 0);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [scope, query, reloadKey]);

  return (
    <div className="page-wide">
      <PageHeader icon={UsersRound} iconColor="bg-violet-50 text-violet-600" title="Nhóm" subtitle="Giao lưu cùng những người chung sở thích">
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Tạo nhóm
        </button>
      </PageHeader>

      <div className="card p-2 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex gap-1">
          <TabButton active={scope === 'mine'} onClick={() => setScope('mine')}>
            Nhóm của tôi
          </TabButton>
          <TabButton active={scope === 'discover'} onClick={() => setScope('discover')}>
            Khám phá
          </TabButton>
        </div>
        <div className="relative sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm nhóm..." aria-label="Tìm nhóm" className="w-full h-10 pl-10 pr-3 text-sm bg-slate-100 rounded-full focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/30" />
        </div>
      </div>

      {failed && <ErrorState title="Không tải được danh sách nhóm" onRetry={() => setReloadKey((k) => k + 1)} />}
      {!failed && groups === null && <ListSkeleton count={4} />}
      {groups?.length === 0 && (
        <EmptyState
          icon={UsersRound}
          title={query ? `Không tìm thấy nhóm "${query}"` : scope === 'mine' ? 'Bạn chưa tham gia nhóm nào' : 'Chưa có nhóm nào để khám phá'}
          description={scope === 'mine' && !query ? 'Tạo nhóm của riêng bạn hoặc khám phá các nhóm đang có.' : undefined}
        >
          {scope === 'mine' && !query && (
            <button onClick={() => setScope('discover')} className="btn-primary">
              Khám phá nhóm
            </button>
          )}
        </EmptyState>
      )}
      {!!groups?.length && (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <li key={g.id} className="flex">
              <GroupCard group={g} />
            </li>
          ))}
        </ul>
      )}

      {creating && <CreateGroupModal onClose={() => setCreating(false)} />}
    </div>
  );
};

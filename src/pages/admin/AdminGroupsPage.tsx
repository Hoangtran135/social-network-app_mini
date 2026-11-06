import React, { useState } from 'react';
import { UsersRound, Flag, Trash2, Globe, Lock } from 'lucide-react';
import { api } from '../../utils/api';
import { AdminGroup, AdminPage } from '../../types';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useAdminList } from '../../hooks/useAdminList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useManageAction } from '../../hooks/useManageAction';
import { timeAgo } from '../../utils/format';
import { PageHeader, SquareAvatar, TabButton } from '../../components/ui';
import { AdminTable, AdminToolbar, Cell, Person, Pill } from '../../components/admin/AdminUi';
import { categoryLabel } from '../../components/page/pageUi';

// Kiểm duyệt nhóm và trang (/admin/groups): hai tab, tìm theo tên, gỡ nhóm / trang vi phạm (xoá kèm bài viết, bình luận).

const GroupsTable: React.FC<{ search: string }> = ({ search }) => {
  const confirm = useConfirm();
  const list = useAdminList<AdminGroup>('/admin/groups', 'groups', { q: search });
  const { act, busy } = useManageAction(list.reload);
  const remove = async (group: AdminGroup) => {
    if (await confirm(`Gỡ nhóm "${group.name}"? Toàn bộ bài viết, bình luận và thành viên của nhóm sẽ bị xoá vĩnh viễn.`)) await act(() => api.delete(`/admin/groups/${group.id}`), 'Đã gỡ nhóm');
  };
  return (
    <AdminTable
      list={list}
      emptyTitle="Không có nhóm nào"
      emptyIcon={UsersRound}
      columns={[{ label: 'Nhóm' }, { label: 'Chủ nhóm', className: 'hidden md:table-cell' }, { label: 'Thành viên' }, { label: 'Bài viết', className: 'hidden sm:table-cell' }, { label: 'Tạo', className: 'hidden lg:table-cell' }, { label: 'Thao tác', className: 'text-right' }]}
      renderRow={(group) => (
        <tr key={group.id}>
          <Cell className="min-w-48">
            <div className="flex items-center gap-2.5 min-w-0">
              <SquareAvatar item={group} size="size-9" />
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 truncate">{group.name}</div>
                <Pill tone={group.privacy === 'public' ? 'green' : 'amber'}>
                  {group.privacy === 'public' ? <Globe className="w-3 h-3 mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
                  {group.privacy === 'public' ? 'Công khai' : 'Riêng tư'}
                </Pill>
              </div>
            </div>
          </Cell>
          <Cell className="hidden md:table-cell">
            <Person person={group.owner} />
          </Cell>
          <Cell>{group.membersCount}</Cell>
          <Cell className="hidden sm:table-cell">{group.postsCount}</Cell>
          <Cell className="hidden lg:table-cell text-xs text-slate-500 whitespace-nowrap">{timeAgo(group.createdAt)}</Cell>
          <Cell>
            <div className="flex justify-end">
              <button disabled={busy} onClick={() => remove(group)} className="btn-danger btn-sm">
                <Trash2 className="w-3.5 h-3.5" /> Gỡ nhóm
              </button>
            </div>
          </Cell>
        </tr>
      )}
    />
  );
};

const PagesTable: React.FC<{ search: string }> = ({ search }) => {
  const confirm = useConfirm();
  const list = useAdminList<AdminPage>('/admin/pages', 'pages', { q: search });
  const { act, busy } = useManageAction(list.reload);
  const remove = async (page: AdminPage) => {
    if (await confirm(`Gỡ trang "${page.name}"? Toàn bộ bài viết, bình luận và lượt theo dõi của trang sẽ bị xoá vĩnh viễn.`)) await act(() => api.delete(`/admin/pages/${page.id}`), 'Đã gỡ trang');
  };
  return (
    <AdminTable
      list={list}
      emptyTitle="Không có trang nào"
      emptyIcon={Flag}
      columns={[{ label: 'Trang' }, { label: 'Chủ trang', className: 'hidden md:table-cell' }, { label: 'Người theo dõi' }, { label: 'Bài viết', className: 'hidden sm:table-cell' }, { label: 'Tạo', className: 'hidden lg:table-cell' }, { label: 'Thao tác', className: 'text-right' }]}
      renderRow={(page) => (
        <tr key={page.id}>
          <Cell className="min-w-48">
            <div className="flex items-center gap-2.5 min-w-0">
              <SquareAvatar item={page} size="size-9" />
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 truncate">{page.name}</div>
                <p className="text-xs text-slate-400">{categoryLabel(page.category)}</p>
              </div>
            </div>
          </Cell>
          <Cell className="hidden md:table-cell">
            <Person person={page.owner} />
          </Cell>
          <Cell>{page.followersCount}</Cell>
          <Cell className="hidden sm:table-cell">{page.postsCount}</Cell>
          <Cell className="hidden lg:table-cell text-xs text-slate-500 whitespace-nowrap">{timeAgo(page.createdAt)}</Cell>
          <Cell>
            <div className="flex justify-end">
              <button disabled={busy} onClick={() => remove(page)} className="btn-danger btn-sm">
                <Trash2 className="w-3.5 h-3.5" /> Gỡ trang
              </button>
            </div>
          </Cell>
        </tr>
      )}
    />
  );
};

export const AdminGroupsPage: React.FC = () => {
  const [tab, setTab] = useState<'groups' | 'pages'>('groups');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim());

  return (
    <div>
      <PageHeader icon={UsersRound} title="Nhóm & Trang" subtitle="Kiểm duyệt cộng đồng">
        <div className="flex gap-1">
          <TabButton active={tab === 'groups'} onClick={() => setTab('groups')} icon={UsersRound}>
            Nhóm
          </TabButton>
          <TabButton active={tab === 'pages'} onClick={() => setTab('pages')} icon={Flag}>
            Trang
          </TabButton>
        </div>
      </PageHeader>
      <AdminToolbar search={search} onSearch={setSearch} placeholder={tab === 'groups' ? 'Tìm theo tên hoặc mô tả nhóm...' : 'Tìm theo tên trang...'} />
      {tab === 'groups' ? <GroupsTable search={q} /> : <PagesTable search={q} />}
    </div>
  );
};

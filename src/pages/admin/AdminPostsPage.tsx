import React, { useState } from 'react';
import { FileText, Trash2, Image as ImageIcon } from 'lucide-react';
import { api } from '../../utils/api';
import { AdminPost } from '../../types';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useAdminList } from '../../hooks/useAdminList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useManageAction } from '../../hooks/useManageAction';
import { timeAgo } from '../../utils/format';
import { POST_KIND_LABELS } from '../../utils/adminLabels';
import { PageHeader } from '../../components/ui';
import { AdminTable, AdminToolbar, Cell, Person, Pill } from '../../components/admin/AdminUi';

// Kiểm duyệt bài viết & Reels (/admin/posts): tìm theo nội dung / tác giả, lọc theo nơi đăng, gỡ bài vi phạm (xoá kèm bình luận, báo cho tác giả).

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'post', label: 'Bài viết' },
  { key: 'reel', label: 'Reels' },
  { key: 'group', label: 'Trong nhóm' },
  { key: 'page', label: 'Của trang' },
];

export const AdminPostsPage: React.FC = () => {
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const list = useAdminList<AdminPost>('/admin/posts', 'posts', { q: useDebouncedValue(search.trim()), kind: filter === 'all' ? '' : filter });
  const { act, busy } = useManageAction(list.reload);

  const remove = async (post: AdminPost) => {
    if (await confirm(`Gỡ ${POST_KIND_LABELS[post.kind].toLowerCase()} này do vi phạm? Bình luận của bài cũng bị xoá và tác giả sẽ được báo.`)) await act(() => api.delete(`/admin/posts/${post.id}`), 'Đã gỡ nội dung');
  };

  return (
    <div>
      <PageHeader icon={FileText} title="Bài viết & Reels" subtitle={list.status === 'ready' ? `${list.total} nội dung` : undefined} />
      <AdminToolbar search={search} onSearch={setSearch} placeholder="Tìm theo nội dung hoặc tác giả..." filters={FILTERS} filter={filter} onFilter={setFilter} />
      <AdminTable
        list={list}
        emptyTitle="Không có bài viết nào"
        emptyIcon={FileText}
        columns={[
          { label: 'Tác giả' },
          { label: 'Nội dung' },
          { label: 'Đăng ở', className: 'hidden md:table-cell' },
          { label: 'Tương tác', className: 'hidden lg:table-cell' },
          { label: 'Thời gian', className: 'hidden sm:table-cell' },
          { label: 'Thao tác', className: 'text-right' },
        ]}
        renderRow={(post) => (
          <tr key={post.id}>
            <Cell className="min-w-44">
              <Person person={post.author} />
            </Cell>
            <Cell className="max-w-xs">
              <p className="text-slate-800 line-clamp-2 break-words">{post.content || <span className="text-slate-400 italic">(không có chữ)</span>}</p>
              {post.mediaCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400 mt-1">
                  <ImageIcon className="w-3.5 h-3.5" /> {post.mediaCount} tệp
                </span>
              )}
            </Cell>
            <Cell className="hidden md:table-cell">
              <Pill tone={post.kind === 'post' ? 'gray' : 'blue'}>{POST_KIND_LABELS[post.kind]}</Pill>
              {(post.groupName || post.pageName) && <p className="text-xs text-slate-400 mt-1 max-w-40 truncate">{post.groupName ?? post.pageName}</p>}
              {post.groupStatus === 'pending' && <p className="text-xs text-amber-600 mt-0.5">Đang chờ duyệt</p>}
            </Cell>
            <Cell className="hidden lg:table-cell text-xs text-slate-500 whitespace-nowrap">
              {post.reactionsCount} cảm xúc · {post.commentsCount} bình luận
            </Cell>
            <Cell className="hidden sm:table-cell text-xs text-slate-500 whitespace-nowrap">{timeAgo(post.createdAt)}</Cell>
            <Cell>
              <div className="flex justify-end">
                <button disabled={busy} onClick={() => remove(post)} className="btn-danger btn-sm">
                  <Trash2 className="w-3.5 h-3.5" /> Gỡ
                </button>
              </div>
            </Cell>
          </tr>
        )}
      />
    </div>
  );
};

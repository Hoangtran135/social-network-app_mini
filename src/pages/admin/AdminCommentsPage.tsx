import React, { useState } from 'react';
import { MessageSquare, Trash2, CornerDownRight } from 'lucide-react';
import { api } from '../../utils/api';
import { AdminComment } from '../../types';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useAdminList } from '../../hooks/useAdminList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useManageAction } from '../../hooks/useManageAction';
import { timeAgo } from '../../utils/format';
import { PageHeader } from '../../components/ui';
import { AdminTable, AdminToolbar, Cell, Person } from '../../components/admin/AdminUi';

// Kiểm duyệt bình luận (/admin/comments): tìm theo nội dung / người viết, gỡ bình luận vi phạm (kèm các câu trả lời của nó).

export const AdminCommentsPage: React.FC = () => {
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const list = useAdminList<AdminComment>('/admin/comments', 'comments', { q: useDebouncedValue(search.trim()) });
  const { act, busy } = useManageAction(list.reload);

  const remove = async (comment: AdminComment) => {
    if (await confirm('Gỡ bình luận này do vi phạm? Các câu trả lời của nó cũng bị xoá và người viết sẽ được báo.')) await act(() => api.delete(`/admin/comments/${comment.id}`), 'Đã gỡ bình luận');
  };

  return (
    <div>
      <PageHeader icon={MessageSquare} title="Bình luận" subtitle={list.status === 'ready' ? `${list.total} bình luận` : undefined} />
      <AdminToolbar search={search} onSearch={setSearch} placeholder="Tìm theo nội dung hoặc người viết..." />
      <AdminTable
        list={list}
        emptyTitle="Không có bình luận nào"
        emptyIcon={MessageSquare}
        columns={[
          { label: 'Người viết' },
          { label: 'Bình luận' },
          { label: 'Thuộc bài viết', className: 'hidden lg:table-cell' },
          { label: 'Thời gian', className: 'hidden sm:table-cell' },
          { label: 'Thao tác', className: 'text-right' },
        ]}
        renderRow={(comment) => (
          <tr key={comment.id}>
            <Cell className="min-w-44">
              <Person person={comment.author} />
            </Cell>
            <Cell className="max-w-xs">
              <p className="text-slate-800 line-clamp-3 break-words">
                {comment.isReply && <CornerDownRight aria-label="Trả lời" className="inline w-3.5 h-3.5 mr-1 text-slate-400" />}
                {comment.content}
              </p>
            </Cell>
            <Cell className="hidden lg:table-cell max-w-56 text-xs text-slate-500">
              <p className="line-clamp-2 break-words">{comment.postExcerpt || '(bài không có chữ hoặc đã bị xoá)'}</p>
            </Cell>
            <Cell className="hidden sm:table-cell text-xs text-slate-500 whitespace-nowrap">{timeAgo(comment.createdAt)}</Cell>
            <Cell>
              <div className="flex justify-end">
                <button disabled={busy} onClick={() => remove(comment)} className="btn-danger btn-sm">
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

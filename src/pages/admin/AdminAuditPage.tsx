import React from 'react';
import { ScrollText } from 'lucide-react';
import { AuditLog } from '../../types';
import { useAdminList } from '../../hooks/useAdminList';
import { actionLabel, auditDetails, formatDateTime } from '../../utils/adminLabels';
import { PageHeader } from '../../components/ui';
import { AdminTable, Cell, Person } from '../../components/admin/AdminUi';

// Nhật ký quản trị (/admin/audit): ai (quản trị viên) đã làm gì, lúc nào. Chỉ xem, không sửa / xoá được.

export const AdminAuditPage: React.FC = () => {
  const list = useAdminList<AuditLog>('/admin/audit-logs', 'logs');
  return (
    <div>
      <PageHeader icon={ScrollText} title="Nhật ký quản trị" subtitle={list.status === 'ready' ? `${list.total} hành động đã ghi lại` : undefined} />
      <AdminTable
        list={list}
        emptyTitle="Chưa có hành động quản trị nào"
        emptyIcon={ScrollText}
        columns={[{ label: 'Quản trị viên' }, { label: 'Hành động' }, { label: 'Chi tiết', className: 'hidden md:table-cell' }, { label: 'Thời gian' }]}
        renderRow={(log) => (
          <tr key={log.id}>
            <Cell className="min-w-44">
              <Person person={log.admin} />
            </Cell>
            <Cell className="font-medium text-slate-800">{actionLabel(log.action)}</Cell>
            <Cell className="hidden md:table-cell text-xs text-slate-500 max-w-xs break-words">{auditDetails(log.details)}</Cell>
            <Cell className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(log.createdAt)}</Cell>
          </tr>
        )}
      />
    </div>
  );
};

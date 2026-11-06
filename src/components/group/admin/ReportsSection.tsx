import React, { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';
import { api } from '../../../utils/api';
import { Group, GroupReport } from '../../../types';
import { useConfirm } from '../../../context/ConfirmDialogContext';
import { useManageAction } from '../../../hooks/useManageAction';
import { timeAgo } from '../../../utils/format';
import { AdminSection, MutedText } from '../../ui';

// Mục "Báo cáo từ thành viên" của tab Quản trị nhóm: bỏ qua báo cáo hoặc xoá bài bị báo cáo.

export const Reports: React.FC<{ group: Group; reload: () => void }> = ({ group, reload }) => {
  const confirm = useConfirm();
  const [reports, setReports] = useState<GroupReport[] | null>(null);
  const load = () =>
    api
      .get<{ reports: GroupReport[] }>(`/groups/${group.id}/reports`)
      .then((d) => setReports(d.reports))
      .catch(() => setReports([]));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, group.openReportsCount]);
  const { act, busy } = useManageAction(() => {
    load();
    reload();
  });

  return (
    <AdminSection id="group-reports" icon={Flag} title="Báo cáo từ thành viên" count={reports?.length ?? group.openReportsCount ?? 0}>
      {reports?.length === 0 && <MutedText>Không có báo cáo nào cần xử lý.</MutedText>}
      <ul className="space-y-3">
        {reports?.map((r) => (
          <li key={r.id} className="p-3 rounded-xl bg-rose-50 border border-rose-100">
            <p className="text-xs text-slate-600">
              <b>{r.reporter.name}</b> báo cáo bài của <b>{r.post.author.name}</b> · {timeAgo(r.createdAt)}
            </p>
            {r.reason && <p className="mt-1 text-sm text-rose-700 break-words">Lý do: {r.reason}</p>}
            <p className="mt-2 p-2 rounded-lg bg-white text-sm text-slate-800 whitespace-pre-line break-words line-clamp-4">{r.post.content || '(bài viết không có chữ)'}</p>
            <div className="mt-3 flex gap-2">
              <button disabled={busy} onClick={() => act(() => api.post(`/groups/${group.id}/reports/${r.id}/resolve`, { action: 'dismiss' }), 'Đã bỏ qua báo cáo.')} className="btn-secondary btn-sm">
                Bỏ qua
              </button>
              <button
                disabled={busy}
                onClick={async () => (await confirm('Xoá bài viết bị báo cáo khỏi nhóm?')) && act(() => api.post(`/groups/${group.id}/reports/${r.id}/resolve`, { action: 'remove' }), 'Đã xoá bài viết bị báo cáo.')}
                className="btn-primary btn-sm !bg-rose-600 hover:!bg-rose-700"
              >
                Xoá bài viết
              </button>
            </div>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
};

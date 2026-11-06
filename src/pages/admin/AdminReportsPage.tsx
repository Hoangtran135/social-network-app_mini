import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, Check, X, Trash2, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../utils/api';
import { AdminReport, ReportStatus } from '../../types';
import { useAdminList } from '../../hooks/useAdminList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useManageAction } from '../../hooks/useManageAction';
import { timeAgo } from '../../utils/format';
import { REPORT_REASON_LABELS, REPORT_TARGET_LABELS } from '../../utils/adminLabels';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '../../components/ui';
import { AdminToolbar, Person, Pill } from '../../components/admin/AdminUi';
import { ReasonDialog } from '../../components/admin/ReasonDialog';

// Báo cáo vi phạm (/admin/reports): người dùng báo cáo bài viết / bình luận / người dùng / nhóm / trang.
// Quản trị viên: "Gỡ nội dung" (xác nhận + xoá nội dung), "Xác nhận" (vi phạm nhưng giữ lại, vd đã nhắc nhở) hoặc "Bỏ qua" (không vi phạm).

const FILTERS = [
  { key: 'pending', label: 'Chờ xử lý' },
  { key: 'resolved', label: 'Đã xử lý' },
  { key: 'dismissed', label: 'Đã bỏ qua' },
  { key: 'all', label: 'Tất cả' },
];

const STATUS_PILL: Record<ReportStatus, React.ReactNode> = {
  pending: <Pill tone="amber">Chờ xử lý</Pill>,
  resolved: <Pill tone="green">Đã xử lý</Pill>,
  dismissed: <Pill>Đã bỏ qua</Pill>,
};

/** Cách xử lý đang chọn cho một báo cáo (mở hộp thoại ghi chú). */
type Decision = { report: AdminReport; status: 'resolved' | 'dismissed'; removeContent: boolean };

const DECISION_TEXT = {
  remove: { title: 'Gỡ nội dung vi phạm', submit: 'Gỡ nội dung', description: 'Nội dung bị xoá vĩnh viễn, mọi báo cáo đang chờ về nội dung này cũng được đóng và chủ nội dung sẽ nhận thông báo.' },
  resolve: { title: 'Xác nhận báo cáo', submit: 'Xác nhận', description: 'Ghi nhận báo cáo là đúng nhưng giữ lại nội dung. Người báo cáo sẽ nhận thông báo.' },
  dismiss: { title: 'Bỏ qua báo cáo', submit: 'Bỏ qua', description: 'Không phát hiện vi phạm. Người báo cáo sẽ nhận thông báo.' },
};

/** Liên kết xem đối tượng bị báo cáo (nếu có trang để xem). */
const targetLink = (r: AdminReport) => ({ post: `/post/${r.targetId}`, user: `/profile/${r.targetId}`, group: `/groups/${r.targetId}`, page: `/pages/${r.targetId}`, comment: undefined })[r.targetType];

export const AdminReportsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('pending');
  const [decision, setDecision] = useState<Decision | null>(null);
  const list = useAdminList<AdminReport>('/admin/reports', 'reports', { q: useDebouncedValue(search.trim()), status: filter === 'all' ? '' : filter });
  const { act, busy } = useManageAction(list.reload);

  const submit = async (note: string) => {
    if (!decision) return;
    const { report, status, removeContent } = decision;
    if (await act(() => api.patch(`/admin/reports/${report.id}`, { status, note, removeContent }), removeContent ? 'Đã gỡ nội dung và xử lý báo cáo' : status === 'resolved' ? 'Đã xác nhận báo cáo' : 'Đã bỏ qua báo cáo')) setDecision(null);
  };
  const text = decision && DECISION_TEXT[decision.removeContent ? 'remove' : decision.status === 'resolved' ? 'resolve' : 'dismiss'];

  return (
    <div>
      <PageHeader icon={Flag} title="Báo cáo vi phạm" subtitle={list.status === 'ready' ? `${list.total} báo cáo` : undefined} />
      <AdminToolbar search={search} onSearch={setSearch} placeholder="Tìm theo nội dung bị báo cáo, mô tả, người báo cáo..." filters={FILTERS} filter={filter} onFilter={setFilter} />

      {list.status === 'loading' ? (
        <ListSkeleton />
      ) : list.status === 'error' ? (
        <ErrorState onRetry={() => void list.reload()} />
      ) : list.items.length === 0 ? (
        <EmptyState icon={filter === 'pending' ? CheckCircle2 : Flag} title={filter === 'pending' ? 'Không có báo cáo nào đang chờ' : 'Không có báo cáo phù hợp'} description={filter === 'pending' ? 'Mọi báo cáo đã được xử lý.' : 'Thử đổi từ khoá hoặc bộ lọc.'} />
      ) : (
        <div className="space-y-3">
          {list.items.map((r) => {
            const link = targetLink(r);
            return (
              <article key={r.id} className="card p-4" aria-label={`Báo cáo ${REPORT_TARGET_LABELS[r.targetType]}: ${r.targetName}`}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Pill tone="blue">{REPORT_TARGET_LABELS[r.targetType]}</Pill>
                  <Pill tone="red">{REPORT_REASON_LABELS[r.reason]}</Pill>
                  {STATUS_PILL[r.status]}
                  <span className="text-xs text-slate-400 ml-auto">{timeAgo(r.createdAt)}</span>
                </div>
                <p className="text-slate-800 font-medium break-words">{r.targetName || '(không có tên)'}</p>
                {r.description && <p className="text-sm text-slate-600 mt-1 break-words whitespace-pre-line">“{r.description}”</p>}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    Người báo cáo: <Person person={r.reporter} />
                  </div>
                  {link && (
                    <Link to={link} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                      Xem nội dung <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>

                {r.status === 'pending' ? (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                    {r.targetType !== 'user' && (
                      <button disabled={busy} onClick={() => setDecision({ report: r, status: 'resolved', removeContent: true })} className="btn-danger btn-sm">
                        <Trash2 className="w-3.5 h-3.5" /> Gỡ nội dung
                      </button>
                    )}
                    <button disabled={busy} onClick={() => setDecision({ report: r, status: 'resolved', removeContent: false })} className="btn-secondary btn-sm">
                      <Check className="w-3.5 h-3.5" /> Xác nhận
                    </button>
                    <button disabled={busy} onClick={() => setDecision({ report: r, status: 'dismissed', removeContent: false })} className="btn-secondary btn-sm">
                      <X className="w-3.5 h-3.5" /> Bỏ qua
                    </button>
                    {r.targetType === 'user' && (
                      <Link to="/admin/users" className="btn-secondary btn-sm">
                        Mở trang người dùng để khoá
                      </Link>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-1.5">
                    {r.status === 'resolved' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-slate-400" />}
                    {r.handledBy?.name ?? 'Quản trị viên đã xoá'} · {timeAgo(r.handledAt)}
                    {r.resolutionNote && <span className="text-slate-600"> · “{r.resolutionNote}”</span>}
                  </p>
                )}
              </article>
            );
          })}
          {list.hasMore && (
            <button onClick={() => void list.loadMore()} disabled={list.loadingMore} className="btn-secondary mx-auto block">
              Xem thêm báo cáo
            </button>
          )}
        </div>
      )}

      {decision && text && <ReasonDialog title={text.title} description={text.description} label="Ghi chú (không bắt buộc)" submitLabel={text.submit} danger={decision.removeContent} busy={busy} onSubmit={submit} onClose={() => setDecision(null)} />}
    </div>
  );
};

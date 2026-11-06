import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Users, Wifi, Ban, ShieldCheck, UserPlus, FileText, Clapperboard, MessageSquare, UsersRound, Flag, LucideIcon } from 'lucide-react';
import { api } from '../../utils/api';
import { AdminReport, AdminStats, AuditLog } from '../../types';
import { timeAgo } from '../../utils/format';
import { actionLabel, auditDetails, REPORT_REASON_LABELS, REPORT_TARGET_LABELS } from '../../utils/adminLabels';
import { AdminSection, ErrorState, MutedText, PageHeader, PageLoading } from '../../components/ui';
import { Pill } from '../../components/admin/AdminUi';

// Trang tổng quan khu quản trị (/admin): số liệu toàn hệ thống, báo cáo đang chờ xử lý và hoạt động quản trị gần đây.

const STAT_CARDS: { key: keyof AdminStats; label: string; icon: LucideIcon; to: string; tone: string }[] = [
  { key: 'users', label: 'Người dùng', icon: Users, to: '/admin/users', tone: 'bg-blue-50 text-blue-600' },
  { key: 'online', label: 'Đang online', icon: Wifi, to: '/admin/users', tone: 'bg-emerald-50 text-emerald-600' },
  { key: 'newToday', label: 'Mới hôm nay', icon: UserPlus, to: '/admin/users', tone: 'bg-violet-50 text-violet-600' },
  { key: 'banned', label: 'Bị khoá', icon: Ban, to: '/admin/users', tone: 'bg-rose-50 text-rose-600' },
  { key: 'admins', label: 'Quản trị viên', icon: ShieldCheck, to: '/admin/users', tone: 'bg-indigo-50 text-indigo-600' },
  { key: 'posts', label: 'Bài viết', icon: FileText, to: '/admin/posts', tone: 'bg-sky-50 text-sky-600' },
  { key: 'reels', label: 'Reels', icon: Clapperboard, to: '/admin/posts', tone: 'bg-pink-50 text-pink-600' },
  { key: 'comments', label: 'Bình luận', icon: MessageSquare, to: '/admin/comments', tone: 'bg-amber-50 text-amber-600' },
  { key: 'groups', label: 'Nhóm', icon: UsersRound, to: '/admin/groups', tone: 'bg-teal-50 text-teal-600' },
  { key: 'pages', label: 'Trang', icon: Flag, to: '/admin/groups', tone: 'bg-orange-50 text-orange-600' },
];

export const AdminDashboardPage: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setFailed(false);
    Promise.all([
      api.get<{ stats: AdminStats }>('/admin/stats'),
      api.get<{ reports: AdminReport[] }>('/admin/reports?status=pending&limit=5'),
      api.get<{ logs: AuditLog[] }>('/admin/audit-logs?limit=6'),
    ])
      .then(([s, r, l]) => {
        setStats(s.stats);
        setReports(r.reports);
        setLogs(l.logs);
      })
      .catch(() => setFailed(true));
  };
  useEffect(load, []);

  return (
    <div>
      <PageHeader icon={LayoutDashboard} title="Tổng quan hệ thống" subtitle="Số liệu và việc cần xử lý" />
      {failed ? (
        <ErrorState onRetry={load} />
      ) : !stats ? (
        <PageLoading />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
            {STAT_CARDS.map(({ key, label, icon: Icon, to, tone }) => (
              <Link key={key} to={to} className="card p-4 flex items-center gap-3 hover:border-blue-300 transition-colors">
                <div className={`size-11 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-slate-900 leading-tight" data-testid={`stat-${key}`}>
                    {stats[key].toLocaleString('vi-VN')}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{label}</div>
                </div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <AdminSection icon={Flag} title="Báo cáo chờ xử lý" count={stats.pendingReports}>
              {reports.length === 0 ? (
                <MutedText>Không có báo cáo nào đang chờ. 🎉</MutedText>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {reports.map((r) => (
                    <li key={r.id} className="py-2.5 flex items-start gap-3 text-sm">
                      <Pill tone="amber">{REPORT_TARGET_LABELS[r.targetType]}</Pill>
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-800 truncate">{r.targetName || '(không có tên)'}</p>
                        <p className="text-xs text-slate-400">
                          {REPORT_REASON_LABELS[r.reason]} · {r.reporter?.name ?? 'Tài khoản đã xoá'} · {timeAgo(r.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/admin/reports" className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:underline">
                Xem tất cả báo cáo
              </Link>
            </AdminSection>

            <AdminSection icon={LayoutDashboard} title="Hoạt động quản trị gần đây">
              {logs.length === 0 ? (
                <MutedText>Chưa có hoạt động nào.</MutedText>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {logs.map((l) => (
                    <li key={l.id} className="py-2.5 text-sm">
                      <p className="text-slate-800">
                        <b>{l.admin?.name ?? 'Quản trị viên đã xoá'}</b> · {actionLabel(l.action)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {auditDetails(l.details) && `${auditDetails(l.details)} · `}
                        {timeAgo(l.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/admin/audit" className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:underline">
                Xem toàn bộ nhật ký
              </Link>
            </AdminSection>
          </div>
        </>
      )}
    </div>
  );
};

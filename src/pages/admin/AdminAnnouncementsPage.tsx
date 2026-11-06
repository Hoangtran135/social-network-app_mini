import React, { useEffect, useState } from 'react';
import { Megaphone, Send, Trash2 } from 'lucide-react';
import { api } from '../../utils/api';
import { Announcement } from '../../types';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useManageAction } from '../../hooks/useManageAction';
import { timeAgo } from '../../utils/format';
import { ANNOUNCEMENT_TYPE_LABELS } from '../../utils/adminLabels';
import { AdminSection, EmptyState, ErrorState, FormField, ListSkeleton, PageHeader } from '../../components/ui';
import { Pill } from '../../components/admin/AdminUi';

// Thông báo hệ thống (/admin/announcements): soạn và gửi một thông báo tới MỌI tài khoản đang hoạt động (hiện trong chuông thông báo + toast realtime).

const TYPE_TONE = { info: 'blue', warning: 'amber', alert: 'red' } as const;

export const AdminAnnouncementsPage: React.FC = () => {
  const confirm = useConfirm();
  const [items, setItems] = useState<Announcement[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<Announcement['type']>('info');

  const reload = async () => {
    try {
      setItems((await api.get<{ announcements: Announcement[] }>('/admin/announcements?limit=50')).announcements);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  const { act, busy } = useManageAction(reload);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await confirm('Gửi thông báo này tới TẤT CẢ người dùng? Không thể thu hồi các thông báo đã gửi.'))) return;
    if (await act(() => api.post('/admin/announcements', { title: title.trim(), message: message.trim(), type }), 'Đã gửi thông báo tới mọi người dùng')) {
      setTitle('');
      setMessage('');
      setType('info');
    }
  };

  const remove = async (item: Announcement) => {
    if (await confirm('Xoá bản ghi thông báo này? Các thông báo đã gửi tới người dùng vẫn được giữ nguyên.')) await act(() => api.delete(`/admin/announcements/${item.id}`), 'Đã xoá');
  };

  return (
    <div>
      <PageHeader icon={Megaphone} title="Thông báo hệ thống" subtitle="Gửi tin tới toàn bộ người dùng" />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-start">
        <AdminSection icon={Send} title="Soạn thông báo">
          <form onSubmit={send} className="space-y-3">
            <FormField label="Tiêu đề" required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vd: Bảo trì hệ thống" />
            <div>
              <label htmlFor="ann-type" className="field-label block mb-1.5">
                Mức độ
              </label>
              <select id="ann-type" value={type} onChange={(e) => setType(e.target.value as Announcement['type'])} className="input">
                {Object.entries(ANNOUNCEMENT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ann-message" className="field-label block mb-1.5">
                Nội dung
              </label>
              <textarea id="ann-message" required rows={5} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Nội dung gửi tới người dùng..." className="input resize-none" />
              <p className="text-[11px] text-slate-400 text-right mt-1">{message.length}/1000</p>
            </div>
            <button type="submit" disabled={busy || !title.trim() || !message.trim()} className="btn-primary w-full">
              <Send className="w-4 h-4" /> Gửi tới tất cả
            </button>
          </form>
        </AdminSection>

        <div>
          <h2 className="section-title mb-3">Đã gửi gần đây</h2>
          {status === 'loading' ? (
            <ListSkeleton count={3} />
          ) : status === 'error' ? (
            <ErrorState onRetry={() => void reload()} />
          ) : items.length === 0 ? (
            <EmptyState icon={Megaphone} title="Chưa có thông báo nào" description="Các thông báo bạn gửi sẽ hiện ở đây." />
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <article key={item.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Pill tone={TYPE_TONE[item.type]}>{ANNOUNCEMENT_TYPE_LABELS[item.type]}</Pill>
                        <span className="text-xs text-slate-400">
                          {item.createdBy?.name ?? 'Quản trị viên đã xoá'} · {timeAgo(item.createdAt)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-900 break-words">{item.title}</h3>
                      <p className="text-sm text-slate-600 mt-1 whitespace-pre-line break-words">{item.message}</p>
                    </div>
                    <button disabled={busy} onClick={() => remove(item)} aria-label={`Xoá thông báo ${item.title}`} className="icon-btn !size-9 text-rose-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

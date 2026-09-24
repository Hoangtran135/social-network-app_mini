import React, { useState } from 'react';
import { Bell, Sparkles } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { useOpenNotification } from '../hooks/useOpenNotification';
import { NotificationItem } from '../types';
import { timeAgo } from '../utils/format';
import { PageHeader, EmptyState, TabButton } from '../components/ui';

// Trang thông báo (/notifications): lọc theo loại, đánh dấu tất cả đã đọc, tải thêm.
// Bấm vào một thông báo để mở bài viết / trang cá nhân liên quan.

const FILTERS: { key: string; label: string; match: (n: NotificationItem) => boolean }[] = [
  { key: 'all', label: 'Tất cả', match: () => true },
  { key: 'unread', label: 'Chưa đọc', match: (n) => !n.isRead },
  { key: 'interactions', label: 'Tương tác bài viết', match: (n) => n.type === 'like' || n.type === 'comment' },
  { key: 'friends', label: 'Bạn bè', match: (n) => n.type === 'friend_request' || n.type === 'friend_accept' },
];

const TYPE_ICONS: Record<NotificationItem['type'], string> = { like: '❤️', comment: '💬', friend_request: '👋', friend_accept: '🤝', system: '🔔' };

export const NotificationsPage: React.FC = () => {
  const { notifications, markAllNotificationsAsRead, hasMoreNotifications, loadMoreNotifications } = useSocial();
  const openNotification = useOpenNotification();
  const [filter, setFilter] = useState(FILTERS[0]);
  const unread = notifications.filter((n) => !n.isRead).length;
  const shown = notifications.filter(filter.match);

  return (
    <div className="max-w-3xl">
      <PageHeader icon={Bell} title="Thông báo" subtitle={unread > 0 ? `Bạn có ${unread} thông báo chưa đọc` : 'Tất cả thông báo đã được đọc'}>
        {unread > 0 && (
          <button onClick={markAllNotificationsAsRead} className="btn-secondary">
            Đánh dấu tất cả đã đọc
          </button>
        )}
      </PageHeader>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {FILTERS.map((f) => (
          <TabButton key={f.key} active={filter.key === f.key} onClick={() => setFilter(f)}>
            {f.label}
          </TabButton>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={Sparkles} title="Không có thông báo nào" />
      ) : (
        <div className="card rounded-3xl overflow-hidden divide-y divide-slate-100">
          {shown.map((n) => (
            <div key={n.id} onClick={() => openNotification(n)} className={`p-4 flex items-start gap-3.5 hover:bg-slate-50 cursor-pointer ${n.isRead ? '' : 'bg-blue-50/40'}`}>
              <div className="relative">
                <img src={n.actor.avatar} alt="" className="w-12 h-12 rounded-2xl object-cover" />
                <span className="absolute -bottom-1 -right-1 text-sm">{TYPE_ICONS[n.type]}</span>
              </div>
              <div className="flex-1 text-sm">
                <p className="text-slate-800">
                  <b>{n.actor.name}</b> {n.content}
                </p>
                <span className="text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
              </div>
              {!n.isRead && <span className="w-2.5 h-2.5 rounded-full bg-blue-600 mt-2" />}
            </div>
          ))}
        </div>
      )}

      {hasMoreNotifications && shown.length > 0 && (
        <button onClick={loadMoreNotifications} className="btn-secondary mx-auto mt-4 block">
          Xem thêm thông báo
        </button>
      )}
    </div>
  );
};

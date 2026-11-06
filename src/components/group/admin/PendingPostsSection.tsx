import React, { useEffect, useState } from 'react';
import { FileClock } from 'lucide-react';
import { Group } from '../../../types';
import { useSocial } from '../../../context/SocialContext';
import { timeAgo } from '../../../utils/format';
import { AdminSection, Avatar, MutedText } from '../../ui';

// Mục "Bài viết chờ duyệt" của tab Quản trị nhóm: xem tóm tắt từng bài và Duyệt / Từ chối.

export const PendingPosts: React.FC<{ group: Group; reload: () => void }> = ({ group, reload }) => {
  const { posts, loadGroupPosts, moderateGroupPost } = useSocial();
  const pending = posts.filter((p) => p.groupId === group.id && p.groupStatus === 'pending');
  useEffect(() => {
    loadGroupPosts(group.id, 'pending');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);
  const [busyId, setBusyId] = useState<string | null>(null); // bài đang được xử lý (khoá nút để không bấm đúp)
  const moderate = async (postId: string, action: 'approve' | 'reject') => {
    setBusyId(postId);
    await moderateGroupPost(group.id, postId, action);
    setBusyId(null);
    reload();
  };

  return (
    <AdminSection id="group-pending-posts" icon={FileClock} title="Bài viết chờ duyệt" count={pending.length}>
      {pending.length === 0 && <MutedText>Không có bài viết nào đang chờ duyệt.</MutedText>}
      <ul className="space-y-3">
        {pending.map((p) => (
          <li key={p.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 text-sm">
              <Avatar src={p.author.avatar} size="w-8 h-8" />
              <span className="font-semibold text-slate-800">{p.author.name}</span>
              <span className="text-xs text-slate-400">{timeAgo(p.createdAt)}</span>
            </div>
            {p.content && <p className="mt-2 text-sm text-slate-800 whitespace-pre-line break-words line-clamp-6">{p.content}</p>}
            {!!p.images?.length && <p className="mt-1 text-xs text-slate-500">📷 {p.images.length} ảnh</p>}
            {p.video && <p className="mt-1 text-xs text-slate-500">🎬 Có video</p>}
            <div className="mt-3 flex gap-2">
              <button disabled={busyId === p.id} onClick={() => moderate(p.id, 'approve')} className="btn-primary btn-sm">
                Duyệt
              </button>
              <button disabled={busyId === p.id} onClick={() => moderate(p.id, 'reject')} className="btn-secondary btn-sm">
                Từ chối
              </button>
            </div>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
};

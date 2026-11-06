import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { api } from '../../../utils/api';
import { Group, GroupMember } from '../../../types';
import { useManageAction } from '../../../hooks/useManageAction';
import { timeAgo } from '../../../utils/format';
import { AdminSection, Avatar, MutedText } from '../../ui';

// Mục "Yêu cầu tham gia" của tab Quản trị nhóm: danh sách người xin vào (kèm câu trả lời), Chấp nhận / Từ chối.

export const JoinRequests: React.FC<{ group: Group; reload: () => void }> = ({ group, reload }) => {
  const [requests, setRequests] = useState<GroupMember[] | null>(null);
  const load = () =>
    api
      .get<{ members: GroupMember[] }>(`/groups/${group.id}/members?status=pending&limit=100`)
      .then((d) => setRequests(d.members))
      .catch(() => setRequests([]));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, group.pendingMembersCount]);
  const { act, busy } = useManageAction(() => {
    load();
    reload();
  });

  return (
    <AdminSection id="group-join-requests" icon={UserPlus} title="Yêu cầu tham gia" count={requests?.length ?? group.pendingMembersCount ?? 0}>
      {requests?.length === 0 && <MutedText>Không có yêu cầu nào đang chờ.</MutedText>}
      <ul className="divide-y divide-slate-100">
        {requests?.map((r) => (
          <li key={r.user.id} className="py-3">
            <div className="flex items-center gap-3">
              <Link to={`/profile/${r.user.id}`}>
                <Avatar src={r.user.avatar} size="w-10 h-10" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/profile/${r.user.id}`} className="block text-sm font-semibold text-slate-900 truncate hover:text-blue-600">
                  {r.user.name}
                </Link>
                <span className="text-xs text-slate-400">{timeAgo(r.joinedAt)}</span>
              </div>
              <button disabled={busy} onClick={() => act(() => api.post(`/groups/${group.id}/members/${r.user.id}/approve`), `Đã chấp nhận ${r.user.name} vào nhóm.`)} className="btn-primary btn-sm">
                Chấp nhận
              </button>
              <button disabled={busy} onClick={() => act(() => api.post(`/groups/${group.id}/members/${r.user.id}/reject`), `Đã từ chối ${r.user.name}.`)} className="btn-secondary btn-sm">
                Từ chối
              </button>
            </div>
            {!!r.answers?.length && (
              <dl className="mt-2 pl-[3.25rem] space-y-1 text-xs">
                {r.answers.map((a, i) => (
                  <div key={i}>
                    <dt className="text-slate-500">{a.question}</dt>
                    <dd className="text-slate-800 font-medium break-words">{a.answer}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </AdminSection>
  );
};

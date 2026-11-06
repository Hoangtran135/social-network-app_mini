import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, ShieldCheck, ShieldOff, Crown, UserMinus } from 'lucide-react';
import { api } from '../../utils/api';
import { Group, GroupMember } from '../../types';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useManageAction } from '../../hooks/useManageAction';
import { useAuth } from '../../context/AuthContext';
import { Avatar, EmptyState, ErrorState, ListSkeleton } from '../ui';
import { RoleBadge } from './groupUi';

// Tab "Thành viên" của trang nhóm: danh sách thành viên (chủ nhóm → quản trị viên → thành viên) và menu quản lý.
// Chủ nhóm: bổ nhiệm / gỡ quản trị viên, chuyển quyền chủ nhóm, xoá thành viên. Quản trị viên: chỉ xoá thành viên thường.

const MenuButton: React.FC<{ icon: typeof Crown; label: string; onClick: () => void; danger?: boolean }> = ({ icon: Icon, label, onClick, danger }) => (
  <button onClick={onClick} className={`w-full px-3.5 py-2.5 text-left flex items-center gap-2.5 hover:bg-slate-50 whitespace-nowrap ${danger ? 'text-rose-600' : 'text-slate-700'}`}>
    <Icon className="w-4 h-4" /> {label}
  </button>
);

const MemberRow: React.FC<{ group: Group; member: GroupMember; reload: () => void }> = ({ group, member, reload }) => {
  const { currentUser } = useAuth();
  const confirm = useConfirm();
  const { act, busy } = useManageAction(reload);
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const { user, role } = member;

  const isMe = user.id === currentUser?.id;
  const iAmOwner = group.myRole === 'owner';
  // Ai được quản lý ai: chủ nhóm quản lý mọi người trừ chính mình; quản trị viên chỉ quản lý thành viên thường
  const canManage = !isMe && role !== 'owner' && (iAmOwner || (group.myRole === 'admin' && role === 'member'));
  const base = `/groups/${group.id}/members/${user.id}`;
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <li className="flex items-center gap-3 p-3">
      <Link to={`/profile/${user.id}`} className="shrink-0">
        <Avatar src={user.avatar} size="w-11 h-11" online={user.isOnline} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/profile/${user.id}`} className="block text-sm font-semibold text-slate-900 hover:text-blue-600 truncate">
          {user.name}
          {isMe && <span className="font-normal text-slate-400"> (bạn)</span>}
        </Link>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="truncate">@{user.username}</span>
          <RoleBadge role={role} />
        </div>
      </div>
      {canManage && (
        <div className="relative" ref={open ? ref : undefined}>
          <button onClick={() => setOpen(!open)} disabled={busy} aria-label={`Quản lý ${user.name}`} aria-expanded={open} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {open && (
            <div className="animate-pop absolute right-0 mt-1 w-60 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-30 text-xs font-semibold">
              {iAmOwner && role === 'member' && (
                <MenuButton icon={ShieldCheck} label="Bổ nhiệm làm quản trị viên" onClick={run(() => act(() => api.patch(base, { role: 'admin' }), `Đã bổ nhiệm ${user.name} làm quản trị viên.`))} />
              )}
              {iAmOwner && role === 'admin' && (
                <MenuButton icon={ShieldOff} label="Gỡ quyền quản trị viên" onClick={run(() => act(() => api.patch(base, { role: 'member' }), `Đã gỡ quyền quản trị viên của ${user.name}.`))} />
              )}
              {iAmOwner && (
                <MenuButton
                  icon={Crown}
                  label="Chuyển quyền chủ nhóm"
                  onClick={run(async () => {
                    if (await confirm(`Chuyển quyền chủ nhóm cho ${user.name}? Bạn sẽ trở thành quản trị viên.`)) act(() => api.post(`/groups/${group.id}/transfer`, { userId: user.id }), `Đã chuyển quyền chủ nhóm cho ${user.name}.`);
                  })}
                />
              )}
              <MenuButton
                icon={UserMinus}
                label="Xoá khỏi nhóm"
                danger
                onClick={run(async () => {
                  if (await confirm(`Xoá ${user.name} khỏi nhóm?`)) act(() => api.delete(base), `Đã xoá ${user.name} khỏi nhóm.`);
                })}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
};

export const GroupMembersTab: React.FC<{ group: Group; reload: () => void }> = ({ group, reload }) => {
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const locked = group.privacy === 'private' && group.myStatus !== 'active';

  const load = () => {
    setFailed(false);
    api
      .get<{ members: GroupMember[] }>(`/groups/${group.id}/members?limit=200`)
      .then((d) => setMembers(d.members))
      .catch(() => setFailed(true));
  };
  // Tải lại khi số thành viên đổi (có người vào / rời / bị xoá) hoặc vai trò của mình đổi
  useEffect(() => {
    if (!locked) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, group.membersCount, group.myRole, locked]);

  if (locked) return <EmptyState icon={ShieldCheck} title="Danh sách thành viên chỉ dành cho thành viên" description="Hãy tham gia nhóm để xem những ai đang ở đây." />;
  if (failed) return <ErrorState title="Không tải được danh sách thành viên" onRetry={load} />;
  if (!members) return <ListSkeleton count={4} />;

  return (
    <ul className="card divide-y divide-slate-100" aria-label="Danh sách thành viên">
      {members.map((m) => (
        <MemberRow
          key={m.user.id}
          group={group}
          member={m}
          reload={() => {
            load();
            reload();
          }}
        />
      ))}
    </ul>
  );
};

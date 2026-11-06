import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, Users, FileText, Info, ShieldCheck, Clock, Flag } from 'lucide-react';
import { ReportButton } from '../components/SystemReport';
import { api, ApiError } from '../utils/api';
import { Group } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { useManageAction } from '../hooks/useManageAction';
import { PostCard } from '../components/post/PostCard';
import { PostFormModal } from '../components/post/PostFormModal';
import { CreatePostBox } from '../components/post/CreatePostBox';
import { GroupMembersTab } from '../components/group/GroupMembersTab';
import { GroupAdminTab } from '../components/group/GroupAdminTab';
import { JoinGroupModal } from '../components/group/JoinGroupModal';
import { GroupPrivacyBadge, RoleBadge } from '../components/group/groupUi';
import { CountBadge, EmptyState, ErrorState, PageLoading, PostSkeleton, TabButton, SquareAvatar } from '../components/ui';

// Trang một nhóm (/groups/:id): ảnh bìa, tên, nút Tham gia / Rời nhóm, và các tab
// Bài viết (đăng bài, bài chờ duyệt của mình) · Thành viên · Giới thiệu (mô tả + nội quy) · Quản trị (chỉ chủ nhóm / quản trị viên).
// Nhóm riêng tư: người chưa tham gia chỉ thấy thông tin cơ bản, không xem được bài viết và thành viên.

type Tab = 'posts' | 'members' | 'about' | 'admin';

const PostsTab: React.FC<{ group: Group }> = ({ group }) => {
  const { currentUser } = useAuth();
  const { posts, loadGroupPosts } = useSocial();
  const [loaded, setLoaded] = useState<'loading' | 'ready' | 'error'>('loading');
  const [composing, setComposing] = useState(false);
  const active = group.myStatus === 'active';
  const locked = group.privacy === 'private' && !active;

  const load = useCallback(async () => {
    setLoaded('loading');
    const ok = await loadGroupPosts(group.id, 'approved');
    if (ok && active) await loadGroupPosts(group.id, 'pending'); // bài chờ duyệt của chính mình
    setLoaded(ok ? 'ready' : 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, active]);
  useEffect(() => {
    if (!locked) load();
  }, [locked, load]);

  if (locked)
    return <EmptyState icon={Lock} title="Đây là nhóm riêng tư" description="Hãy tham gia nhóm để xem bài viết và trò chuyện cùng các thành viên." />;

  const inGroup = posts.filter((p) => p.groupId === group.id);
  const byNewest = (a: { createdAt: string }, b: { createdAt: string }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const mine = inGroup.filter((p) => p.groupStatus === 'pending' && p.author.id === currentUser?.id).sort(byNewest);
  const approved = inGroup.filter((p) => p.groupStatus !== 'pending').sort(byNewest);

  return (
    <div>
      {active && (
        <>
          <CreatePostBox onClick={() => setComposing(true)} placeholder={`Viết gì đó cho nhóm ${group.name}...`} />
          {group.postApproval && group.myRole === 'member' && (
            <p className="-mt-2 mb-5 flex items-center gap-2 text-xs text-slate-500">
              <Clock className="w-3.5 h-3.5" /> Bài viết của bạn sẽ hiện sau khi quản trị viên duyệt.
            </p>
          )}
        </>
      )}
      {composing && <PostFormModal groupId={group.id} groupName={group.name} onClose={() => setComposing(false)} />}

      {mine.length > 0 && (
        <div className="mb-5">
          <h3 className="field-label mb-2">Bài viết của bạn đang chờ duyệt</h3>
          {mine.map((post) => (
            <PostCard key={post.id} post={post} groupRole={group.myRole} />
          ))}
        </div>
      )}

      {loaded === 'loading' && approved.length === 0 && <PostSkeleton count={2} />}
      {loaded === 'error' && <ErrorState title="Không tải được bài viết của nhóm" onRetry={load} />}
      {loaded === 'ready' && approved.length === 0 && mine.length === 0 && (
        <EmptyState icon={FileText} title="Nhóm chưa có bài viết nào" description={active ? 'Hãy là người đầu tiên chia sẻ điều gì đó với nhóm!' : 'Tham gia nhóm để đăng bài đầu tiên.'} />
      )}
      {approved.map((post) => (
        <PostCard key={post.id} post={post} groupRole={group.myRole} />
      ))}
    </div>
  );
};

const AboutTab: React.FC<{ group: Group }> = ({ group }) => (
  <div className="card p-5 sm:p-6 space-y-5">
    <section>
      <h3 className="section-title mb-1">Giới thiệu</h3>
      <p className="text-sm text-slate-700 whitespace-pre-line break-words">{group.description || 'Nhóm chưa có mô tả.'}</p>
    </section>
    <section>
      <h3 className="section-title mb-1">Quyền riêng tư</h3>
      <p className="text-sm text-slate-700">
        {group.privacy === 'public' ? 'Công khai — ai cũng xem được bài viết và tham gia ngay.' : 'Riêng tư — chỉ thành viên xem được bài viết; người mới phải được quản trị viên duyệt.'}
      </p>
    </section>
    <section>
      <h3 className="section-title mb-2">Nội quy nhóm</h3>
      {group.rules.length === 0 ? (
        <p className="text-sm text-slate-400">Nhóm chưa đặt nội quy.</p>
      ) : (
        <ol className="space-y-2 list-decimal pl-5 text-sm text-slate-700">
          {group.rules.map((rule, i) => (
            <li key={i} className="break-words">
              {rule}
            </li>
          ))}
        </ol>
      )}
    </section>
    <p className="text-xs text-slate-400">Tạo ngày {new Date(group.createdAt).toLocaleDateString('vi-VN')}</p>
  </div>
);

export const GroupPage: React.FC = () => {
  const { id = '' } = useParams();
  const confirm = useConfirm();
  const [group, setGroup] = useState<Group | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');
  const [tab, setTab] = useState<Tab>('posts');
  const [joining, setJoining] = useState(false); // hộp thoại trả lời câu hỏi

  const load = useCallback(async () => {
    try {
      setGroup((await api.get<{ group: Group }>(`/groups/${id}`)).group);
      setStatus('ready');
    } catch (err) {
      setErrorText(err instanceof ApiError ? err.message : '');
      setStatus('error');
    }
  }, [id]);
  useEffect(() => {
    setStatus('loading');
    setTab('posts');
    load();
  }, [load]);

  const { act, busy } = useManageAction(load);

  if (status === 'loading') return <PageLoading text="Đang tải nhóm..." />;
  if (status === 'error' || !group) return <ErrorState title={errorText || 'Không tải được nhóm'} description="Nhóm có thể đã bị xoá hoặc bạn không có quyền xem." onRetry={load} />;

  const isAdmin = group.myRole === 'owner' || group.myRole === 'admin';
  const adminCount = (group.pendingMembersCount ?? 0) + (group.pendingPostsCount ?? 0) + (group.openReportsCount ?? 0);

  const join = (answers: string[] = []) =>
    act(() => api.post(`/groups/${group.id}/join`, { answers }), group.privacy === 'public' ? `Bạn đã tham gia nhóm ${group.name}!` : 'Đã gửi yêu cầu tham gia, vui lòng chờ quản trị viên duyệt.');
  const leave = async () => {
    const pending = group.myStatus === 'pending';
    if (!pending && !(await confirm(`Rời nhóm "${group.name}"?`))) return;
    const ok = await act(() => api.delete(`/groups/${group.id}/join`), pending ? 'Đã huỷ yêu cầu tham gia.' : `Bạn đã rời nhóm ${group.name}.`);
    if (ok) setTab('posts');
  };
  const onJoinClick = () => (group.privacy === 'private' && group.joinQuestions.length > 0 ? setJoining(true) : join());

  return (
    <div className="page-wide">
      <div className="card overflow-hidden mb-5">
        <div className="h-36 sm:h-52 bg-gradient-to-r from-blue-600 to-violet-600">{group.cover && <img src={group.cover} alt="" className="w-full h-full object-cover" />}</div>
        <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <SquareAvatar item={group} size="size-20 sm:size-24 -mt-12 sm:-mt-14 border-4 border-white shadow-md" className="text-3xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 break-words">{group.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <GroupPrivacyBadge privacy={group.privacy} />
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Users className="w-3.5 h-3.5" /> {group.membersCount} thành viên
              </span>
              <RoleBadge role={group.myRole} />
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {group.myRole !== 'owner' && (
              <ReportButton targetType="group" targetId={group.id} label="Báo cáo nhóm" className="icon-btn">
                <Flag className="w-4 h-4" />
              </ReportButton>
            )}
            {group.myStatus === null && (
              <button onClick={onJoinClick} disabled={busy} className="btn-primary btn-stable">
                {group.privacy === 'public' ? 'Tham gia nhóm' : 'Xin tham gia'}
              </button>
            )}
            {group.myStatus === 'pending' && (
              <button onClick={leave} disabled={busy} className="btn-secondary btn-stable">
                Huỷ yêu cầu
              </button>
            )}
            {group.myStatus === 'active' && group.myRole !== 'owner' && (
              <button onClick={leave} disabled={busy} className="btn-secondary btn-stable">
                Rời nhóm
              </button>
            )}
          </div>
        </div>
        {group.myStatus === 'pending' && <p className="px-4 sm:px-6 pb-4 -mt-1 text-xs text-amber-600 font-semibold">Yêu cầu của bạn đang chờ quản trị viên duyệt.</p>}
      </div>

      <div className="card p-2 mb-5">
        <div className="flex gap-1 overflow-x-auto no-scrollbar scroll-fade-x" role="group" aria-label="Các mục của nhóm">
          <TabButton icon={FileText} active={tab === 'posts'} onClick={() => setTab('posts')}>
            Bài viết
          </TabButton>
          <TabButton icon={Users} active={tab === 'members'} onClick={() => setTab('members')}>
            Thành viên
          </TabButton>
          <TabButton icon={Info} active={tab === 'about'} onClick={() => setTab('about')}>
            Giới thiệu
          </TabButton>
          {isAdmin && (
            <TabButton icon={ShieldCheck} active={tab === 'admin'} onClick={() => setTab('admin')}>
              Quản trị <CountBadge count={adminCount} />
            </TabButton>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        {tab === 'posts' && <PostsTab group={group} />}
        {tab === 'members' && <GroupMembersTab group={group} reload={load} />}
        {tab === 'about' && <AboutTab group={group} />}
        {tab === 'admin' && isAdmin && <GroupAdminTab group={group} reload={load} />}
      </div>

      {joining && (
        <JoinGroupModal
          group={group}
          onClose={() => setJoining(false)}
          onSubmit={(answers) => {
            setJoining(false);
            join(answers);
          }}
        />
      )}
    </div>
  );
};

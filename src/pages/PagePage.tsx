import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Info, Settings, Globe, MapPin, Tag, Users, Flag } from 'lucide-react';
import { ReportButton } from '../components/SystemReport';
import { api, ApiError } from '../utils/api';
import { Page } from '../types';
import { useSocial } from '../context/SocialContext';
import { useManageAction } from '../hooks/useManageAction';
import { PostCard } from '../components/post/PostCard';
import { PostFormModal } from '../components/post/PostFormModal';
import { CreatePostBox } from '../components/post/CreatePostBox';
import { PageAdminTab } from '../components/page/PageAdminTab';
import { categoryLabel } from '../components/page/pageUi';
import { EmptyState, ErrorState, PageLoading, PostSkeleton, TabButton, SquareAvatar } from '../components/ui';

// Trang một Trang / fanpage (/pages/:id): ảnh bìa, tên, danh mục, số người theo dõi, nút Theo dõi,
// và các tab Bài viết (chủ trang / quản trị viên đăng bài với tư cách trang) · Giới thiệu · Quản trị (chỉ quản trị viên).

type Tab = 'posts' | 'about' | 'admin';

const PostsTab: React.FC<{ page: Page }> = ({ page }) => {
  const { posts, loadPagePosts } = useSocial();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [composing, setComposing] = useState(false);
  const isAdmin = !!page.myRole;

  const load = useCallback(async () => {
    setStatus('loading');
    setStatus((await loadPagePosts(page.id)) ? 'ready' : 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);
  useEffect(() => {
    load();
  }, [load]);

  const mine = posts.filter((p) => p.pageId === page.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div>
      {isAdmin && <CreatePostBox onClick={() => setComposing(true)} placeholder={`Đăng gì đó với tư cách ${page.name}...`} />}
      {composing && <PostFormModal pageId={page.id} pageName={page.name} onClose={() => setComposing(false)} />}
      {status === 'loading' && mine.length === 0 && <PostSkeleton count={2} />}
      {status === 'error' && <ErrorState title="Không tải được bài viết của trang" onRetry={load} />}
      {status === 'ready' && mine.length === 0 && <EmptyState icon={FileText} title="Trang chưa có bài viết nào" description={isAdmin ? 'Hãy đăng bài đầu tiên để người theo dõi biết đến trang.' : undefined} />}
      {mine.map((post) => (
        <PostCard key={post.id} post={post} pageAdmin={isAdmin} />
      ))}
    </div>
  );
};

const AboutTab: React.FC<{ page: Page }> = ({ page }) => {
  const rows: [typeof Tag, string, React.ReactNode][] = [
    [Tag, 'Danh mục', categoryLabel(page.category)],
    [Users, 'Người theo dõi', `${page.followersCount} người`],
    ...(page.website ? ([[Globe, 'Website', <a key="w" href={page.website} target="_blank" rel="noreferrer noopener" className="text-blue-600 hover:underline break-all">{page.website}</a>]] as [typeof Tag, string, React.ReactNode][]) : []),
    ...(page.address ? ([[MapPin, 'Địa chỉ', page.address]] as [typeof Tag, string, React.ReactNode][]) : []),
  ];
  return (
    <div className="card p-5 sm:p-6 space-y-5">
      <section>
        <h3 className="section-title mb-1">Giới thiệu</h3>
        <p className="text-sm text-slate-700 whitespace-pre-line break-words">{page.description || 'Trang chưa có phần giới thiệu.'}</p>
      </section>
      <dl className="space-y-3 text-sm">
        {rows.map(([Icon, label, value]) => (
          <div key={label} className="flex items-start gap-3">
            <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <dt className="sr-only">{label}</dt>
            <dd className="text-slate-700 min-w-0">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-slate-400">Tạo ngày {new Date(page.createdAt).toLocaleDateString('vi-VN')}</p>
    </div>
  );
};

export const PagePage: React.FC = () => {
  const { id = '' } = useParams();
  const [page, setPage] = useState<Page | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');
  const [tab, setTab] = useState<Tab>('posts');

  const load = useCallback(async () => {
    try {
      setPage((await api.get<{ page: Page }>(`/pages/${id}`)).page);
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

  if (status === 'loading') return <PageLoading text="Đang tải trang..." />;
  if (status === 'error' || !page) return <ErrorState title={errorText || 'Không tải được trang'} description="Trang có thể đã bị xoá." onRetry={load} />;

  const toggleFollow = () =>
    act(() => (page.isFollowing ? api.delete(`/pages/${page.id}/follow`) : api.post(`/pages/${page.id}/follow`)), page.isFollowing ? `Đã bỏ theo dõi ${page.name}.` : `Đã theo dõi ${page.name}.`);

  return (
    <div className="page-wide">
      <div className="card overflow-hidden mb-5">
        <div className="h-36 sm:h-52 bg-gradient-to-r from-rose-500 to-orange-400">{page.cover && <img src={page.cover} alt="" className="w-full h-full object-cover" />}</div>
        <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <SquareAvatar item={page} size="size-20 sm:size-24 -mt-12 sm:-mt-14 border-4 border-white shadow-md" className="text-3xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 break-words">{page.name}</h1>
            <p className="mt-1 text-xs text-slate-500">
              {categoryLabel(page.category)} · <span>{page.followersCount} người theo dõi</span>
              {page.myRole && <span className="ml-2 font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">{page.myRole === 'owner' ? 'Chủ trang' : 'Quản trị viên'}</span>}
            </p>
          </div>
          {page.myRole !== 'owner' && (
            <ReportButton targetType="page" targetId={page.id} label="Báo cáo trang" className="icon-btn">
              <Flag className="w-4 h-4" />
            </ReportButton>
          )}
          <button onClick={toggleFollow} disabled={busy} aria-pressed={page.isFollowing} className={`${page.isFollowing ? 'btn-secondary' : 'btn-primary'} btn-stable shrink-0`}>
            {page.isFollowing ? 'Đang theo dõi' : 'Theo dõi'}
          </button>
        </div>
      </div>

      <div className="card p-2 mb-5">
        <div className="flex gap-1 overflow-x-auto no-scrollbar scroll-fade-x" role="group" aria-label="Các mục của trang">
          <TabButton icon={FileText} active={tab === 'posts'} onClick={() => setTab('posts')}>
            Bài viết
          </TabButton>
          <TabButton icon={Info} active={tab === 'about'} onClick={() => setTab('about')}>
            Giới thiệu
          </TabButton>
          {page.myRole && (
            <TabButton icon={Settings} active={tab === 'admin'} onClick={() => setTab('admin')}>
              Quản trị
            </TabButton>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        {tab === 'posts' && <PostsTab page={page} />}
        {tab === 'about' && <AboutTab page={page} />}
        {tab === 'admin' && page.myRole && <PageAdminTab page={page} reload={load} />}
      </div>
    </div>
  );
};

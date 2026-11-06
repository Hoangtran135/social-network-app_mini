import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Flag, Plus } from 'lucide-react';
import { api } from '../utils/api';
import { Page } from '../types';
import { CreatePageModal } from '../components/page/CreatePageModal';
import { categoryLabel } from '../components/page/pageUi';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, TabButton, SquareAvatar } from '../components/ui';

// Trang danh sách Trang / fanpage (/pages): "Trang của tôi" (mình quản trị), "Đang theo dõi", "Khám phá"; tìm theo tên; tạo trang mới.

type Scope = 'mine' | 'following' | 'discover';

const PageCard: React.FC<{ page: Page }> = ({ page }) => (
  <Link to={`/pages/${page.id}`} className="card w-full overflow-hidden flex flex-col hover:border-blue-300 hover:shadow-md transition">
    <div className="h-20 bg-gradient-to-r from-rose-500 to-orange-400">{page.cover && <img src={page.cover} alt="" loading="lazy" className="w-full h-full object-cover" />}</div>
    <div className="p-4 pt-0 flex-1">
      <SquareAvatar item={page} size="size-14 -mt-7 border-4 border-white shadow" className="text-xl" />
      <h3 className="mt-2 text-sm font-semibold text-slate-900 break-words line-clamp-2">{page.name}</h3>
      <p className="mt-1 text-xs text-slate-500">
        {categoryLabel(page.category)} · {page.followersCount} người theo dõi
      </p>
      {page.description && <p className="mt-2 text-xs text-slate-500 line-clamp-2 break-words">{page.description}</p>}
    </div>
  </Link>
);

export const PagesPage: React.FC = () => {
  const [scope, setScope] = useState<Scope>('discover');
  const [query, setQuery] = useState('');
  const [pages, setPages] = useState<Page[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Gõ xong 250ms mới gọi server; bỏ kết quả của những lần gọi cũ hơn
  useEffect(() => {
    setPages(null);
    setFailed(false);
    let stale = false;
    const timer = setTimeout(
      () => {
        api
          .get<{ pages: Page[] }>(`/pages?scope=${scope}&q=${encodeURIComponent(query.trim())}&limit=60`)
          .then((d) => !stale && setPages(d.pages))
          .catch(() => !stale && setFailed(true));
      },
      query ? 250 : 0
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [scope, query, reloadKey]);

  const emptyTitle = query
    ? `Không tìm thấy trang "${query}"`
    : scope === 'mine'
      ? 'Bạn chưa quản trị trang nào'
      : scope === 'following'
        ? 'Bạn chưa theo dõi trang nào'
        : 'Chưa có trang nào để khám phá';

  return (
    <div className="page-wide">
      <PageHeader icon={Flag} iconColor="bg-rose-50 text-rose-600" title="Trang" subtitle="Theo dõi thương hiệu, cộng đồng và người nổi tiếng">
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Tạo trang
        </button>
      </PageHeader>

      <div className="card p-2 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto no-scrollbar scroll-fade-x">
          <TabButton active={scope === 'discover'} onClick={() => setScope('discover')}>
            Khám phá
          </TabButton>
          <TabButton active={scope === 'following'} onClick={() => setScope('following')}>
            Đang theo dõi
          </TabButton>
          <TabButton active={scope === 'mine'} onClick={() => setScope('mine')}>
            Trang của tôi
          </TabButton>
        </div>
        <div className="relative sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm trang..." aria-label="Tìm trang" className="w-full h-10 pl-10 pr-3 text-sm bg-slate-100 rounded-full focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/30" />
        </div>
      </div>

      {failed && <ErrorState title="Không tải được danh sách trang" onRetry={() => setReloadKey((k) => k + 1)} />}
      {!failed && pages === null && <ListSkeleton count={4} />}
      {pages?.length === 0 && (
        <EmptyState icon={Flag} title={emptyTitle} description={scope === 'mine' && !query ? 'Tạo trang cho thương hiệu, cửa hàng hay cộng đồng của bạn.' : undefined}>
          {scope === 'mine' && !query && (
            <button onClick={() => setCreating(true)} className="btn-primary">
              Tạo trang đầu tiên
            </button>
          )}
        </EmptyState>
      )}
      {!!pages?.length && (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map((p) => (
            <li key={p.id} className="flex">
              <PageCard page={p} />
            </li>
          ))}
        </ul>
      )}

      {creating && <CreatePageModal onClose={() => setCreating(false)} />}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../utils/api';
import { SearchResults } from '../types';
import { GroupResult, PageResult, PersonResult, PostResult } from '../components/search/SearchResultItems';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, TabButton } from '../components/ui';

// Trang kết quả tìm kiếm (/search?q=&tab=): tìm người, nhóm, trang và bài viết cùng lúc; kết quả đã lọc theo quyền xem
// và xếp theo quan hệ (bạn bè, người theo dõi, nhóm / trang của bạn...). Tab "Tất cả" mỗi loại tối đa 5; chọn một loại để xem nhiều hơn.

type Tab = 'all' | 'people' | 'groups' | 'pages' | 'posts';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'people', label: 'Mọi người' },
  { key: 'groups', label: 'Nhóm' },
  { key: 'pages', label: 'Trang' },
  { key: 'posts', label: 'Bài viết' },
];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="card overflow-hidden mb-5">
    <h2 className="px-4 pt-4 pb-1 field-label">{title}</h2>
    <div className="divide-y divide-slate-100">{children}</div>
  </section>
);

export const SearchPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') || '').trim();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'all') as Tab;
  const [results, setResults] = useState<SearchResults | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setResults(null);
    setFailed(false);
    if (!query) return;
    let stale = false;
    api
      .get<SearchResults>(`/search?q=${encodeURIComponent(query)}&type=${tab}`)
      .then((d) => !stale && setResults(d))
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [query, tab, reloadKey]);

  const total = results ? results.people.length + results.groups.length + results.pages.length + results.posts.length : 0;
  const show = (t: Tab) => tab === 'all' || tab === t;

  return (
    <div className="page-narrow">
      <PageHeader icon={Search} title={query ? `Kết quả cho "${query}"` : 'Tìm kiếm'} subtitle="Ưu tiên người, nhóm và trang có liên quan tới bạn bè và những gì bạn quan tâm." />

      <div className="card p-2 mb-5">
        <div className="flex gap-1 overflow-x-auto no-scrollbar scroll-fade-x" role="group" aria-label="Loại kết quả">
          {TABS.map((t) => (
            <TabButton key={t.key} active={tab === t.key} onClick={() => setParams({ q: query, ...(t.key === 'all' ? {} : { tab: t.key }) })}>
              {t.label}
            </TabButton>
          ))}
        </div>
      </div>

      {!query && <EmptyState icon={Search} title="Nhập từ khoá để tìm kiếm" description="Gõ tên người, nhóm, trang hoặc nội dung bài viết vào ô tìm kiếm phía trên." />}
      {query && failed && <ErrorState title="Không tải được kết quả" onRetry={() => setReloadKey((k) => k + 1)} />}
      {query && !failed && !results && <ListSkeleton count={4} />}
      {results && total === 0 && <EmptyState icon={Search} title={`Không tìm thấy kết quả cho "${query}"`} description="Thử từ khoá khác hoặc kiểm tra chính tả." />}

      {results && total > 0 && (
        <>
          {show('people') && results.people.length > 0 && (
            <Section title="Mọi người">
              {results.people.map((r) => (
                <PersonResult key={r.user.id} user={r.user} reasons={r.reasons} />
              ))}
            </Section>
          )}
          {show('groups') && results.groups.length > 0 && (
            <Section title="Nhóm">
              {results.groups.map((r) => (
                <GroupResult key={r.group.id} group={r.group} reasons={r.reasons} />
              ))}
            </Section>
          )}
          {show('pages') && results.pages.length > 0 && (
            <Section title="Trang">
              {results.pages.map((r) => (
                <PageResult key={r.page.id} page={r.page} reasons={r.reasons} />
              ))}
            </Section>
          )}
          {show('posts') && results.posts.length > 0 && (
            <Section title="Bài viết">
              {results.posts.map((r) => (
                <PostResult key={r.post.id} post={r.post} reasons={r.reasons} query={query} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
};

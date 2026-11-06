import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, X, Loader2, SearchX } from 'lucide-react';
import { api } from '../utils/api';
import { SearchResults } from '../types';
import { useClickOutside } from '../hooks/useClickOutside';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { parseTagQuery } from '../utils/hashtag';
import { GroupResult, PageResult, PersonResult, PostResult } from '../components/search/SearchResultItems';

// Ô tìm kiếm trên Navbar: gõ để thấy gợi ý NGƯỜI, NHÓM, TRANG và BÀI VIẾT cùng lúc (gọi GET /api/search), kết quả đã lọc theo quyền xem
// và ưu tiên những gì liên quan tới bạn bè / thứ mình đã theo dõi. Bấm Enter hoặc "Xem tất cả" để sang trang /search.
// Màn hình lớn: ô nhập luôn hiện. Điện thoại: chỉ hiện nút kính lúp, bấm vào thì thanh tìm kiếm phủ lên Navbar.

const PREVIEW_COUNT = { people: 4, groups: 2, pages: 2, posts: 3 };

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{children}</p>;

export const SearchBox: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null); // null = chưa tìm
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false); // bảng kết quả đang mở
  const [mobileOpen, setMobileOpen] = useState(false); // điện thoại: thanh tìm kiếm đang mở
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useClickOutside(() => setOpen(false));

  const close = () => {
    setOpen(false);
    setMobileOpen(false);
  };
  useEscapeKey(close);

  /** Đóng bảng kết quả và xoá ô nhập (sau khi chọn một kết quả). */
  const pick = () => {
    close();
    setQuery('');
  };

  // Gõ xong 250ms mới gọi server; bỏ kết quả của những lần gọi cũ hơn
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let stale = false;
    const timer = setTimeout(() => {
      api
        .get<SearchResults>(`/search?q=${encodeURIComponent(q)}&type=all`)
        .then((d) => !stale && setResults(d))
        .catch(() => !stale && setResults({ query: q, people: [], groups: [], pages: [], posts: [] }))
        .finally(() => !stale && setLoading(false));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const trimmed = query.trim();
  const showPanel = open && trimmed.length > 0;
  const tagQuery = parseTagQuery(query); // gõ "#vui" → gợi ý xem bài theo hashtag
  const isEmpty = !!results && !loading && !results.people.length && !results.groups.length && !results.pages.length && !results.posts.length;

  return (
    <div ref={boxRef} className="min-w-0">
      {/* Điện thoại: nút kính lúp */}
      <button
        onClick={() => {
          setMobileOpen(true);
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        aria-label="Tìm kiếm"
        className="sm:hidden icon-btn"
      >
        <Search className="w-5 h-5" />
      </button>

      <div className={`${mobileOpen ? 'max-sm:fixed max-sm:inset-x-0 max-sm:top-0 max-sm:h-16 max-sm:px-3 max-sm:bg-white max-sm:z-50 max-sm:flex max-sm:items-center max-sm:gap-2' : 'max-sm:hidden'} sm:relative sm:w-44 md:w-56 lg:w-72`}>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (!trimmed) return;
            navigate(`/search?q=${encodeURIComponent(trimmed)}`);
            pick();
          }}
          className="relative flex-1"
        >
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Tìm kiếm trên SocialNet..."
            aria-label="Tìm kiếm trên SocialNet"
            className="w-full h-10 pl-10 pr-9 text-sm bg-slate-100 rounded-full focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/30 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Xoá"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>
        <button onClick={close} className="sm:hidden px-2 py-2 text-sm font-semibold text-blue-600">
          Huỷ
        </button>

        {showPanel && (
          <div className="animate-pop max-sm:fixed max-sm:inset-x-2 max-sm:top-[4.25rem] sm:absolute sm:top-full sm:left-0 sm:mt-2 sm:w-[24rem] bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 max-h-[calc(100dvh-5.5rem)] overflow-y-auto">
            {tagQuery && (
              <Link to={`/hashtag/${encodeURIComponent(tagQuery)}`} onClick={pick} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-sm font-semibold text-blue-600">
                <span className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-lg">#</span>
                Xem bài viết có #{tagQuery}
              </Link>
            )}
            {loading && results === null && (
              <p className="flex items-center justify-center gap-2 p-5 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Đang tìm...
              </p>
            )}
            {isEmpty && (
              <p className="flex flex-col items-center gap-1 p-6 text-sm text-slate-400">
                <SearchX className="w-7 h-7" /> Không tìm thấy "{trimmed}"
              </p>
            )}

            {!!results?.people.length && <SectionTitle>Mọi người</SectionTitle>}
            {results?.people.slice(0, PREVIEW_COUNT.people).map((r) => (
              <PersonResult key={r.user.id} user={r.user} reasons={r.reasons} onClick={pick} dense />
            ))}
            {!!results?.groups.length && <SectionTitle>Nhóm</SectionTitle>}
            {results?.groups.slice(0, PREVIEW_COUNT.groups).map((r) => (
              <GroupResult key={r.group.id} group={r.group} reasons={r.reasons} onClick={pick} dense />
            ))}
            {!!results?.pages.length && <SectionTitle>Trang</SectionTitle>}
            {results?.pages.slice(0, PREVIEW_COUNT.pages).map((r) => (
              <PageResult key={r.page.id} page={r.page} reasons={r.reasons} onClick={pick} dense />
            ))}
            {!!results?.posts.length && <SectionTitle>Bài viết</SectionTitle>}
            {results?.posts.slice(0, PREVIEW_COUNT.posts).map((r) => (
              <PostResult key={r.post.id} post={r.post} reasons={r.reasons} query={trimmed} onClick={pick} dense />
            ))}

            {!!results && !isEmpty && (
              <Link to={`/search?q=${encodeURIComponent(trimmed)}`} onClick={pick} className="block mt-1 px-4 py-2.5 border-t border-slate-100 text-center text-sm font-semibold text-blue-600 hover:bg-slate-50">
                Xem tất cả kết quả cho "{trimmed}"
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

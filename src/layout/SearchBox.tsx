import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, Loader2, SearchX } from 'lucide-react';
import { api } from '../utils/api';
import { User } from '../types';
import { useSocial } from '../context/SocialContext';
import { useClickOutside } from '../hooks/useClickOutside';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { Avatar } from '../components/ui';

// Ô tìm kiếm người dùng trên Navbar: gõ tên / @username → gợi ý tối đa 8 người (gọi GET /api/users?q=), bấm vào để mở trang cá nhân.
// Màn hình lớn: ô nhập luôn hiện. Điện thoại: chỉ hiện nút kính lúp, bấm vào thì thanh tìm kiếm phủ lên Navbar.

export const SearchBox: React.FC = () => {
  const { friends } = useSocial();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[] | null>(null); // null = chưa tìm
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false); // bảng kết quả đang mở
  const [mobileOpen, setMobileOpen] = useState(false); // điện thoại: thanh tìm kiếm đang mở
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useClickOutside(() => setOpen(false));
  const friendIds = new Set(friends.map((f) => f.id));

  const close = () => {
    setOpen(false);
    setMobileOpen(false);
  };
  useEscapeKey(close);

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
        .get<{ users: User[] }>(`/users?q=${encodeURIComponent(q)}&limit=8`)
        .then((d) => !stale && setResults(d.users))
        .catch(() => !stale && setResults([]))
        .finally(() => !stale && setLoading(false));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const showPanel = open && query.trim().length > 0;

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
        className="sm:hidden p-2 rounded-full text-slate-700 bg-slate-100 hover:bg-slate-200"
      >
        <Search className="w-5 h-5" />
      </button>

      <div
        className={`${mobileOpen ? 'max-sm:fixed max-sm:inset-x-0 max-sm:top-0 max-sm:h-16 max-sm:px-3 max-sm:bg-white max-sm:z-50 max-sm:flex max-sm:items-center max-sm:gap-2' : 'max-sm:hidden'} sm:relative sm:w-44 md:w-56 lg:w-72`}
      >
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(true);
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
            placeholder="Tìm kiếm mọi người..."
            aria-label="Tìm kiếm mọi người"
            className="w-full pl-10 pr-9 py-2 text-sm bg-slate-100 rounded-full focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/30 [&::-webkit-search-cancel-button]:hidden"
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
          <div className="animate-pop max-sm:fixed max-sm:inset-x-2 max-sm:top-[4.25rem] sm:absolute sm:top-full sm:left-0 sm:mt-2 sm:w-[22rem] bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 max-h-[calc(100dvh-5.5rem)] overflow-y-auto">
            {loading && results === null && (
              <p className="flex items-center justify-center gap-2 p-5 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Đang tìm...
              </p>
            )}
            {results?.length === 0 && !loading && (
              <p className="flex flex-col items-center gap-1 p-6 text-sm text-slate-400">
                <SearchX className="w-7 h-7" /> Không tìm thấy "{query.trim()}"
              </p>
            )}
            {!!results?.length && <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Mọi người</p>}
            {results?.map((u) => (
              <Link key={u.id} to={`/profile/${u.id}`} onClick={() => { close(); setQuery(''); }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <Avatar src={u.avatar} size="w-10 h-10" online={u.isOnline} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 truncate">{u.name}</div>
                  <div className="text-xs text-slate-400 truncate">@{u.username}</div>
                </div>
                {friendIds.has(u.id) && <span className="text-[11px] font-semibold text-emerald-600 shrink-0">Bạn bè</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

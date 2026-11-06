import React from 'react';
import { Search, Loader2, Inbox, LucideIcon } from 'lucide-react';
import { Avatar, EmptyState, ErrorState, ListSkeleton, TabButton } from '../ui';
import { AdminPerson } from '../../types';
import { useAdminList } from '../../hooks/useAdminList';

// Các mảnh giao diện dùng chung cho các trang quản trị: thanh tìm kiếm + bộ lọc, bảng dữ liệu có phân trang, ô người dùng, nhãn trạng thái.

/** Thanh công cụ: ô tìm kiếm và (tuỳ chọn) các nút lọc. */
export const AdminToolbar: React.FC<{
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  filters?: { key: string; label: string }[];
  filter?: string;
  onFilter?: (key: string) => void;
}> = ({ search, onSearch, placeholder, filters, filter, onFilter }) => (
  <div className="card p-3 mb-4 flex flex-col lg:flex-row lg:items-center gap-3">
    <div className="relative flex-1 min-w-0">
      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="input pl-10" />
    </div>
    {filters && (
      <div className="flex gap-1 overflow-x-auto no-scrollbar scroll-fade-x">
        {filters.map((f) => (
          <TabButton key={f.key} active={filter === f.key} onClick={() => onFilter?.(f.key)}>
            {f.label}
          </TabButton>
        ))}
      </div>
    )}
  </div>
);

/** Người dùng rút gọn: ảnh + tên + @username (đã bị xoá thì hiện chữ mờ). */
export const Person: React.FC<{ person: AdminPerson | null }> = ({ person }) =>
  person ? (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar src={person.avatar} size="size-9" />
      <div className="min-w-0">
        <div className="font-semibold text-slate-800 truncate">{person.name}</div>
        <div className="text-xs text-slate-400 truncate">@{person.username}</div>
      </div>
    </div>
  ) : (
    <span className="text-slate-400 italic">Tài khoản đã bị xoá</span>
  );

const TONES = {
  gray: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-600',
};

/** Nhãn nhỏ có màu (vai trò, trạng thái...). */
export const Pill: React.FC<{ tone?: keyof typeof TONES; children: React.ReactNode }> = ({ tone = 'gray', children }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${TONES[tone]}`}>{children}</span>
);

export interface AdminColumn {
  label: string;
  className?: string; // vd 'hidden md:table-cell' để ẩn cột trên màn hình nhỏ
}

/** Bảng dữ liệu của một danh sách: đang tải / lỗi / trống / các dòng + nút "Xem thêm". renderRow trả về <tr>. */
export function AdminTable<T extends { id: string }>({
  list,
  columns,
  renderRow,
  emptyTitle,
  emptyIcon = Inbox,
}: {
  list: ReturnType<typeof useAdminList<T>>;
  columns: AdminColumn[];
  renderRow: (item: T) => React.ReactNode;
  emptyTitle: string;
  emptyIcon?: LucideIcon;
}) {
  if (list.status === 'loading') return <ListSkeleton />;
  if (list.status === 'error') return <ErrorState onRetry={() => void list.reload()} />;
  if (list.items.length === 0) return <EmptyState icon={emptyIcon} title={emptyTitle} description="Thử đổi từ khoá hoặc bộ lọc." />;

  return (
    <>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((c) => (
                  <th key={c.label} scope="col" className={`px-4 py-3 font-semibold whitespace-nowrap ${c.className ?? ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">{list.items.map(renderRow)}</tbody>
          </table>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>
          Hiển thị {list.items.length} / {list.total}
        </span>
        {list.hasMore && (
          <button onClick={() => void list.loadMore()} disabled={list.loadingMore} className="btn-secondary btn-sm">
            {list.loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Xem thêm
          </button>
        )}
      </div>
    </>
  );
}

/** Ô của bảng: padding thống nhất. */
export const Cell: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className = '', children }) => <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;

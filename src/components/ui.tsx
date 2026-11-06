import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { LucideIcon, Eye, EyeOff, Loader2, AlertTriangle, X } from 'lucide-react';
import { frameClass } from '../utils/avatarFrames';

// Các mảnh giao diện nhỏ dùng lại ở nhiều trang: tiêu đề trang, màn hình trống, nút tab, ô nhập có nhãn, ảnh đại diện.
// (Các class như "card", "btn-primary", "input"... được định nghĩa trong src/index.css.)

/** Khung tiêu đề đầu trang: icon + tiêu đề + mô tả; children đặt bên phải (vd một nút). */
export const PageHeader: React.FC<{
  icon: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  iconColor?: string;
  before?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, iconColor = 'bg-blue-50 text-blue-600', before, children }) => (
  <div className="card p-4 sm:p-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
    <div className="flex items-center gap-3 min-w-0">
      {before}
      <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${iconColor}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <h1 className="page-title truncate">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

/** Màn hình khi danh sách trống. */
export const EmptyState: React.FC<{ icon: LucideIcon; title: string; description?: string; children?: React.ReactNode }> = ({
  icon: Icon,
  title,
  description,
  children,
}) => (
  <div className="card--empty">
    <div className="empty-icon">
      <Icon className="w-8 h-8" />
    </div>
    <h3 className="section-title">{title}</h3>
    {description && <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">{description}</p>}
    {children && <div className="mt-5">{children}</div>}
  </div>
);

/** Màn hình lỗi thân thiện khi tải dữ liệu thất bại, kèm nút "Thử lại". */
export const ErrorState: React.FC<{ title?: string; description?: string; onRetry?: () => void }> = ({
  title = 'Không tải được dữ liệu',
  description = 'Có thể mạng đang chập chờn hoặc máy chủ đang bận. Bạn thử lại nhé.',
  onRetry,
}) => (
  <div role="alert" className="card--empty">
    <div className="empty-icon !bg-rose-50 !text-rose-500">
      <AlertTriangle className="w-8 h-8" />
    </div>
    <h3 className="section-title">{title}</h3>
    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">{description}</p>
    {onRetry && (
      <button onClick={onRetry} className="btn-primary mt-5">
        Thử lại
      </button>
    )}
  </div>
);

/** Vòng xoay "đang tải" ở giữa vùng nội dung. */
export const PageLoading: React.FC<{ text?: string }> = ({ text = 'Đang tải...' }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
    <Loader2 className="w-5 h-5 animate-spin" /> {text}
  </div>
);

/** Khối xám nhấp nháy giữ chỗ khi đang tải dữ liệu. */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;

/** Khung bài viết giả hiện lúc đang tải bảng tin / trang theo hashtag. */
export const PostSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div role="status" aria-label="Đang tải bài viết">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="card mb-5 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-11 h-11 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2.5 w-1/5" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    ))}
  </div>
);

/** Danh sách dòng giả (thông báo, bạn bè...) lúc đang tải. */
export const ListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <div role="status" aria-label="Đang tải danh sách" className="card rounded-2xl divide-y divide-slate-100">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="p-4 flex items-center gap-3.5">
        <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2.5 w-1/4" />
        </div>
      </div>
    ))}
  </div>
);

/** Nút tab / bộ lọc: đang chọn thì nền xanh. */
export const TabButton: React.FC<{ active: boolean; onClick: () => void; icon?: LucideIcon; children: React.ReactNode }> = ({
  active,
  onClick,
  icon: Icon,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`${active ? 'btn-tab--active' : 'btn-tab'} flex items-center gap-2 whitespace-nowrap shrink-0`}
  >
    {Icon && <Icon className="w-4 h-4" />}
    {children}
  </button>
);

/**
 * Ô nhập có nhãn phía trên (và icon bên trái nếu có). Các thuộc tính khác (value, onChange...) truyền thẳng vào <input>.
 * Ô mật khẩu tự có nút hiện / ẩn mật khẩu.
 */
export const FormField: React.FC<{ label: string; icon?: LucideIcon; labelRight?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>> = ({
  label,
  icon: Icon,
  labelRight,
  className = '',
  type,
  ...inputProps
}) => {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        {labelRight}
      </div>
      <div className="relative">
        {Icon && <Icon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />}
        <input
          {...inputProps}
          id={id}
          type={isPassword && showPassword ? 'text' : type}
          className={`input ${Icon ? 'pl-10' : ''} ${isPassword ? 'pr-11' : ''} ${className}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            className="absolute right-1 top-1/2 -translate-y-1/2 size-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
};

/** Danh sách tên người dùng dạng link, cách nhau bằng dấu phẩy (vd "cùng với A, B"). */
export const UserLinks: React.FC<{ users: { id: string; name: string }[] }> = ({ users }) => (
  <>
    {users.map((u, i) => (
      <React.Fragment key={u.id}>
        {i > 0 && ', '}
        <Link to={`/profile/${u.id}`} className="font-semibold text-blue-600 hover:underline">
          {u.name}
        </Link>
      </React.Fragment>
    ))}
  </>
);

/** Ảnh đại diện tròn; online = true thì có chấm xanh ở góc. */
export const Avatar: React.FC<{ src?: string; size?: string; online?: boolean; className?: string }> = ({ src, size = 'w-10 h-10', online, className = '' }) => (
  <div className={`relative shrink-0 ${size}`}>
    <img src={src} alt="" loading="lazy" className={`w-full h-full rounded-full object-cover bg-slate-200 border border-slate-200 ${className}`} />
    {online && <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white absolute -bottom-0.5 -right-0.5" />}
  </div>
);

/** Khung quanh ảnh đại diện (vòng màu / dải màu). Không có khung thì trả nguyên ảnh, không thêm thẻ nào. */
export const AvatarFrame: React.FC<{ frame?: string; className?: string; children: React.ReactNode }> = ({ frame, className = '', children }) => {
  const cls = frameClass(frame);
  if (!cls) return <>{children}</>;
  return (
    <div data-frame={frame} className={`rounded-full p-[3px] shrink-0 ${cls} ${className}`}>
      {children}
    </div>
  );
};

/** Huy hiệu đếm số (thông báo, tin nhắn): quá 99 thì hiện "99+". */
export const CountBadge: React.FC<{ count: number; className?: string }> = ({ count, className = '' }) =>
  count > 0 ? (
    <span className={`min-w-5 h-5 px-1.5 bg-rose-500 text-white text-[11px] font-semibold leading-none rounded-full flex items-center justify-center ${className}`}>{count > 99 ? '99+' : count}</span>
  ) : null;

/** Ảnh vuông bo góc của một nhóm hoặc trang: có ảnh thì hiện ảnh, không thì ô màu kèm chữ cái đầu của tên. */
export const SquareAvatar: React.FC<{ item: { name: string; avatar?: string }; size?: string; className?: string }> = ({ item, size = 'size-12', className = '' }) =>
  item.avatar ? (
    <img src={item.avatar} alt="" loading="lazy" className={`${size} rounded-xl object-cover bg-slate-200 shrink-0 ${className}`} />
  ) : (
    <div aria-hidden="true" className={`${size} rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white font-bold flex items-center justify-center shrink-0 ${className}`}>
      {item.name.trim().charAt(0).toUpperCase()}
    </div>
  );

/** Khung một mục trong tab quản trị (nhóm / trang): thẻ có icon + tiêu đề + huy hiệu đếm số việc đang chờ. */
export const AdminSection: React.FC<{ id?: string; icon: LucideIcon; title: string; count?: number; children: React.ReactNode }> = ({ id, icon: Icon, title, count = 0, children }) => (
  <section id={id} className="card p-4 sm:p-5 scroll-mt-24">
    <h3 className="section-title flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-slate-400" /> {title} <CountBadge count={count} />
    </h3>
    {children}
  </section>
);

/** Dòng chữ mờ cho trạng thái "không có gì" trong một mục quản trị. */
export const MutedText: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-sm text-slate-400 py-2">{children}</p>;

/** Khung chung: nền mờ (bấm ra ngoài để đóng) + thẻ trắng có tiêu đề và nút đóng. */
export const DialogShell: React.FC<{ label: string; title: string; onClose: () => void; size?: 'sm' | 'md'; scroll?: boolean; children: React.ReactNode }> = ({ label, title, onClose, size = 'md', scroll = false, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={`animate-pop bg-white rounded-2xl w-full p-5 ${size === 'sm' ? 'max-w-sm' : 'max-w-md'} ${scroll ? 'max-h-[80dvh] flex flex-col' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="section-title">{title}</h3>
        <button onClick={onClose} aria-label="Đóng" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
          <X className="w-5 h-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

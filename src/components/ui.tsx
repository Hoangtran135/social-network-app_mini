import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { LucideIcon, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
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
  <div className="card rounded-3xl p-4 sm:p-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
    <div className="flex items-center gap-3 min-w-0">
      {before}
      <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 ${iconColor}`}>
        <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
      </div>
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-black text-slate-900 truncate">{title}</h1>
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
    <h3 className="text-base font-bold text-slate-800">{title}</h3>
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
    <h3 className="text-base font-bold text-slate-800">{title}</h3>
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
  <div role="status" aria-label="Đang tải danh sách" className="card rounded-3xl divide-y divide-slate-100">
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
        <label htmlFor={id} className="text-xs font-bold text-slate-600 uppercase tracking-wider">
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
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
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
        <Link to={`/profile/${u.id}`} className="font-bold text-blue-600 hover:underline">
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
    <span className={`min-w-4 h-4 px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ${className}`}>{count > 99 ? '99+' : count}</span>
  ) : null;

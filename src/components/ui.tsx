import React from 'react';
import { Link } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';

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
  <div className="card rounded-3xl p-6 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      {before}
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${iconColor}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <h1 className="text-xl font-black text-slate-900">{title}</h1>
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

/** Nút tab / bộ lọc: đang chọn thì nền xanh. */
export const TabButton: React.FC<{ active: boolean; onClick: () => void; icon?: LucideIcon; children: React.ReactNode }> = ({
  active,
  onClick,
  icon: Icon,
  children,
}) => (
  <button type="button" onClick={onClick} className={`${active ? 'btn-tab--active' : 'btn-tab'} flex items-center gap-2 whitespace-nowrap`}>
    {Icon && <Icon className="w-4 h-4" />}
    {children}
  </button>
);

/** Ô nhập có nhãn phía trên (và icon bên trái nếu có). Các thuộc tính khác (value, onChange...) truyền thẳng vào <input>. */
export const FormField: React.FC<{ label: string; icon?: LucideIcon; labelRight?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>> = ({
  label,
  icon: Icon,
  labelRight,
  className = '',
  ...inputProps
}) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">{label}</label>
      {labelRight}
    </div>
    <div className="relative">
      {Icon && <Icon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />}
      <input {...inputProps} className={`input ${Icon ? 'pl-10' : ''} ${className}`} />
    </div>
  </div>
);

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
    <img src={src} alt="" className={`w-full h-full rounded-full object-cover border border-slate-200 ${className}`} />
    {online && <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white absolute -bottom-0.5 -right-0.5" />}
  </div>
);

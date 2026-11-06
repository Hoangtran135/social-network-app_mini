import { PageCategory } from '../../types';

// Dữ liệu dùng chung cho các màn hình Trang (fanpage): tên hiển thị của danh mục.
// (Ảnh đại diện của Trang dùng SquareAvatar trong components/ui.tsx.)

export const PAGE_CATEGORIES: { key: PageCategory; label: string }[] = [
  { key: 'brand', label: 'Thương hiệu' },
  { key: 'business', label: 'Doanh nghiệp' },
  { key: 'community', label: 'Cộng đồng' },
  { key: 'public_figure', label: 'Người của công chúng' },
  { key: 'entertainment', label: 'Giải trí' },
  { key: 'education', label: 'Giáo dục' },
  { key: 'nonprofit', label: 'Tổ chức phi lợi nhuận' },
  { key: 'other', label: 'Khác' },
];

export const categoryLabel = (key: PageCategory | string) => PAGE_CATEGORIES.find((c) => c.key === key)?.label ?? 'Khác';

import { AvatarFrame } from '../types';

// Các khung quanh ảnh đại diện (phải khớp danh sách AVATAR_FRAMES ở server/validation.ts).
// "className" là nền của vòng khung (màu hoặc dải màu); ảnh nằm bên trong cách viền 3px.

export const AVATAR_FRAMES: { key: AvatarFrame; label: string; className: string }[] = [
  { key: 'none', label: 'Không khung', className: '' },
  { key: 'blue', label: 'Xanh dương', className: 'bg-blue-500' },
  { key: 'green', label: 'Xanh lá', className: 'bg-emerald-500' },
  { key: 'rose', label: 'Hồng', className: 'bg-rose-500' },
  { key: 'gold', label: 'Vàng', className: 'bg-gradient-to-tr from-amber-300 via-yellow-400 to-amber-600' },
  { key: 'rainbow', label: 'Cầu vồng', className: 'bg-gradient-to-tr from-pink-500 via-yellow-400 to-sky-500' },
];

export const frameClass = (frame?: string) => AVATAR_FRAMES.find((f) => f.key === frame)?.className ?? '';

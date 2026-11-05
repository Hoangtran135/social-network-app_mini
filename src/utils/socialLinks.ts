import { Facebook, Github, Linkedin, Twitter, Instagram, Youtube, Music2, LucideIcon } from 'lucide-react';
import { SocialPlatform } from '../types';

// Các mạng xã hội có thể gắn vào hồ sơ (phải khớp SOCIAL_PLATFORMS ở server/validation.ts).

export const SOCIAL_PLATFORMS: { key: SocialPlatform; label: string; icon: LucideIcon; placeholder: string }[] = [
  { key: 'facebook', label: 'Facebook', icon: Facebook, placeholder: 'https://facebook.com/ten-ban' },
  { key: 'github', label: 'GitHub', icon: Github, placeholder: 'https://github.com/ten-ban' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, placeholder: 'https://linkedin.com/in/ten-ban' },
  { key: 'twitter', label: 'X (Twitter)', icon: Twitter, placeholder: 'https://x.com/ten-ban' },
  { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: 'https://instagram.com/ten-ban' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, placeholder: 'https://youtube.com/@ten-kenh' },
  { key: 'tiktok', label: 'TikTok', icon: Music2, placeholder: 'https://tiktok.com/@ten-ban' },
];

/** Liên kết hợp lệ: bắt đầu bằng http:// hoặc https://, không có khoảng trắng. Chuỗi rỗng = không có liên kết. */
export const isValidSocialUrl = (value: string) => value.trim() === '' || /^https?:\/\/[^\s<>"']+$/i.test(value.trim());

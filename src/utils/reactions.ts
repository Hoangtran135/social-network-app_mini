import { ReactionType } from '../types';

// 6 loại cảm xúc dùng chung cho bài viết và bình luận.

export const REACTIONS: Record<ReactionType, { emoji: string; label: string; color: string }> = {
  like: { emoji: '👍', label: 'Thích', color: 'text-blue-600' },
  love: { emoji: '❤️', label: 'Yêu thích', color: 'text-rose-500' },
  haha: { emoji: '😄', label: 'Haha', color: 'text-amber-500' },
  wow: { emoji: '😮', label: 'Wow', color: 'text-amber-500' },
  sad: { emoji: '😢', label: 'Buồn', color: 'text-yellow-600' },
  angry: { emoji: '😡', label: 'Phẫn nộ', color: 'text-orange-600' },
};

export const REACTION_TYPES = Object.keys(REACTIONS) as ReactionType[];

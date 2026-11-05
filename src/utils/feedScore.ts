import { Post } from '../types';

/** Điểm "nổi bật" của bài viết: cảm xúc + 2 × bình luận + 3 × chia sẻ (tương tác càng sâu càng nhiều điểm). */
export const postScore = (p: Pick<Post, 'reactions' | 'commentsCount' | 'sharesCount'>) => p.reactions.length + 2 * p.commentsCount + 3 * p.sharesCount;

import { useNavigate } from 'react-router-dom';
import { useSocial } from '../context/SocialContext';
import { NotificationItem } from '../types';

// Xử lý khi bấm vào một thông báo (menu thông báo trên Navbar, trang Thông báo và toast): đánh dấu đã đọc rồi mở ĐÚNG nơi liên quan:
//   • trang cá nhân (kết bạn, theo dõi, cảm xúc story)        • nhóm (tab Quản trị nếu là yêu cầu cần duyệt)      • trang fanpage
//   • bài viết → /post/:id (hiện đúng bài đó; reel thì mở ở mục Reels)
//   • bình luận → /post/:id?comment=<id> (tự mở khung bình luận, cuộn tới và viền sáng đúng bình luận)

export function useOpenNotification() {
  const navigate = useNavigate();
  const { posts, fetchPostById, markNotificationAsRead } = useSocial();

  return async (notif: NotificationItem) => {
    markNotificationAsRead(notif.id);

    if (notif.targetType === 'profile') return navigate(`/profile/${notif.actor.id}`);
    if (notif.targetType === 'page' && notif.targetId) return navigate(`/pages/${notif.targetId}`);
    if (notif.targetType === 'group' && notif.targetId) return navigate(`/groups/${notif.targetId}${notif.focus ? `?tab=admin&focus=${notif.focus}` : ''}`);
    if (notif.targetType !== 'post' || !notif.targetId) return;

    // Reel chỉ xem ở mục Reels; mọi bài khác (kể cả bài trong nhóm, bài trên tường người khác) mở ở trang một bài
    const post = posts.find((p) => p.id === notif.targetId) || (await fetchPostById(notif.targetId));
    if (post?.kind === 'reel') return navigate(`/reels?reel=${post.id}`);
    navigate(`/post/${notif.targetId}${notif.commentId ? `?comment=${notif.commentId}` : ''}`);
  };
}

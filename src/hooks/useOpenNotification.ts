import { useNavigate } from 'react-router-dom';
import { useSocial } from '../context/SocialContext';
import { NotificationItem } from '../types';

// Xử lý khi bấm vào một thông báo (dùng ở menu thông báo trên Navbar và trang Thông báo):
// đánh dấu đã đọc, rồi mở bài viết liên quan (cuộn tới và viền xanh) hoặc mở trang cá nhân.

/** Cuộn tới thẻ bài viết id="post-<id>"; bài chưa hiện trên trang thì thử lại sau 100ms (tối đa 20 lần). */
function scrollToPost(postId: string, attempt = 0) {
  const el = document.getElementById(`post-${postId}`);
  if (!el) {
    if (attempt < 20) setTimeout(() => scrollToPost(postId, attempt + 1), 100);
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('ring-2', 'ring-blue-500');
  setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500'), 2000);
}

export function useOpenNotification() {
  const navigate = useNavigate();
  const { posts, fetchPostById, markNotificationAsRead } = useSocial();

  return async (notif: NotificationItem) => {
    markNotificationAsRead(notif.id);

    if (notif.targetType === 'profile') return navigate(`/profile/${notif.actor.id}`);
    if (notif.targetType !== 'post' || !notif.targetId) return;

    // Bài đăng trên tường người khác thì nằm ở trang cá nhân người đó, còn lại nằm ở bảng tin
    const post = posts.find((p) => p.id === notif.targetId) || (await fetchPostById(notif.targetId));
    navigate(post?.wallOwnerId ? `/profile/${post.wallOwnerId}` : '/');
    scrollToPost(notif.targetId);
  };
}

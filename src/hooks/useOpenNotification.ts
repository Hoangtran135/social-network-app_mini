import { useNavigate } from 'react-router-dom';
import { useSocial } from '../context/SocialContext';
import { NotificationItem } from '../types';

// Xử lý khi bấm vào một thông báo (dùng ở menu thông báo trên Navbar và trang Thông báo):
// đánh dấu đã đọc, rồi mở ĐÚNG nơi liên quan: bài viết (cuộn tới và viền xanh), bình luận (mở khung bình luận, cuộn tới và viền xanh), trang cá nhân, nhóm (tab Quản trị với yêu cầu cần duyệt) hoặc trang (fanpage).

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
    // Thông báo về bình luận → mở bài viết, tự mở khung bình luận và cuộn tới đúng bình luận
    if (notif.commentId && notif.targetId) return navigate(`/post/${notif.targetId}?comment=${notif.commentId}`);
    // Xin vào nhóm / bài chờ duyệt / báo cáo → mở thẳng tab Quản trị của nhóm
    if (notif.targetType === 'group' && notif.targetId) return navigate(`/groups/${notif.targetId}${notif.focus === 'admin' ? '?tab=admin' : ''}`);
    if (notif.targetType === 'page' && notif.targetId) return navigate(`/pages/${notif.targetId}`);
    if (notif.targetType !== 'post' || !notif.targetId) return;

    const post = posts.find((p) => p.id === notif.targetId) || (await fetchPostById(notif.targetId));
    // Bài nhóm chỉ xem ở trang nhóm, reel chỉ ở mục Reels (không có ở bảng tin nên không thể cuộn tới)
    if (post?.groupId) return navigate(`/groups/${post.groupId}`);
    if (post?.kind === 'reel') return navigate(`/reels?reel=${post.id}`);
    // Bài đăng trên tường người khác thì nằm ở trang cá nhân người đó, còn lại nằm ở bảng tin
    navigate(post?.wallOwnerId ? `/profile/${post.wallOwnerId}` : '/');
    scrollToPost(notif.targetId);
  };
}

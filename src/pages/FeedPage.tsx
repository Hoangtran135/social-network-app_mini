import React, { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MessageSquareDashed, Loader2 } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { useAuth } from '../context/AuthContext';
import { CreatePostBox } from '../components/post/CreatePostBox';
import { PostCard } from '../components/post/PostCard';
import { StoryBar } from '../components/story/StoryBar';
import { EmptyState, TabButton } from '../components/ui';

// Trang bảng tin (/): thanh story, ô "Bạn đang nghĩ gì?", bộ lọc (tất cả / bạn bè) và danh sách bài viết.
// Cuộn gần tới cuối danh sách thì tự tải thêm bài (cuộn vô hạn).

export const FeedPage: React.FC = () => {
  const { posts, friends, hasMorePosts, isLoadingMorePosts, loadMorePosts } = useSocial();
  const { currentUser } = useAuth();
  const openCreatePost = useOutletContext<() => void>();
  const [onlyFriends, setOnlyFriends] = useState(false);

  // Cuộn vô hạn: một thẻ div rỗng ở cuối danh sách; khi nó sắp hiện trên màn hình (cách 400px) thì tải thêm bài
  const endRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMorePosts);
  loadMoreRef.current = loadMorePosts;
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMoreRef.current(), { rootMargin: '400px' });
    if (endRef.current) observer.observe(endRef.current);
    return () => observer.disconnect();
  }, []);

  // Bài đăng lên tường người khác chỉ hiện ở trang cá nhân, không hiện ở bảng tin
  const friendIds = new Set(friends.map((f) => f.id));
  const visiblePosts = posts.filter(
    (p) => !p.wallOwnerId && (!onlyFriends || friendIds.has(p.author.id) || p.author.id === currentUser?.id)
  );

  return (
    <div className="max-w-2xl">
      <StoryBar />
      <CreatePostBox onClick={openCreatePost} />

      <div className="card p-2 mb-5 flex gap-1">
        <TabButton active={!onlyFriends} onClick={() => setOnlyFriends(false)}>
          Tất cả bài viết
        </TabButton>
        <TabButton active={onlyFriends} onClick={() => setOnlyFriends(true)}>
          Bạn bè
        </TabButton>
      </div>

      {visiblePosts.length === 0 && (
        <EmptyState icon={MessageSquareDashed} title="Chưa có bài viết nào" description="Hãy là người đầu tiên chia sẻ khoảnh khắc của bạn!">
          <button onClick={openCreatePost} className="btn-primary">
            + Đăng bài ngay
          </button>
        </EmptyState>
      )}
      {visiblePosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      <div ref={endRef} />
      {isLoadingMorePosts && <Loader2 className="w-5 h-5 animate-spin mx-auto my-6 text-slate-400" />}
      {!hasMorePosts && visiblePosts.length > 0 && <p className="text-center text-xs text-slate-400 py-6">Bạn đã xem hết bài viết.</p>}
    </div>
  );
};

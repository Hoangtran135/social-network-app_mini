import React, { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MessageSquareDashed, Loader2 } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { useAuth } from '../context/AuthContext';
import { Post } from '../types';
import { postScore } from '../utils/feedScore';
import { CreatePostBox } from '../components/post/CreatePostBox';
import { PostCard } from '../components/post/PostCard';
import { StoryBar } from '../components/story/StoryBar';
import { EmptyState, ErrorState, PostSkeleton, TabButton } from '../components/ui';

// Trang bảng tin (/): thanh story, ô "Bạn đang nghĩ gì?", bộ lọc (tất cả / bạn bè / đang theo dõi),
// sắp xếp (mới nhất / nổi bật) và danh sách bài viết. Cuộn gần tới cuối danh sách thì tự tải thêm bài (cuộn vô hạn).
// Đang tải lần đầu → khung xương; tải lỗi → màn hình lỗi có nút "Thử lại".

type Filter = 'all' | 'friends' | 'following';
type Sort = 'newest' | 'top';

const EMPTY_TEXT: Record<Filter, string> = {
  all: 'Hãy là người đầu tiên chia sẻ khoảnh khắc của bạn!',
  friends: 'Bạn bè của bạn chưa đăng bài nào. Hãy kết thêm bạn hoặc xem tất cả bài viết.',
  following: 'Bạn chưa theo dõi ai, hoặc những người bạn theo dõi chưa đăng bài.',
};

export const FeedPage: React.FC = () => {
  const { posts, friends, following, postsStatus, reloadPosts, hasMorePosts, isLoadingMorePosts, loadMorePosts } = useSocial();
  const { currentUser } = useAuth();
  const openCreatePost = useOutletContext<() => void>();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');

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
  const followingIds = new Set(following.map((f) => f.id));
  const allowed = (p: Post) => {
    const mine = p.author.id === currentUser?.id;
    if (filter === 'friends') return mine || friendIds.has(p.author.id);
    if (filter === 'following') return mine || followingIds.has(p.author.id);
    return true;
  };
  const visiblePosts = posts.filter((p) => !p.wallOwnerId && !p.groupId && !p.kind && allowed(p));
  if (sort === 'top') visiblePosts.sort((a, b) => postScore(b) - postScore(a) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="page-narrow">
      <StoryBar />
      <CreatePostBox onClick={openCreatePost} />

      <div className="card p-2 mb-5 flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar scroll-fade-x" role="group" aria-label="Lọc bài viết">
          <TabButton active={filter === 'all'} onClick={() => setFilter('all')}>
            Tất cả bài viết
          </TabButton>
          <TabButton active={filter === 'friends'} onClick={() => setFilter('friends')}>
            Bạn bè
          </TabButton>
          <TabButton active={filter === 'following'} onClick={() => setFilter('following')}>
            Đang theo dõi
          </TabButton>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sắp xếp bảng tin" className="shrink-0 h-9 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl px-3 transition-colors">
          <option value="newest">Mới nhất</option>
          <option value="top">Nổi bật</option>
        </select>
      </div>

      {postsStatus === 'loading' && <PostSkeleton count={3} />}
      {postsStatus === 'error' && <ErrorState title="Không tải được bảng tin" onRetry={reloadPosts} />}

      {postsStatus === 'ready' && visiblePosts.length === 0 && !isLoadingMorePosts && (
        <EmptyState icon={MessageSquareDashed} title="Chưa có bài viết nào" description={EMPTY_TEXT[filter]}>
          <button onClick={openCreatePost} className="btn-primary">
            + Đăng bài ngay
          </button>
        </EmptyState>
      )}
      {postsStatus === 'ready' && visiblePosts.map((post) => <PostCard key={post.id} post={post} />)}

      <div ref={endRef} />
      {isLoadingMorePosts && <Loader2 className="w-5 h-5 animate-spin mx-auto my-6 text-slate-400" aria-label="Đang tải thêm" />}
      {/* Bộ lọc có thể làm danh sách ngắn đến mức ô cuối không bao giờ tới gần màn hình → luôn có nút tải thêm dự phòng */}
      {postsStatus === 'ready' && hasMorePosts && !isLoadingMorePosts && visiblePosts.length > 0 && (
        <button onClick={loadMorePosts} className="btn-secondary mx-auto block mb-6">
          Xem thêm bài viết
        </button>
      )}
      {postsStatus === 'ready' && !hasMorePosts && visiblePosts.length > 0 && <p className="text-center text-xs text-slate-400 py-6">Bạn đã xem hết bài viết.</p>}
    </div>
  );
};

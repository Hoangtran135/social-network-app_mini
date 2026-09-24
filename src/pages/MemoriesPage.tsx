import React, { useEffect } from 'react';
import { Clock } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { PostCard } from '../components/post/PostCard';
import { PageHeader, EmptyState } from '../components/ui';

// Trang kỷ niệm (/memories): bài mình đã đăng vào đúng ngày + tháng hôm nay ở các năm trước.
// Server lọc sẵn (GET /api/posts/memories), mỗi lần vào trang thì tải lại.

export const MemoriesPage: React.FC = () => {
  const { memoryPosts, loadMemoryPosts } = useSocial();
  const thisYear = new Date().getFullYear();

  useEffect(() => {
    loadMemoryPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-2xl">
      <PageHeader icon={Clock} iconColor="bg-indigo-50 text-indigo-600" title="Kỷ niệm" subtitle="Những gì bạn đã chia sẻ vào ngày này các năm trước" />
      {memoryPosts.length === 0 && <EmptyState icon={Clock} title="Chưa có kỷ niệm nào cho ngày hôm nay" />}
      {memoryPosts.map((post) => (
        <div key={post.id}>
          <p className="flex items-center gap-2 mb-2 px-1 text-xs font-bold text-indigo-600">
            <Clock className="w-3.5 h-3.5" /> {thisYear - new Date(post.createdAt).getFullYear()} năm trước, vào ngày này
          </p>
          <PostCard post={post} />
        </div>
      ))}
    </div>
  );
};

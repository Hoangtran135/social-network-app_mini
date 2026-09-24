import React from 'react';
import { Bookmark } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { PostCard } from '../components/post/PostCard';
import { PageHeader, EmptyState } from '../components/ui';

// Trang bài viết đã lưu (/saved): các bài mình đã bấm "Lưu bài viết" (trong số bài đã tải trên bảng tin).

export const SavedPostsPage: React.FC = () => {
  const saved = useSocial().posts.filter((p) => p.isSaved);
  return (
    <div className="max-w-2xl">
      <PageHeader icon={Bookmark} iconColor="bg-amber-50 text-amber-600" title="Bài viết đã lưu" subtitle={`Bạn đã lưu ${saved.length} bài viết`} />
      {saved.length === 0 && <EmptyState icon={Bookmark} title="Chưa có bài viết nào được lưu" description='Bấm "Lưu bài viết" trong menu "..." của mỗi bài để xem lại sau.' />}
      {saved.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
};

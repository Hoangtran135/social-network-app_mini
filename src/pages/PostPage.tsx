import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSocial } from '../context/SocialContext';
import { PostCard } from '../components/post/PostCard';
import { ErrorState, PageLoading } from '../components/ui';

// Trang xem MỘT bài viết (/post/:id): đích của kết quả tìm kiếm và của thông báo bình luận (?comment=). Bài không tồn tại hoặc không có quyền xem → màn hình lỗi.

export const PostPage: React.FC = () => {
  const { id = '' } = useParams();
  const focusCommentId = useSearchParams()[0].get('comment') || undefined; // ?comment=<id>: mở sẵn bình luận và cuộn tới đó
  const { posts, fetchPostById } = useSocial();
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    setStatus('loading');
    fetchPostById(id).then((post) => setStatus(post ? 'ready' : 'missing'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const post = posts.find((p) => p.id === id);
  if (status === 'loading') return <PageLoading text="Đang tải bài viết..." />;
  if (status === 'missing' || !post) return <ErrorState title="Không tìm thấy bài viết" description="Bài viết có thể đã bị xoá hoặc bạn không có quyền xem." />;
  return (
    <div className="page-narrow">
      <PostCard post={post} focusCommentId={focusCommentId} />
    </div>
  );
};

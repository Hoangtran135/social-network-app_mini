import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Hash, ArrowLeft } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { PostCard } from '../components/post/PostCard';
import { PageHeader, EmptyState, PostSkeleton } from '../components/ui';

// Trang bài viết theo hashtag (/hashtag/:tag): mọi bài mình được xem có hashtag đó, mới nhất trước.

export const HashtagPage: React.FC = () => {
  const { tag = '' } = useParams<{ tag: string }>();
  const { tagPosts, loadTagPosts } = useSocial();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadTagPosts(tag).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        icon={Hash}
        title={`#${tag}`}
        subtitle={loading ? 'Đang tải...' : `${tagPosts.length} bài viết`}
        before={
          <Link to="/" aria-label="Về bảng tin" className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        }
      />
      {loading && <PostSkeleton count={2} />}
      {!loading && tagPosts.length === 0 && <EmptyState icon={Hash} title="Chưa có bài viết nào" description={`Chưa có ai đăng bài với #${tag}. Hãy là người đầu tiên!`} />}
      {!loading && tagPosts.map((post) => <PostCard key={post.id} post={post} />)}
    </div>
  );
};

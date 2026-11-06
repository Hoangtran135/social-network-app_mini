import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clapperboard, Plus } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { Post } from '../types';
import { CreateReelModal } from '../components/reel/CreateReelModal';
import { ReelItem } from '../components/reel/ReelItem';
import { EmptyState, ErrorState, PageHeader } from '../components/ui';

// Trang Reels (/reels): video ngắn dọc, cuộn từng reel (snap). Reel đang hiện đủ lớn thì tự phát (mặc định tắt tiếng), rời đi thì dừng;
// xem đủ ~1 giây thì ghi nhận 1 lượt xem. Mỗi reel có: thích, bình luận (ngăn kéo), số lượt xem, bật / tắt tiếng, xoá (reel của mình).
// ?reel=<id> mở thẳng một reel (từ kết quả tìm kiếm). Cuộn gần cuối thì tải thêm.

/** Số reel tải mỗi lần (cuộn gần cuối thì tải thêm một lượt). */
const REELS_PER_PAGE = 8;

export const ReelsPage: React.FC = () => {
  const { posts, loadReels, fetchReel } = useSocial();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('reel');
  const [ids, setIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [muted, setMuted] = useState(true);
  const [creating, setCreating] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const loadedCount = useRef(0);

  const load = useCallback(async () => {
    setStatus('loading');
    const focus = focusId ? await fetchReel(focusId) : null;
    const first = await loadReels(0, REELS_PER_PAGE);
    if (!first) return setStatus('error');
    loadedCount.current = first.length;
    setIds([...(focus ? [focus.id] : []), ...first.map((r) => r.id).filter((id) => id !== focus?.id)]);
    setHasMore(first.length === REELS_PER_PAGE);
    setStatus('ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  useEffect(() => {
    load();
  }, [load]);

  // Cuộn gần cuối → tải thêm
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const more = await loadReels(loadedCount.current, REELS_PER_PAGE);
    if (more) {
      loadedCount.current += more.length;
      setIds((list) => [...list, ...more.map((r) => r.id).filter((id) => !list.includes(id))]);
      setHasMore(more.length === REELS_PER_PAGE);
    }
    setLoadingMore(false);
  }, [loadingMore, hasMore, loadReels]);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  useEffect(() => {
    if (status !== 'ready' || !endRef.current) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMoreRef.current(), { threshold: 0.1 });
    observer.observe(endRef.current);
    return () => observer.disconnect();
  }, [status]);

  // Mở thẳng reel được chọn
  useEffect(() => {
    if (status === 'ready' && focusId) document.getElementById(`reel-${focusId}`)?.scrollIntoView({ block: 'start' });
  }, [status, focusId]);

  const reels = ids.map((id) => posts.find((p) => p.id === id)).filter((p): p is Post => !!p && p.kind === 'reel');

  return (
    <div className="max-w-md w-full">
      <PageHeader icon={Clapperboard} iconColor="bg-fuchsia-50 text-fuchsia-600" title="Reels" subtitle="Video ngắn dành cho bạn">
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Tạo Reel
        </button>
      </PageHeader>

      {status === 'loading' && <div role="status" aria-label="Đang tải reel" className="h-[60dvh] rounded-2xl bg-slate-200 animate-pulse" />}
      {status === 'error' && <ErrorState title="Không tải được Reels" onRetry={load} />}
      {status === 'ready' && reels.length === 0 && (
        <EmptyState icon={Clapperboard} title="Chưa có Reel nào" description="Hãy là người đầu tiên đăng một video ngắn!">
          <button onClick={() => setCreating(true)} className="btn-primary">
            Tạo Reel
          </button>
        </EmptyState>
      )}
      {status === 'ready' && reels.length > 0 && (
        <div className="h-[calc(100dvh-13rem)] min-h-[28rem] overflow-y-auto snap-y snap-mandatory space-y-3 overscroll-contain rounded-2xl" aria-label="Danh sách reel">
          {reels.map((reel) => (
            <div key={reel.id} className="h-full">
              <ReelItem reel={reel} muted={muted} onToggleMute={() => setMuted((m) => !m)} onDeleted={(id) => setIds((list) => list.filter((x) => x !== id))} />
            </div>
          ))}
          <div ref={endRef} className="h-px" />
        </div>
      )}

      {creating && <CreateReelModal onClose={() => setCreating(false)} onCreated={(reel) => setIds((list) => [reel.id, ...list.filter((x) => x !== reel.id)])} />}
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Heart, MessageCircle, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocial } from '../../context/SocialContext';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { Post } from '../../types';
import { formatCount } from '../../utils/format';
import { CommentSection } from '../post/CommentSection';
import { PostContent } from '../post/PostContent';
import { AvatarFrame } from '../ui';

// MỘT reel trong trang Reels: video tự phát khi nằm trong khung nhìn (≥ 70%) và dừng khi rời đi; xem đủ ~1 giây thì tính 1 lượt xem.
// Có nút thích, bình luận (ngăn kéo), số lượt xem, bật / tắt tiếng và xoá (chỉ reel của mình).

export const ReelItem: React.FC<{ reel: Post; muted: boolean; onToggleMute: () => void; onDeleted: (id: string) => void }> = ({ reel, muted, onToggleMute, onDeleted }) => {
  const { currentUser } = useAuth();
  const { toggleReaction, viewReel, deletePost } = useSocial();
  const confirm = useConfirm();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewed = useRef(false);
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const views = reel.viewsCount ?? 0;
  const myReaction = reel.reactions.find((r) => r.userId === currentUser?.id);
  const isOwner = reel.author.id === currentUser?.id;

  // Reel chiếm đủ ≥ 70% khung → đang "được xem"
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setActive(!!entry?.isIntersecting && entry.intersectionRatio >= 0.7), { threshold: [0, 0.7, 1] });
    observer.observe(rootRef.current!);
    return () => observer.disconnect();
  }, []);

  // Đang được xem → phát; rời đi → dừng và tua về đầu. Phát được ~1 giây thì tính 1 lượt xem (mỗi reel một lần).
  useEffect(() => {
    const video = videoRef.current!;
    if (!active) {
      video.pause();
      video.currentTime = 0;
      setPlaying(false);
      return;
    }
    video.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); // trình duyệt chặn tự phát → người dùng bấm để phát
    if (viewed.current) return;
    const timer = setTimeout(() => {
      viewed.current = true;
      viewReel(reel.id);
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reel.id]);

  const togglePlay = () => {
    const video = videoRef.current!;
    if (video.paused) video.play().then(() => setPlaying(true)).catch(() => {});
    else {
      video.pause();
      setPlaying(false);
    }
  };

  return (
    <div ref={rootRef} id={`reel-${reel.id}`} className="relative h-full snap-start snap-always bg-black rounded-2xl overflow-hidden" data-testid="reel">
      <video ref={videoRef} src={reel.video} loop muted={muted} playsInline preload="metadata" onClick={togglePlay} aria-label="Video reel" className="w-full h-full object-contain bg-black" />
      {!playing && !showComments && (
        <button onClick={togglePlay} aria-label="Phát video" className="absolute inset-0 m-auto size-16 rounded-full bg-black/50 text-white flex items-center justify-center text-2xl">
          ▶
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4 pr-16 bg-gradient-to-t from-black/70 to-transparent text-white">
        <Link to={`/profile/${reel.author.id}`} className="inline-flex items-center gap-2">
          <AvatarFrame frame={reel.author.avatarFrame}>
            <img src={reel.author.avatar} alt="" className="size-9 rounded-full object-cover border-2 border-white" />
          </AvatarFrame>
          <span className="text-sm font-semibold">{reel.author.name}</span>
        </Link>
        {reel.content && <PostContent text={reel.content} className="mt-2 text-sm text-white [&_a]:text-sky-300 line-clamp-3" />}
      </div>

      <div className="absolute right-2 bottom-4 flex flex-col items-center gap-4 text-white">
        <button onClick={() => toggleReaction(reel.id, myReaction?.type || 'like')} aria-label={myReaction ? 'Bỏ thích' : 'Thích'} aria-pressed={!!myReaction} className="flex flex-col items-center gap-0.5">
          <span className={`size-11 rounded-full bg-black/40 flex items-center justify-center ${myReaction ? 'text-rose-500' : ''}`}>
            <Heart className={`w-6 h-6 ${myReaction ? 'fill-current' : ''}`} />
          </span>
          <span className="text-xs font-semibold">{formatCount(reel.reactions.length)}</span>
        </button>
        <button onClick={() => setShowComments(true)} aria-label="Bình luận" className="flex flex-col items-center gap-0.5">
          <span className="size-11 rounded-full bg-black/40 flex items-center justify-center">
            <MessageCircle className="w-6 h-6" />
          </span>
          <span className="text-xs font-semibold">{formatCount(reel.commentsCount)}</span>
        </button>
        <div className="flex flex-col items-center gap-0.5" title="Lượt xem">
          <span className="size-11 rounded-full bg-black/40 flex items-center justify-center">
            <Eye className="w-6 h-6" />
          </span>
          <span className="text-xs font-semibold" aria-label={`${views} lượt xem`}>
            {formatCount(views)}
          </span>
        </div>
        <button onClick={onToggleMute} aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'} className="size-11 rounded-full bg-black/40 flex items-center justify-center">
          {muted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
        </button>
        {isOwner && (
          <button
            onClick={async () => {
              if (!(await confirm('Xóa Reel này?'))) return;
              await deletePost(reel.id);
              onDeleted(reel.id);
            }}
            aria-label="Xóa reel"
            className="size-11 rounded-full bg-black/40 flex items-center justify-center"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {showComments && (
        <div role="dialog" aria-label="Bình luận reel" className="absolute inset-x-0 bottom-0 max-h-[75%] overflow-y-auto bg-white text-slate-900 rounded-t-2xl shadow-2xl animate-pop">
          <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="section-title">Bình luận</h3>
            <button onClick={() => setShowComments(false)} aria-label="Đóng bình luận" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>
          <CommentSection postId={reel.id} disabled={!!reel.commentsDisabled} />
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Post, User } from '../../types';
import { timeAgo } from '../../utils/format';

// Các hộp thoại của thẻ bài viết (PostCard): gửi cho bạn bè, chia sẻ kèm lời bình, báo cáo (bài trong nhóm), lịch sử chỉnh sửa, xem ảnh lớn.
// Mỗi hộp thoại tự giữ ô nhập của nó; PostCard chỉ quyết định khi nào mở / đóng và làm gì khi người dùng xác nhận.

/** Khung chung: nền mờ (bấm ra ngoài để đóng) + thẻ trắng có tiêu đề và nút đóng. */
const DialogShell: React.FC<{ label: string; title: string; onClose: () => void; size?: 'sm' | 'md'; scroll?: boolean; children: React.ReactNode }> = ({ label, title, onClose, size = 'md', scroll = false, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={`animate-pop bg-white rounded-2xl w-full p-5 ${size === 'sm' ? 'max-w-sm' : 'max-w-md'} ${scroll ? 'max-h-[80dvh] flex flex-col' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="section-title">{title}</h3>
        <button onClick={onClose} aria-label="Đóng" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
          <X className="w-5 h-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

/** Chọn một người bạn để gửi bài viết qua tin nhắn. */
export const SendToFriendDialog: React.FC<{ friends: User[]; onPick: (friendId: string) => void; onClose: () => void }> = ({ friends, onPick, onClose }) => (
  <DialogShell label="Gửi bài viết cho bạn bè" title="Gửi bài viết cho bạn bè" size="sm" scroll onClose={onClose}>
    <div className="overflow-y-auto -mx-1 px-1">
      {friends.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Bạn chưa có bạn bè nào để gửi.</p>}
      {friends.map((f) => (
        <button key={f.id} onClick={() => onPick(f.id)} className="w-full flex items-center gap-3 p-2.5 hover:bg-blue-50 rounded-xl text-left">
          <img src={f.avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
          <span className="text-xs font-semibold text-slate-700 truncate">{f.name}</span>
        </button>
      ))}
    </div>
  </DialogShell>
);

/** Chia sẻ bài lên trang cá nhân, kèm lời bình tuỳ chọn và bản xem trước bài gốc. onShare nhận lời bình đã cắt khoảng trắng (hoặc undefined nếu để trống). */
export const ShareDialog: React.FC<{ post: Post; onShare: (message: string | undefined) => void; onClose: () => void }> = ({ post, onShare, onClose }) => {
  const [message, setMessage] = useState('');
  return (
    <DialogShell label="Chia sẻ bài viết" title="Chia sẻ lên trang cá nhân" onClose={onClose}>
      <textarea autoFocus rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hãy nói gì đó về nội dung này... (không bắt buộc)" className="input resize-none" />
      <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
        <b className="text-slate-800">{post.author.name}</b>
        <p className="line-clamp-3 break-words whitespace-pre-line">{post.content}</p>
      </div>
      <button onClick={() => onShare(message.trim() || undefined)} className="btn-primary w-full mt-3">
        Chia sẻ ngay
      </button>
    </DialogShell>
  );
};

/** Báo cáo một bài trong nhóm cho quản trị viên (lý do tuỳ chọn). */
export const ReportDialog: React.FC<{ onSubmit: (reason: string) => Promise<unknown>; onClose: () => void }> = ({ onSubmit, onClose }) => {
  const [reason, setReason] = useState('');
  return (
    <DialogShell label="Báo cáo bài viết" title="Báo cáo bài viết" onClose={onClose}>
      <p className="text-xs text-slate-500 mb-2">Báo cáo sẽ được gửi riêng cho quản trị viên nhóm.</p>
      <textarea autoFocus rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do báo cáo (không bắt buộc)" aria-label="Lý do báo cáo" className="input resize-none" />
      <button onClick={() => onSubmit(reason.trim())} className="btn-primary w-full mt-3">
        Gửi báo cáo
      </button>
    </DialogShell>
  );
};

/** Các phiên bản nội dung của bài: hiện tại ở trên, rồi từ mới tới cũ. */
export const EditHistoryDialog: React.FC<{ post: Post; onClose: () => void }> = ({ post, onClose }) => (
  <DialogShell label="Lịch sử chỉnh sửa" title="Lịch sử chỉnh sửa" scroll onClose={onClose}>
    <div className="overflow-y-auto space-y-3 text-sm">
      <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
        <p className="text-[11px] font-semibold text-blue-600 mb-1">Phiên bản hiện tại · {timeAgo(post.updatedAt)}</p>
        <p className="whitespace-pre-line break-words text-slate-800">{post.content || '(không có nội dung chữ)'}</p>
      </div>
      {!post.editHistory?.length && <p className="text-xs text-slate-500 text-center py-2">Bài viết này không có phiên bản nội dung cũ (chỉ đổi ảnh, quyền riêng tư hoặc cảm xúc).</p>}
      {[...(post.editHistory || [])].reverse().map((version, i) => (
        <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-[11px] font-semibold text-slate-500 mb-1">Phiên bản cũ · bị thay thế {timeAgo(version.editedAt)}</p>
          <p className="whitespace-pre-line break-words text-slate-700">{version.content || '(không có nội dung chữ)'}</p>
        </div>
      ))}
    </div>
  </DialogShell>
);

/** Xem ảnh lớn toàn màn hình (bấm bất kỳ đâu để đóng). */
export const ImagePreview: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => (
  <div onClick={onClose} className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out">
    <button onClick={onClose} aria-label="Đóng ảnh" className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white">
      <X className="w-6 h-6" />
    </button>
    <img src={src} alt="" className="max-h-[90dvh] max-w-[95vw] object-contain rounded-xl" />
  </div>
);

import React from 'react';
import { Link } from 'react-router-dom';
import { Clapperboard, FileText, Users } from 'lucide-react';
import { Group, Page, Post, User } from '../../types';
import { timeAgo } from '../../utils/format';
import { postHref, snippet } from '../../utils/searchFormat';
import { Avatar, SquareAvatar } from '../ui';
import { categoryLabel } from '../page/pageUi';

// Các dòng kết quả tìm kiếm, dùng chung cho ô tìm kiếm trên Navbar (dạng gọn) và trang /search (dạng đầy đủ).
// Mỗi dòng kèm "lý do" (vd "Bạn bè", "3 bạn chung") để người dùng hiểu vì sao kết quả này xuất hiện.

/** Các chip lý do hiển thị. */
export const ReasonChips: React.FC<{ reasons: string[]; className?: string }> = ({ reasons, className = '' }) =>
  reasons.length === 0 ? null : (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {reasons.map((r) => (
        <span key={r} className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 whitespace-nowrap">
          {r}
        </span>
      ))}
    </span>
  );

type RowProps = { onClick?: () => void; dense?: boolean };
const rowClass = (dense?: boolean) => `flex items-center gap-3 hover:bg-slate-50 ${dense ? 'px-4 py-2.5' : 'p-3'}`;

export const PersonResult: React.FC<RowProps & { user: User; reasons: string[] }> = ({ user, reasons, onClick, dense }) => (
  <Link to={`/profile/${user.id}`} onClick={onClick} className={rowClass(dense)}>
    <Avatar src={user.avatar} size="w-10 h-10" online={user.isOnline} />
    <div className="min-w-0 flex-1">
      <div className="text-sm font-semibold text-slate-800 truncate">{user.name}</div>
      <div className="text-xs text-slate-400 truncate">@{user.username}</div>
    </div>
    <ReasonChips reasons={dense ? reasons.slice(0, 1) : reasons} className="shrink-0 justify-end" />
  </Link>
);

export const GroupResult: React.FC<RowProps & { group: Group; reasons: string[] }> = ({ group, reasons, onClick, dense }) => (
  <Link to={`/groups/${group.id}`} onClick={onClick} className={rowClass(dense)}>
    <SquareAvatar item={group} size="size-10" />
    <div className="min-w-0 flex-1">
      <div className="text-sm font-semibold text-slate-800 truncate">{group.name}</div>
      <div className="text-xs text-slate-400 truncate">
        <Users className="inline w-3 h-3 mr-1 -mt-0.5" />
        {group.privacy === 'public' ? 'Nhóm công khai' : 'Nhóm riêng tư'} · {group.membersCount} thành viên
      </div>
    </div>
    <ReasonChips reasons={dense ? reasons.slice(0, 1) : reasons} className="shrink-0 justify-end" />
  </Link>
);

export const PageResult: React.FC<RowProps & { page: Page; reasons: string[] }> = ({ page, reasons, onClick, dense }) => (
  <Link to={`/pages/${page.id}`} onClick={onClick} className={rowClass(dense)}>
    <SquareAvatar item={page} size="size-10" />
    <div className="min-w-0 flex-1">
      <div className="text-sm font-semibold text-slate-800 truncate">{page.name}</div>
      <div className="text-xs text-slate-400 truncate">
        Trang · {categoryLabel(page.category)} · {page.followersCount} người theo dõi
      </div>
    </div>
    <ReasonChips reasons={dense ? reasons.slice(0, 1) : reasons} className="shrink-0 justify-end" />
  </Link>
);

export const PostResult: React.FC<RowProps & { post: Post; reasons: string[]; query: string }> = ({ post, reasons, query, onClick, dense }) => {
  const Icon = post.kind === 'reel' ? Clapperboard : FileText;
  const by = post.pageName || post.author.name;
  return (
    <Link to={postHref(post)} onClick={onClick} className={`${rowClass(dense)} items-start`}>
      <span className="size-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-800 break-words line-clamp-2">{snippet(post.content, query) || (post.kind === 'reel' ? 'Reel' : 'Bài viết')}</div>
        <div className="mt-0.5 text-xs text-slate-400 truncate">
          {by}
          {post.groupName ? ` · ${post.groupName}` : ''} · {timeAgo(post.createdAt)}
        </div>
        {!dense && <ReasonChips reasons={reasons} className="mt-1" />}
      </div>
      {dense && <ReasonChips reasons={reasons.slice(0, 1)} className="shrink-0 justify-end" />}
    </Link>
  );
};

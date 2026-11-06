import { Doc, getId } from '../../formatResponse';

// Dạng JSON trả cho trang quản trị. Khác dữ liệu công khai: có email, trạng thái khoá, vai trò...

const iso = (d?: Date) => (d ? new Date(d).toISOString() : undefined);
const excerpt = (text: string | undefined, max = 120) => ((text || '').length > max ? `${(text || '').slice(0, max)}…` : text || '');

/** Người thực hiện / tác giả rút gọn (id, tên, username, ảnh). Chưa populate hoặc đã bị xoá → null. */
export const personToJson = (u: Doc) => (u?.name ? { id: getId(u), name: u.name, username: u.username, avatar: u.avatar } : null);

export const adminUserToJson = (u: Doc) => ({
  id: getId(u),
  name: u.name,
  username: u.username,
  email: u.email,
  avatar: u.avatar,
  role: u.role === 'admin' ? 'admin' : 'user',
  banned: !!u.banned,
  banReason: u.banReason,
  bannedAt: iso(u.bannedAt),
  isOnline: !!u.isOnline,
  emailVerified: u.emailVerified !== false,
  joinDate: iso(u.joinDate),
  lastActive: iso(u.lastActive),
});

/** Bài viết: loại = bài thường / reel / bài trong nhóm / bài của trang. */
export const adminPostToJson = (p: Doc) => ({
  id: getId(p),
  kind: p.kind === 'reel' ? 'reel' : p.group ? 'group' : p.page ? 'page' : 'post',
  content: excerpt(p.content, 300),
  mediaCount: p.images.length + (p.video ? 1 : 0),
  author: personToJson(p.author),
  groupName: p.group?.name,
  pageName: p.page?.name,
  privacy: p.privacy,
  groupStatus: p.group ? p.groupStatus : undefined,
  commentsCount: p.commentsCount,
  reactionsCount: p.reactions.length,
  createdAt: iso(p.createdAt),
});

export const adminCommentToJson = (c: Doc) => ({
  id: getId(c),
  content: c.content || (c.image ? '[Ảnh]' : ''),
  author: personToJson(c.author),
  postId: getId(c.post),
  postExcerpt: excerpt(c.post?.content, 80),
  isReply: !!c.parent,
  likesCount: c.likes.length,
  createdAt: iso(c.createdAt),
});

export const adminGroupToJson = (g: Doc, postsCount: number) => ({
  id: getId(g),
  name: g.name,
  description: excerpt(g.description, 200),
  privacy: g.privacy,
  avatar: g.avatar,
  owner: personToJson(g.owner),
  membersCount: g.membersCount,
  postsCount,
  createdAt: iso(g.createdAt),
});

export const adminPageToJson = (pg: Doc, postsCount: number) => ({
  id: getId(pg),
  name: pg.name,
  category: pg.category,
  avatar: pg.avatar,
  owner: personToJson(pg.owner),
  followersCount: pg.followersCount,
  postsCount,
  createdAt: iso(pg.createdAt),
});

export const adminReportToJson = (r: Doc) => ({
  id: getId(r),
  reporter: personToJson(r.reporter),
  targetType: r.targetType,
  targetId: r.targetId,
  targetName: r.targetName,
  reason: r.reason,
  description: r.description,
  status: r.status,
  resolutionNote: r.resolutionNote,
  handledBy: personToJson(r.handledBy),
  handledAt: iso(r.handledAt),
  createdAt: iso(r.createdAt),
});

export const announcementToJson = (a: Doc) => ({
  id: getId(a),
  title: a.title,
  message: a.message,
  type: a.type,
  createdBy: personToJson(a.createdBy),
  createdAt: iso(a.createdAt),
});

export const auditLogToJson = (l: Doc) => ({
  id: getId(l),
  admin: personToJson(l.admin),
  action: l.action,
  targetType: l.targetType,
  targetId: l.targetId,
  details: l.details,
  createdAt: iso(l.createdAt),
});

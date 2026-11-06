import type { AdminUser, AdminPost, AdminComment, AdminGroup, AdminPage, AdminReport, AdminPerson, Announcement, AuditLog, AdminStats, User } from '../../src/types';

// Phần backend giả dành cho KHU QUẢN TRỊ (/admin/*) và API báo cáo vi phạm (/reports). Tách riêng khỏi fakeServer.ts cho dễ đọc.
// Quản trị viên đăng nhập trong test: seed: () => { db.me = { ...db.me, role: 'admin' }; }

export interface AdminDb {
  users: AdminUser[];
  posts: AdminPost[];
  comments: AdminComment[];
  groups: AdminGroup[];
  pages: AdminPage[];
  reports: AdminReport[];
  announcements: Announcement[];
  logs: AuditLog[];
  reported: Set<string>; // "loại:id" các đối tượng mình đã báo cáo (để mô phỏng báo cáo trùng → 409)
}

const iso = (minutesAgo = 0) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const person = (id: string, name: string): AdminPerson => ({ id, name, username: name.toLowerCase().replace(/\s+/g, ''), avatar: `/avatars/${id}.png` });
const PEOPLE = { u1: person('u1', 'Trần Xuân Hoàng'), f1: person('f1', 'Bạn Một'), s1: person('s1', 'Người Lạ'), b1: person('b1', 'Kẻ Phá Hoại'), a2: person('a2', 'Admin Hai') };

/** Dữ liệu quản trị mặc định: 5 tài khoản (u1 và a2 là quản trị viên, b1 bị khoá), 4 bài (bài thường / reel / nhóm / trang), 2 bình luận, 1 nhóm, 1 trang, 3 báo cáo (2 chờ), 1 thông báo hệ thống, 1 dòng nhật ký. */
export function seedAdmin(): AdminDb {
  const user = (p: AdminPerson, extra: Partial<AdminUser> = {}): AdminUser => ({ ...p, email: `${p.id}@test.vn`, role: 'user', banned: false, isOnline: false, joinDate: '2024-01-15T00:00:00.000Z', ...extra });
  const post = (id: string, kind: AdminPost['kind'], author: AdminPerson, content: string, extra: Partial<AdminPost> = {}): AdminPost => ({
    id, kind, content, mediaCount: 0, author, privacy: 'public', commentsCount: 0, reactionsCount: 0, createdAt: iso(30), ...extra,
  });
  const report = (id: string, targetType: AdminReport['targetType'], targetId: string, targetName: string, extra: Partial<AdminReport> = {}): AdminReport => ({
    id, reporter: PEOPLE.f1, targetType, targetId, targetName, reason: 'spam', description: '', status: 'pending', handledBy: null, createdAt: iso(20), ...extra,
  });
  return {
    users: [
      user(PEOPLE.u1, { role: 'admin', isOnline: true }),
      user(PEOPLE.f1, { isOnline: true }),
      user(PEOPLE.s1),
      user(PEOPLE.b1, { banned: true, banReason: 'Spam liên tục', bannedAt: iso(500) }),
      user(PEOPLE.a2, { role: 'admin' }),
    ],
    posts: [
      post('ap1', 'post', PEOPLE.f1, 'Bài thường của bạn một', { mediaCount: 2, reactionsCount: 3, commentsCount: 1 }),
      post('ap2', 'reel', PEOPLE.s1, 'Reel của người lạ', { mediaCount: 1 }),
      post('ap3', 'group', PEOPLE.f1, 'Chia sẻ trong nhóm', { groupName: 'Nhóm Công Khai' }),
      post('ap4', 'page', PEOPLE.s1, 'Chia sẻ của trang', { pageName: 'Trang Công Nghệ' }),
    ],
    comments: [
      { id: 'ac1', content: 'Bình luận vi phạm', author: PEOPLE.s1, postId: 'ap1', postExcerpt: 'Bài thường của bạn một', isReply: false, likesCount: 0, createdAt: iso(15) },
      { id: 'ac2', content: 'Một câu trả lời', author: PEOPLE.f1, postId: 'ap1', postExcerpt: 'Bài thường của bạn một', isReply: true, likesCount: 1, createdAt: iso(10) },
    ],
    groups: [{ id: 'ag1', name: 'Nhóm Công Khai', description: 'Nơi giao lưu', privacy: 'public', owner: PEOPLE.u1, membersCount: 3, postsCount: 1, createdAt: iso(1000) }],
    pages: [{ id: 'apg1', name: 'Trang Công Nghệ', category: 'business', owner: PEOPLE.f1, followersCount: 5, postsCount: 1, createdAt: iso(2000) }],
    reports: [
      report('ar1', 'post', 'ap1', 'Bài thường của bạn một', { reason: 'spam', description: 'Quảng cáo lặp đi lặp lại' }),
      report('ar2', 'user', 'b1', 'Kẻ Phá Hoại', { reason: 'harassment', reporter: PEOPLE.s1 }),
      report('ar3', 'comment', 'ac1', 'Bình luận cũ', { status: 'resolved', handledBy: PEOPLE.u1, handledAt: iso(5), resolutionNote: 'Đã nhắc nhở' }),
    ],
    announcements: [{ id: 'an1', title: 'Bảo trì', message: 'Bảo trì lúc 2h sáng.', type: 'warning', createdBy: PEOPLE.u1, createdAt: iso(300) }],
    logs: [{ id: 'al1', admin: PEOPLE.u1, action: 'user.ban', targetType: 'user', targetId: 'b1', details: { reason: 'Spam liên tục' }, createdAt: iso(500) }],
    reported: new Set<string>(),
  };
}

type Handler = (m: RegExpMatchArray, body: any, q: URLSearchParams) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
type Register = (method: string, pattern: string, handler: Handler) => void;

/** Đăng ký các route /admin/* và /reports vào backend giả. */
export function registerAdminRoutes(route: Register, getDb: () => { admin: AdminDb; me: User }, fail: (status: number, message: string) => never) {
  const admin = () => getDb().admin;
  const requireAdmin = () => getDb().me.role === 'admin' || fail(403, 'Chỉ quản trị viên hệ thống mới có quyền này.');
  const guarded = (method: string, pattern: string, handler: Handler) =>
    route(method, pattern, (m, b, q) => {
      requireAdmin();
      return handler(m, b, q);
    });
  const log = (action: string, targetType: string, targetId: string, details?: Record<string, unknown>) =>
    admin().logs.unshift({ id: `al${admin().logs.length + 100}`, admin: PEOPLE.u1, action, targetType, targetId, details, createdAt: iso() });
  const page = <T>(rows: T[], q: URLSearchParams) => rows.slice(Number(q.get('skip')) || 0, (Number(q.get('skip')) || 0) + (Number(q.get('limit')) || 30));
  const has = (text: string, q: string) => text.toLowerCase().includes(q.toLowerCase());

  guarded('GET', '/admin/stats', () => {
    const a = admin();
    const stats: AdminStats = {
      users: a.users.length, online: a.users.filter((u) => u.isOnline).length, banned: a.users.filter((u) => u.banned).length, admins: a.users.filter((u) => u.role === 'admin').length, newToday: 1,
      posts: a.posts.filter((p) => p.kind !== 'reel').length, reels: a.posts.filter((p) => p.kind === 'reel').length, comments: a.comments.length, groups: a.groups.length, pages: a.pages.length,
      pendingReports: a.reports.filter((r) => r.status === 'pending').length,
    };
    return { stats };
  });

  guarded('GET', '/admin/users', (_m, _b, q) => {
    const term = q.get('q') || '';
    const filters: Record<string, (u: AdminUser) => boolean> = { admin: (u) => u.role === 'admin', user: (u) => u.role !== 'admin', banned: (u) => u.banned, online: (u) => u.isOnline };
    const rows = admin().users.filter((u) => (!term || has(`${u.name} ${u.username} ${u.email}`, term)) && (filters[q.get('filter') ?? '']?.(u) ?? true));
    return { users: page(rows, q), total: rows.length };
  });
  guarded('PATCH', '/admin/users/([^/]+)/ban', (m, b) => {
    const target = admin().users.find((u) => u.id === m[1]) ?? fail(404, 'Không tìm thấy người dùng.');
    if (target.id === getDb().me.id) fail(400, 'Bạn không thể tự khoá tài khoản của mình.');
    if (b.banned && target.role === 'admin') fail(400, 'Hãy thu hồi quyền quản trị trước khi khoá tài khoản này.');
    Object.assign(target, { banned: b.banned, banReason: b.banned ? b.reason || undefined : undefined, isOnline: b.banned ? false : target.isOnline });
    log(b.banned ? 'user.ban' : 'user.unban', 'user', target.id, b.banned ? { reason: b.reason } : undefined);
    return { user: target };
  });
  guarded('PATCH', '/admin/users/([^/]+)/role', (m, b) => {
    const target = admin().users.find((u) => u.id === m[1]) ?? fail(404, 'Không tìm thấy người dùng.');
    if (target.id === getDb().me.id) fail(400, 'Bạn không thể tự đổi quyền của mình.');
    target.role = b.role;
    log('user.role', 'user', target.id, { role: b.role });
    return { user: target };
  });

  guarded('GET', '/admin/posts', (_m, _b, q) => {
    const term = q.get('q') || '';
    const rows = admin().posts.filter((p) => (!term || has(`${p.content} ${p.author?.name}`, term)) && (!q.get('kind') || p.kind === q.get('kind')));
    return { posts: page(rows, q), total: rows.length };
  });
  guarded('GET', '/admin/comments', (_m, _b, q) => {
    const term = q.get('q') || '';
    const rows = admin().comments.filter((c) => !term || has(`${c.content} ${c.author?.name}`, term));
    return { comments: page(rows, q), total: rows.length };
  });
  guarded('GET', '/admin/groups', (_m, _b, q) => {
    const rows = admin().groups.filter((g) => !q.get('q') || has(`${g.name} ${g.description}`, q.get('q')!));
    return { groups: page(rows, q), total: rows.length };
  });
  guarded('GET', '/admin/pages', (_m, _b, q) => {
    const rows = admin().pages.filter((p) => !q.get('q') || has(p.name, q.get('q')!));
    return { pages: page(rows, q), total: rows.length };
  });
  const removable = { posts: 'post', comments: 'comment', groups: 'group', pages: 'page' } as const;
  for (const [path, type] of Object.entries(removable)) {
    guarded('DELETE', `/admin/${path}/([^/]+)`, (m) => {
      const a = admin();
      const list = a[path as keyof typeof removable] as { id: string }[];
      if (!list.some((x) => x.id === m[1])) fail(404, 'Không tìm thấy nội dung.');
      (a[path as keyof typeof removable] as { id: string }[]) = list.filter((x) => x.id !== m[1]);
      log(`${type}.delete`, type, m[1]);
      return { ok: true };
    });
  }

  guarded('GET', '/admin/reports', (_m, _b, q) => {
    const term = q.get('q') || '';
    const rows = admin().reports.filter((r) => (!q.get('status') || r.status === q.get('status')) && (!term || has(`${r.targetName} ${r.description} ${r.reporter?.name}`, term)));
    return { reports: page(rows, q), total: rows.length, pending: admin().reports.filter((r) => r.status === 'pending').length };
  });
  guarded('PATCH', '/admin/reports/([^/]+)', (m, b) => {
    const a = admin();
    const report = a.reports.find((r) => r.id === m[1]) ?? fail(404, 'Không tìm thấy báo cáo.');
    if (report.status !== 'pending') fail(409, 'Báo cáo này đã được xử lý.');
    if (b.removeContent) {
      const plural = Object.entries(removable).find(([, type]) => type === report.targetType)![0] as keyof typeof removable;
      (a[plural] as { id: string }[]) = (a[plural] as { id: string }[]).filter((x) => x.id !== report.targetId);
      a.reports.filter((r) => r.targetType === report.targetType && r.targetId === report.targetId && r.status === 'pending').forEach((r) => Object.assign(r, { status: b.status, handledBy: PEOPLE.u1 }));
    }
    Object.assign(report, { status: b.status, resolutionNote: b.note || undefined, handledBy: PEOPLE.u1, handledAt: iso() });
    log(`report.${b.status === 'resolved' ? 'resolve' : 'dismiss'}`, 'report', report.id);
    return { report };
  });

  guarded('GET', '/admin/announcements', () => ({ announcements: admin().announcements }));
  guarded('POST', '/admin/announcements', (_m, b) => {
    const announcement: Announcement = { id: `an${admin().announcements.length + 100}`, title: b.title, message: b.message, type: b.type, createdBy: PEOPLE.u1, createdAt: iso() };
    admin().announcements.unshift(announcement);
    log('announcement.create', 'announcement', announcement.id, { title: b.title });
    return { announcement };
  });
  guarded('DELETE', '/admin/announcements/([^/]+)', (m) => {
    admin().announcements = admin().announcements.filter((x) => x.id !== m[1]);
    return { ok: true };
  });
  guarded('GET', '/admin/audit-logs', (_m, _b, q) => ({ logs: page(admin().logs, q), total: admin().logs.length }));

  // Báo cáo vi phạm của người dùng thường
  route('POST', '/reports', (_m, b) => {
    const key = `${b.targetType}:${b.targetId}`;
    if (admin().reported.has(key)) fail(409, 'Bạn đã báo cáo nội dung này rồi. Quản trị viên sẽ xem xét sớm.');
    admin().reported.add(key);
    return { ok: true };
  });
}

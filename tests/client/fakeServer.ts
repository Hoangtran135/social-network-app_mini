import type { User, Post, Comment, Story, Conversation, Message, FriendRequest, NotificationItem, Group, GroupMember, Page } from '../../src/types';

// BACKEND GIẢ trong bộ nhớ cho test giao diện: thay module src/utils/api + src/utils/socket.
// Nó mô phỏng các endpoint mà frontend gọi, đủ trung thực để test cả luồng (đăng nhập → xem bảng tin → đăng bài → bình luận...).
// Dùng trong test:
//   vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
//   vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let seq = 1000;
const nextId = (prefix: string) => `${prefix}${++seq}`;
const iso = (minutesAgo = 0) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

export const makeUser = (id: string, name: string, extra: Partial<User> = {}): User => ({
  id, name, username: name.toLowerCase().replace(/\s+/g, ''), email: `${id}@test.vn`, avatar: `/avatars/${id}.png`,
  joinDate: '2024-01-15T00:00:00.000Z', friendsCount: 0, isOnline: false, ...extra,
});

interface Db {
  me: User; users: User[]; friends: string[]; posts: Post[]; comments: Comment[]; stories: Story[];
  requestsIn: FriendRequest[]; requestsOut: FriendRequest[]; conversations: Conversation[]; messages: Record<string, Message[]>;
  notifications: NotificationItem[]; memories: Post[]; blocked: string[]; hidden: string[]; following: string[]; passwords: Record<string, string>; failNext: Set<string>;
  pages: Page[]; pageFollows: string[]; pageAdmins: Record<string, string[]>;
  groups: Group[]; members: Record<string, GroupMember[]>; reports: { id: string; groupId: string; postId: string; reporterId: string; reason: string }[];
}

export const calls: { method: string; path: string; body?: unknown }[] = [];
/** Các sự kiện socket mà trình duyệt GỬI LÊN server (typing, message:delivered...). */
export const emitted: { event: string; payload: unknown }[] = [];
export const db = {} as Db;

/** Dựng lại dữ liệu mặc định: tôi (u1) có 2 bạn (f1 online, f2), 1 người lạ (s1), 1 lời mời đến (s2), 1 lời mời đi (s3), vài bài viết. */
export function resetDb() {
  seq = 1000;
  calls.length = 0;
  emitted.length = 0;
  const me = makeUser('u1', 'Trần Xuân Hoàng', { bio: 'Sinh viên', workplace: 'FPT', education: 'Bách Khoa', location: 'Hà Nội', website: 'example.com' });
  const f1 = makeUser('f1', 'Bạn Một', { isOnline: true, location: 'Đà Nẵng' });
  const f2 = makeUser('f2', 'Bạn Hai');
  const s1 = makeUser('s1', 'Người Lạ');
  const s2 = makeUser('s2', 'Người Mời', { workplace: 'VNG' });
  const s3 = makeUser('s3', 'Người Được Mời');
  const post = (id: string, author: User, content: string, extra: Partial<Post> = {}): Post => ({
    id, author, content, privacy: 'public', createdAt: iso(60), reactions: [], commentsCount: 0, sharesCount: 0, isSaved: false, pinned: false, ...extra,
  });
  Object.assign(db, {
    me: { ...me, blockedUserIds: [] },
    users: [me, f1, f2, s1, s2, s3],
    friends: ['f1', 'f2'],
    posts: [
      post('p1', f1, 'Bài của bạn một', { createdAt: iso(5), images: ['/img/1.png'] }),
      post('p2', me, 'Bài của tôi', { createdAt: iso(30), reactions: [{ type: 'like', userId: 'f1', userName: 'Bạn Một' }], commentsCount: 1 }),
      post('p3', s1, 'Bài của người lạ', { createdAt: iso(90) }),
      post('p4', f2, 'Bài của bạn hai (chỉ bạn bè)', { createdAt: iso(120), privacy: 'friends' }),
    ],
    comments: [{ id: 'c1', postId: 'p2', author: f1, content: 'Bình luận đầu tiên', createdAt: iso(20), likes: [] }],
    stories: [{ id: 'st1', user: f1, type: 'text', privacy: 'public', textContent: 'Story của bạn một', backgroundGradient: 'from-a to-b', createdAt: iso(10), expiresAt: iso(-1000), viewers: [] }],
    requestsIn: [{ id: 'r1', sender: s2, receiverId: 'u1', createdAt: iso(3) }],
    requestsOut: [{ id: 'r2', sender: me, receiverId: 's3', receiver: s3, createdAt: iso(4) }],
    conversations: [{ id: 'cv1', isGroup: false, participants: [me, f1], nicknames: {}, unreadCount: 2, updatedAt: iso(2) }],
    messages: {
      cv1: [
        { id: 'm1', conversationId: 'cv1', kind: 'text', senderId: 'f1', senderName: 'Bạn Một', senderAvatar: '/avatars/f1.png', content: 'Xin chào', createdAt: iso(3), isRead: false },
        { id: 'm2', conversationId: 'cv1', kind: 'text', senderId: 'u1', senderName: 'Trần Xuân Hoàng', senderAvatar: '/avatars/u1.png', content: 'Chào bạn', createdAt: iso(2), isRead: true },
      ],
    },
    notifications: [
      { id: 'n1', userId: 'u1', actor: f1, type: 'like', content: 'đã thả cảm xúc về bài viết của bạn', targetId: 'p2', targetType: 'post', isRead: false, createdAt: iso(1) },
      { id: 'n2', userId: 'u1', actor: s2, type: 'friend_request', content: 'đã gửi lời mời kết bạn', targetId: 's2', targetType: 'profile', isRead: false, createdAt: iso(3) },
      { id: 'n3', userId: 'u1', actor: f2, type: 'comment', content: 'đã bình luận bài viết của bạn', targetId: 'p2', targetType: 'post', isRead: true, createdAt: iso(50) },
      { id: 'n4', userId: 'u1', actor: f2, type: 'friend_accept', content: 'đã chấp nhận lời mời', targetId: 'f2', targetType: 'profile', isRead: true, createdAt: iso(70) },
    ],
    memories: [post('mem1', me, 'Kỷ niệm năm ngoái', { createdAt: new Date(Date.now() - 365 * 86400000).toISOString() })],
    blocked: [],
    hidden: [],
    following: [],
    passwords: { 'u1@test.vn': 'secret123' },
    failNext: new Set<string>(),
    ...seedGroups(me, f1, f2, s1, s2),
    ...seedPages(me, f1, f2),
  });
  db.posts.push(...seedReels(f1, s1));
  conversationsFix();
}
/** Dữ liệu Trang mặc định: pg1 "Trang Công Nghệ" (f1 là chủ, tôi chưa theo dõi); pg2 "Tiệm Của Tôi" (tôi là chủ, f2 là quản trị viên); pg3 "Trang Đã Theo Dõi" (f2 là chủ, tôi đang theo dõi). */
function seedPages(me: User, f1: User, f2: User) {
  const base = { category: 'business', description: '', followersCount: 0, createdAt: iso(2000), myRole: null, isFollowing: false } as const;
  const pages: Page[] = [
    { ...base, id: 'pg1', name: 'Trang Công Nghệ', ownerId: f1.id, followersCount: 5, description: 'Tin công nghệ mỗi ngày', website: 'https://cn.example' },
    { ...base, id: 'pg2', name: 'Tiệm Của Tôi', ownerId: me.id, followersCount: 1, category: 'brand', address: 'Hà Nội' },
    { ...base, id: 'pg3', name: 'Trang Đã Theo Dõi', ownerId: f2.id, followersCount: 9 },
  ];
  return { pages, pageFollows: ['pg3'], pageAdmins: { pg2: [f2.id] } as Record<string, string[]> };
}

/** Hai reel mặc định: của bạn một (công khai) và của người lạ (công khai). */
function seedReels(f1: User, s1: User): Post[] {
  const reel = (id: string, author: User, caption: string): Post => ({ id, author, content: caption, video: `/videos/${id}.mp4`, privacy: 'public', createdAt: iso(10), reactions: [], commentsCount: 0, sharesCount: 0, kind: 'reel', viewsCount: 3 });
  return [reel('rl1', f1, 'Reel của bạn một #vui'), reel('rl2', s1, 'Reel của người lạ')];
}

/** Dữ liệu nhóm mặc định: g1 công khai (tôi là CHỦ NHÓM, f2 quản trị viên, f1 thành viên); g2 riêng tư có câu hỏi + duyệt bài (f1 là chủ, tôi CHƯA tham gia, s2 đang chờ duyệt); g3 công khai (tôi là thành viên thường). */
function seedGroups(me: User, f1: User, f2: User, s1: User, s2: User) {
  const base = { rules: [] as string[], joinQuestions: [] as string[], postApproval: false, description: '', membersCount: 0, createdAt: iso(1000), myRole: null, myStatus: null } as const;
  const groups: Group[] = [
    { ...base, id: 'g1', name: 'Nhóm Công Khai', privacy: 'public', ownerId: me.id, description: 'Nơi giao lưu mở', rules: ['Tôn trọng nhau', 'Không spam'] },
    { ...base, id: 'g2', name: 'Nhóm Riêng Tư', privacy: 'private', ownerId: f1.id, joinQuestions: ['Bạn là ai?'], postApproval: true, description: 'Chỉ thành viên' },
    { ...base, id: 'g3', name: 'Nhóm Của Bạn Một', privacy: 'public', ownerId: f1.id },
  ];
  const mem = (user: User, role: GroupMember['role'], status: GroupMember['status'] = 'active', answers?: GroupMember['answers']): GroupMember => ({ user, role, status, joinedAt: iso(500), answers });
  const members: Record<string, GroupMember[]> = {
    g1: [mem(me, 'owner'), mem(f2, 'admin'), mem(f1, 'member')],
    g2: [mem(f1, 'owner'), mem(f2, 'member'), mem(s2, 'member', 'pending', [{ question: 'Bạn là ai?', answer: 'Tôi là bạn của Hai' }])],
    g3: [mem(f1, 'owner'), mem(me, 'member'), mem(s1, 'member')],
  };
  return { groups, members, reports: [] };
}
const conversationsFix = () => {
  db.conversations[0].lastMessage = db.messages.cv1[1];
};

const byId = (id: string) => db.users.find((u) => u.id === id);
const isFriend = (id: string) => db.friends.includes(id);
const fail = (status: number, message: string): never => {
  throw new ApiError(status, message);
};
const publicUser = (u: User) => u;

type Handler = (m: RegExpMatchArray, body: any, q: URLSearchParams) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, handler: Handler) => routes.push([method, new RegExp(`^${pattern}$`), handler]);

// ---------- Tài khoản ----------
route('GET', '/auth/me', () => {
  if (!token) fail(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  return { user: db.me };
});
route('POST', '/auth/login', (_m, b) => {
  const user = db.users.find((u) => u.email === String(b.email).toLowerCase());
  if (!user || db.passwords[user.email!] !== b.password) fail(401, 'Email hoặc mật khẩu không chính xác.');
  db.me = { ...user!, blockedUserIds: db.blocked };
  return { token: 'token-' + user!.id, user: db.me };
});
route('POST', '/auth/register', (_m, b) => {
  if (db.users.some((u) => u.email === b.email || u.username === b.username)) fail(409, 'Email hoặc username đã được sử dụng.');
  const user = makeUser(nextId('n'), b.name, { username: b.username, email: b.email });
  db.users.push(user);
  db.passwords[b.email] = b.password;
  db.me = { ...user, blockedUserIds: [], emailVerified: false }; // tài khoản mới chưa xác minh email
  return { token: 'token-' + user.id, user: db.me };
});
route('POST', '/auth/verify-email', (_m, b) => {
  if (b.token !== 'good-token') fail(400, 'Liên kết xác minh không hợp lệ hoặc đã hết hạn.');
  db.me = { ...db.me, emailVerified: true };
  return { ok: true };
});
route('POST', '/auth/resend-verification', () => ({ ok: true }));
route('POST', '/auth/logout', () => ({ ok: true }));
route('POST', '/auth/forgot-password', () => ({ ok: true }));
route('POST', '/auth/reset-password', (_m, b) => {
  if (b.token !== 'good-token') fail(400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
  return { ok: true };
});

// ---------- Người dùng ----------
route('GET', '/users', (_m, _b, q) => {
  const term = (q.get('q') || '').toLowerCase();
  const users = db.users.filter((u) => !term || `${u.name} ${u.username}`.toLowerCase().includes(term)).slice(0, Number(q.get('limit')) || 60);
  return { users, total: users.length };
});
route('GET', '/users/me/following', () => ({ users: db.following.map(byId) }));
route('GET', '/users/([^/]+)/follow-stats', (m) => ({
  followersCount: 2 + (db.following.includes(m[1]) ? 1 : 0),
  followingCount: m[1] === db.me.id ? db.following.length : 5,
  isFollowing: db.following.includes(m[1]),
}));
route('POST', '/users/([^/]+)/follow', (m) => {
  if (!db.following.includes(m[1])) db.following.push(m[1]);
  return { ok: true, isFollowing: true, followersCount: 3 };
});
route('DELETE', '/users/([^/]+)/follow', (m) => {
  db.following = db.following.filter((id) => id !== m[1]);
  return { ok: true, isFollowing: false, followersCount: 2 };
});
route('GET', '/users/me/blocked', () => ({ users: db.users.filter((u) => db.blocked.includes(u.id)) }));
route('GET', '/users/([^/]+)', (m) => {
  const user = byId(m[1]);
  if (!user || db.blocked.includes(user.id)) fail(404, 'Không tìm thấy người dùng.');
  return { user: publicUser(user!) };
});
route('PATCH', '/users/me', (_m, b) => {
  db.me = { ...db.me, ...b };
  db.users = db.users.map((u) => (u.id === db.me.id ? db.me : u));
  return { user: db.me };
});
route('PATCH', '/users/me/password', (_m, b) => {
  if (b.currentPassword !== db.passwords[db.me.email!]) fail(400, 'Mật khẩu hiện tại không chính xác.');
  db.passwords[db.me.email!] = b.newPassword;
  return { ok: true };
});
route('POST', '/users/([^/]+)/block', (m) => {
  db.blocked.push(m[1]);
  db.friends = db.friends.filter((f) => f !== m[1]);
  db.me = { ...db.me, blockedUserIds: [...db.blocked] };
  return { user: db.me };
});
route('DELETE', '/users/([^/]+)/block', (m) => {
  db.blocked = db.blocked.filter((b) => b !== m[1]);
  db.me = { ...db.me, blockedUserIds: [...db.blocked] };
  return { user: db.me };
});

// ---------- Bài viết ----------
const withSaved = (p: Post) => ({ ...p });
const findPost = (id: string) => db.posts.find((p) => p.id === id) || fail(404, 'Không tìm thấy bài viết.');
route('GET', '/posts', (_m, _b, q) => {
  // (reel và bài nhóm không có ở bảng tin chung — giống server)
  const skip = Number(q.get('skip')) || 0;
  const limit = Number(q.get('limit')) || 30;
  const tag = q.get('tag')?.toLowerCase();
  const list = db.posts.filter((p) => !p.groupId && !p.kind && !db.blocked.includes(p.author.id) && !db.hidden.includes(p.id) && (!tag || (p.hashtags || []).includes(tag)));
  return { posts: list.slice(skip, skip + limit).map(withSaved) };
});
route('GET', '/posts/memories', () => ({ posts: db.memories }));
route('GET', '/posts/([^/]+)', (m) => ({ post: withSaved(findPost(m[1])) }));
route('POST', '/posts', (_m, b) => {
  const wall = b.wallOwnerId ? byId(b.wallOwnerId) : undefined;
  const post: Post = {
    id: nextId('p'), author: db.me, content: b.content, images: b.images?.length ? b.images : undefined, video: b.video, privacy: b.privacy || 'public',
    feeling: b.feeling, createdAt: iso(0), reactions: [], commentsCount: 0, sharesCount: 0, isSaved: false, pinned: false,
    location: b.location, hashtags: (String(b.content).match(/(?:^|\s)#([\p{L}\p{N}_]+)/gu) || []).map((t: string) => t.trim().slice(1).toLowerCase()), commentsDisabled: false,
    wallOwnerId: wall?.id, wallOwnerName: wall?.name, taggedUsers: (b.taggedUserIds || []).map(byId).filter(Boolean) as User[],
  };
  db.posts.unshift(post);
  return { post };
});
route('PATCH', '/posts/([^/]+)', (m, b) => {
  const post = findPost(m[1]);
  if (b.content !== undefined && b.content !== post.content) post.editHistory = [...(post.editHistory || []), { content: post.content, editedAt: iso(0) }];
  Object.assign(post, b, { updatedAt: iso(0) });
  return { post };
});
route('DELETE', '/posts/([^/]+)', (m) => {
  db.posts = db.posts.filter((p) => p.id !== m[1]);
  return { ok: true };
});
route('POST', '/posts/([^/]+)/react', (m, b) => {
  const post = findPost(m[1]);
  const mine = post.reactions.find((r) => r.userId === db.me.id);
  post.reactions = post.reactions.filter((r) => r.userId !== db.me.id);
  if (!mine || mine.type !== b.type) post.reactions.push({ type: b.type, userId: db.me.id, userName: db.me.name });
  return { post };
});
route('POST', '/posts/([^/]+)/pin', (m) => {
  const post = findPost(m[1]);
  post.pinned = !post.pinned;
  return { post };
});
route('POST', '/posts/([^/]+)/toggle-comments', (m) => {
  const post = findPost(m[1]);
  post.commentsDisabled = !post.commentsDisabled;
  return { post };
});
route('POST', '/posts/([^/]+)/hide', (m) => {
  db.hidden.push(m[1]);
  return { ok: true };
});
route('DELETE', '/posts/([^/]+)/hide', (m) => {
  db.hidden = db.hidden.filter((id) => id !== m[1]);
  return { ok: true };
});
route('POST', '/posts/([^/]+)/save', (m) => {
  const post = findPost(m[1]);
  post.isSaved = !post.isSaved;
  return { post };
});
route('POST', '/posts/([^/]+)/share', (m, b) => {
  const original = findPost(m[1]);
  original.sharesCount++;
  const post: Post = { id: nextId('p'), author: db.me, content: `${b.message ? `${b.message}\n\n` : ''}[Chia sẻ]: ${original.content}`, privacy: 'public', createdAt: iso(0), reactions: [], commentsCount: 0, sharesCount: 0 };
  db.posts.unshift(post);
  return { post };
});

// ---------- Bình luận ----------
route('GET', '/comments', (_m, _b, q) => ({ comments: db.comments.filter((c) => c.postId === q.get('postId')) }));
route('POST', '/comments', (_m, b) => {
  if (db.posts.find((p) => p.id === b.postId)?.commentsDisabled) fail(403, 'Chủ bài viết đã tắt bình luận.');
  const comment: Comment = { id: nextId('c'), postId: b.postId, author: db.me, content: b.content, image: b.image, createdAt: iso(0), likes: [], parentId: b.parentId, taggedUsers: (b.taggedUserIds || []).map(byId).filter(Boolean) as User[] };
  db.comments.push(comment);
  return { comment };
});
route('DELETE', '/comments/([^/]+)', (m) => {
  db.comments = db.comments.filter((c) => c.id !== m[1]);
  return { ok: true };
});
route('PATCH', '/comments/([^/]+)', (m, b) => {
  const comment = db.comments.find((c) => c.id === m[1]) || fail(404, 'Không tìm thấy bình luận.');
  comment.content = b.content;
  comment.editedAt = iso(0);
  return { comment };
});
route('POST', '/comments/([^/]+)/react', (m, b) => {
  const comment = db.comments.find((c) => c.id === m[1]) || fail(404, 'Không tìm thấy bình luận.');
  const me = db.me.id;
  const all = comment.reactions ?? comment.likes.map((userId) => ({ type: 'like' as const, userId }));
  const current = all.find((r) => r.userId === me)?.type;
  comment.reactions = all.filter((r) => r.userId !== me);
  comment.likes = comment.likes.filter((id) => id !== me);
  if (current !== b.type) {
    comment.reactions.push({ type: b.type, userId: me });
    if (b.type === 'like') comment.likes.push(me);
  }
  return { comment };
});
route('POST', '/comments/([^/]+)/like', (m) => {
  const comment = db.comments.find((c) => c.id === m[1])!;
  comment.likes = comment.likes.includes(db.me.id) ? comment.likes.filter((x) => x !== db.me.id) : [...comment.likes, db.me.id];
  return { comment };
});

// ---------- Story ----------
route('GET', '/stories', () => ({ stories: db.stories }));
route('POST', '/stories', (_m, b) => {
  const story: Story = { id: nextId('st'), user: db.me, type: b.type, privacy: b.privacy, mediaUrl: b.mediaUrl, textContent: b.textContent, backgroundGradient: b.backgroundGradient, createdAt: iso(0), expiresAt: iso(-1000), viewers: [] };
  db.stories.unshift(story);
  return { story };
});
route('DELETE', '/stories/([^/]+)', (m) => {
  db.stories = db.stories.filter((s) => s.id !== m[1]);
  return { ok: true };
});
route('POST', '/stories/([^/]+)/view', (m) => {
  const story = db.stories.find((s) => s.id === m[1])!;
  if (story.user.id !== db.me.id && !story.viewers.some((v) => v.userId === db.me.id)) story.viewers.push({ userId: db.me.id, userName: db.me.name, avatar: db.me.avatar, viewedAt: iso(0) });
  return { story };
});

route('POST', '/stories/([^/]+)/react', (m, b) => {
  const story = db.stories.find((s) => s.id === m[1]) || fail(404, 'Không tìm thấy story.');
  const mine = (story.reactions || []).find((r) => r.userId === db.me.id);
  story.reactions = (story.reactions || []).filter((r) => r.userId !== db.me.id);
  if (mine?.emoji !== b.emoji) story.reactions.push({ userId: db.me.id, userName: db.me.name, avatar: db.me.avatar, emoji: b.emoji });
  return { story };
});

// ---------- Bạn bè ----------
route('GET', '/friends', () => ({ friends: db.friends.map(byId) }));
route('GET', '/friends/of/([^/]+)', (m) => ({ friends: (m[1] === db.me.id ? db.friends : ['f2', 's1']).map(byId) }));
route('GET', '/friends/suggestions', () => ({ users: db.users.filter((u) => u.id !== db.me.id && !isFriend(u.id) && !db.requestsIn.some((r) => r.sender.id === u.id) && !db.requestsOut.some((r) => r.receiverId === u.id) && !db.blocked.includes(u.id)) }));
route('GET', '/friends/requests', () => ({ requests: db.requestsIn }));
route('GET', '/friends/requests/sent', () => ({ requests: db.requestsOut }));
route('POST', '/friends/requests', (_m, b) => {
  const target = byId(b.targetUserId) || fail(404, 'Không tìm thấy người dùng.');
  const request: FriendRequest = { id: nextId('r'), sender: db.me, receiverId: target.id, receiver: target, createdAt: iso(0) };
  db.requestsOut.push(request);
  return { request };
});
route('POST', '/friends/requests/([^/]+)/accept', (m) => {
  const request = db.requestsIn.find((r) => r.id === m[1]) || fail(404, 'Không tìm thấy lời mời.');
  db.requestsIn = db.requestsIn.filter((r) => r.id !== m[1]);
  db.friends.push(request.sender.id);
  return { ok: true };
});
route('POST', '/friends/requests/([^/]+)/reject', (m) => {
  db.requestsIn = db.requestsIn.filter((r) => r.id !== m[1]);
  return { ok: true };
});
route('DELETE', '/friends/requests/([^/]+)', (m) => {
  db.requestsOut = db.requestsOut.filter((r) => r.id !== m[1]);
  return { ok: true };
});
route('DELETE', '/friends/([^/]+)', (m) => {
  db.friends = db.friends.filter((f) => f !== m[1]);
  return { ok: true };
});

// ---------- Tin nhắn ----------
route('GET', '/messages/conversations', () => ({ conversations: db.conversations }));
route('POST', '/messages/conversations', (_m, b) => {
  if (b.participantIds) {
    const conversation: Conversation = { id: nextId('cv'), isGroup: true, name: b.name, avatar: '/group.png', participants: [db.me, ...b.participantIds.map(byId)], nicknames: {}, unreadCount: 0, updatedAt: iso(0) };
    db.conversations.unshift(conversation);
    db.messages[conversation.id] = [];
    return { conversation };
  }
  const other = byId(b.participantId) || fail(404, 'Không tìm thấy người dùng.');
  const existing = db.conversations.find((c) => !c.isGroup && c.participants.some((p) => p.id === other.id));
  if (existing) return { conversation: existing };
  const conversation: Conversation = { id: nextId('cv'), isGroup: false, participants: [db.me, other], nicknames: {}, unreadCount: 0, updatedAt: iso(0) };
  db.conversations.unshift(conversation);
  db.messages[conversation.id] = [];
  return { conversation };
});
const addMessage = (convId: string, data: Partial<Message>): Message => {
  const message: Message = { id: nextId('m'), conversationId: convId, kind: 'text', senderId: db.me.id, senderName: db.me.name, senderAvatar: db.me.avatar, content: '', createdAt: iso(0), isRead: false, ...data };
  (db.messages[convId] ||= []).push(message);
  return message;
};
route('GET', '/messages/conversations/([^/]+)/messages', (m) => {
  const list = db.messages[m[1]] || fail(404, 'Không tìm thấy cuộc trò chuyện.');
  const conv = db.conversations.find((c) => c.id === m[1]);
  if (conv) conv.unreadCount = 0;
  return { messages: list };
});
route('POST', '/messages/conversations/([^/]+)/messages', (m, b) => ({ message: addMessage(m[1], { content: b.content, attachments: b.attachments }) }));
route('POST', '/messages/conversations/([^/]+)/share-post', (m, b) => ({ message: addMessage(m[1], { sharedPostId: b.postId }) }));
route('PATCH', '/messages/conversations/([^/]+)/nickname', (m, b) => {
  const conversation = db.conversations.find((c) => c.id === m[1])!;
  conversation.nicknames = { ...conversation.nicknames };
  if (b.nickname) conversation.nicknames[b.userId] = b.nickname;
  else delete conversation.nicknames[b.userId];
  const systemMessage = addMessage(m[1], { kind: 'system', senderId: '', content: b.nickname ? `đã đặt biệt danh "${b.nickname}"` : 'đã xóa biệt danh' });
  return { conversation, systemMessage };
});
route('DELETE', '/messages/conversations/([^/]+)/messages/([^/]+)', (m) => {
  const message = db.messages[m[1]].find((x) => x.id === m[2])!;
  Object.assign(message, { isRecalled: true, content: '', attachments: undefined, reactions: undefined });
  return { message };
});
route('POST', '/messages/conversations/([^/]+)/messages/([^/]+)/delete-for-me', (m) => {
  db.messages[m[1]] = (db.messages[m[1]] || []).filter((x) => x.id !== m[2]);
  return { ok: true };
});
route('POST', '/messages/conversations/([^/]+)/messages/([^/]+)/react', (m, b) => {
  const message = db.messages[m[1]].find((x) => x.id === m[2])!;
  const reactions = { ...(message.reactions || {}) };
  if (reactions[db.me.id] === b.emoji) delete reactions[db.me.id];
  else reactions[db.me.id] = b.emoji;
  message.reactions = Object.keys(reactions).length ? reactions : undefined;
  return { message };
});

// ---------- Nhóm giao lưu ----------
// Mô phỏng đúng luật của server: nhóm công khai vào luôn / riêng tư chờ duyệt, vai trò chủ nhóm > quản trị viên > thành viên,
// bài chờ duyệt, báo cáo, và bài nhóm KHÔNG có trong GET /posts (chỉ xem ở trang nhóm).
const gMembership = (g: Group, userId = db.me.id) => db.members[g.id]?.find((m) => m.user.id === userId);
const gRole = (g: Group) => {
  const m = gMembership(g);
  return m?.status === 'active' ? m.role : null;
};
const gIsAdmin = (g: Group) => gRole(g) === 'owner' || gRole(g) === 'admin';
const findGroup = (id: string) => db.groups.find((g) => g.id === id) || fail(404, 'Không tìm thấy nhóm.');
const countActive = (g: Group) => (db.members[g.id] || []).filter((m) => m.status === 'active').length;
const groupJson = (g: Group): Group => {
  const m = gMembership(g);
  const admin = gIsAdmin(g);
  return {
    ...g,
    membersCount: countActive(g),
    myRole: gRole(g),
    myStatus: m?.status ?? null,
    ...(admin
      ? {
          pendingMembersCount: (db.members[g.id] || []).filter((x) => x.status === 'pending').length,
          pendingPostsCount: db.posts.filter((p) => p.groupId === g.id && p.groupStatus === 'pending').length,
          openReportsCount: db.reports.filter((r) => r.groupId === g.id).length,
        }
      : {}),
  };
};
const groupNotify = (userId: string, g: Group, content: string) => {
  if (userId === db.me.id) return;
  db.notifications.unshift({ id: nextId('n'), userId, actor: db.me, type: 'system', content, targetId: g.id, targetType: 'group', isRead: false, createdAt: iso(0) });
};

route('GET', '/groups', (_m, _b, q) => {
  const mine = q.get('scope') === 'mine';
  const term = (q.get('q') || '').toLowerCase();
  const groups = db.groups.filter((g) => (mine ? gRole(g) !== null : gRole(g) === null) && g.name.toLowerCase().includes(term));
  return { groups: groups.map(groupJson) };
});
route('POST', '/groups', (_m, b) => {
  if (!b.name || String(b.name).trim().length < 2) fail(400, 'Dữ liệu không hợp lệ.');
  const g: Group = {
    id: nextId('g'), name: b.name, description: b.description || '', rules: b.rules || [], privacy: b.privacy || 'public', ownerId: db.me.id,
    postApproval: !!b.postApproval, joinQuestions: b.joinQuestions || [], membersCount: 1, createdAt: iso(0), myRole: 'owner', myStatus: 'active',
  };
  db.groups.unshift(g);
  db.members[g.id] = [{ user: db.me, role: 'owner', status: 'active', joinedAt: iso(0) }];
  return { group: groupJson(g) };
});
route('GET', '/groups/([^/]+)', (m) => ({ group: groupJson(findGroup(m[1])) }));
route('PATCH', '/groups/([^/]+)', (m, b) => {
  const g = findGroup(m[1]);
  if (!gIsAdmin(g)) fail(403, 'Chỉ quản trị viên nhóm mới có quyền này.');
  if (b.privacy !== undefined && b.privacy !== g.privacy && gRole(g) !== 'owner') fail(403, 'Chỉ chủ nhóm mới được đổi quyền riêng tư của nhóm.');
  Object.assign(g, b);
  return { group: groupJson(g) };
});
route('DELETE', '/groups/([^/]+)', (m) => {
  const g = findGroup(m[1]);
  if (gRole(g) !== 'owner') fail(403, 'Chỉ chủ nhóm mới có quyền này.');
  db.groups = db.groups.filter((x) => x.id !== g.id);
  db.posts = db.posts.filter((p) => p.groupId !== g.id);
  delete db.members[g.id];
  return { ok: true };
});
route('POST', '/groups/([^/]+)/join', (m, b) => {
  const g = findGroup(m[1]);
  if (gMembership(g)) fail(409, gMembership(g)!.status === 'active' ? 'Bạn đã là thành viên của nhóm này.' : 'Bạn đã gửi yêu cầu tham gia, đang chờ duyệt.');
  if (g.privacy === 'public') db.members[g.id].push({ user: db.me, role: 'member', status: 'active', joinedAt: iso(0) });
  else {
    const answers: string[] = b.answers || [];
    if (g.joinQuestions.length && (answers.length !== g.joinQuestions.length || answers.some((a) => !a))) fail(400, 'Vui lòng trả lời tất cả câu hỏi trước khi xin tham gia.');
    db.members[g.id].push({ user: db.me, role: 'member', status: 'pending', joinedAt: iso(0), answers: g.joinQuestions.map((question, i) => ({ question, answer: answers[i] })) });
  }
  return { group: groupJson(g) };
});
route('DELETE', '/groups/([^/]+)/join', (m) => {
  const g = findGroup(m[1]);
  const mem = gMembership(g);
  if (!mem) fail(404, 'Bạn chưa tham gia nhóm này.');
  if (mem!.role === 'owner') fail(400, 'Chủ nhóm không thể rời nhóm. Hãy chuyển quyền chủ nhóm hoặc xoá nhóm.');
  db.members[g.id] = db.members[g.id].filter((x) => x.user.id !== db.me.id);
  db.posts = db.posts.filter((p) => !(p.groupId === g.id && p.author.id === db.me.id && p.groupStatus === 'pending'));
  return { ok: true };
});
route('GET', '/groups/([^/]+)/members', (m, _b, q) => {
  const g = findGroup(m[1]);
  const pending = q.get('status') === 'pending';
  if (pending && !gIsAdmin(g)) fail(403, 'Chỉ quản trị viên nhóm mới có quyền này.');
  if (!pending && g.privacy === 'private' && gRole(g) === null) fail(403, 'Chỉ thành viên mới xem được danh sách thành viên.');
  const rank = { owner: 0, admin: 1, member: 2 };
  const list = (db.members[g.id] || []).filter((x) => x.status === (pending ? 'pending' : 'active')).sort((a, b) => rank[a.role] - rank[b.role]);
  return { members: list.map((x) => ({ ...x, answers: pending ? x.answers : undefined })) };
});
route('POST', '/groups/([^/]+)/members/([^/]+)/(approve|reject)', (m) => {
  const g = findGroup(m[1]);
  if (!gIsAdmin(g)) fail(403, 'Chỉ quản trị viên nhóm mới có quyền này.');
  const mem = db.members[g.id].find((x) => x.user.id === m[2] && x.status === 'pending');
  if (!mem) fail(404, 'Không có yêu cầu tham gia từ người này.');
  if (m[3] === 'approve') mem!.status = 'active';
  else db.members[g.id] = db.members[g.id].filter((x) => x !== mem);
  groupNotify(m[2], g, m[3] === 'approve' ? `đã chấp nhận yêu cầu tham gia nhóm "${g.name}" của bạn.` : `đã từ chối yêu cầu tham gia nhóm "${g.name}" của bạn.`);
  return { ok: true };
});
route('DELETE', '/groups/([^/]+)/members/([^/]+)', (m) => {
  const g = findGroup(m[1]);
  if (!gIsAdmin(g)) fail(403, 'Chỉ quản trị viên nhóm mới có quyền này.');
  const mem = db.members[g.id].find((x) => x.user.id === m[2] && x.status === 'active');
  if (!mem) fail(404, 'Không tìm thấy thành viên này trong nhóm.');
  if (mem!.role === 'owner') fail(403, 'Không thể xoá chủ nhóm.');
  if (mem!.user.id === db.me.id) fail(400, 'Bạn không thể tự xoá mình. Hãy dùng chức năng rời nhóm.');
  if (mem!.role === 'admin' && gRole(g) !== 'owner') fail(403, 'Chỉ chủ nhóm mới xoá được quản trị viên.');
  db.members[g.id] = db.members[g.id].filter((x) => x !== mem);
  groupNotify(m[2], g, `đã xoá bạn khỏi nhóm "${g.name}".`);
  return { ok: true };
});
route('PATCH', '/groups/([^/]+)/members/([^/]+)', (m, b) => {
  const g = findGroup(m[1]);
  if (gRole(g) !== 'owner') fail(403, 'Chỉ chủ nhóm mới có quyền này.');
  const mem = db.members[g.id].find((x) => x.user.id === m[2] && x.status === 'active');
  if (!mem) fail(404, 'Không tìm thấy thành viên này trong nhóm.');
  if (mem!.role === 'owner') fail(400, 'Không thể đổi vai trò của chủ nhóm.');
  mem!.role = b.role;
  groupNotify(m[2], g, b.role === 'admin' ? `đã chỉ định bạn làm quản trị viên nhóm "${g.name}".` : `đã gỡ quyền quản trị viên của bạn trong nhóm "${g.name}".`);
  return { ok: true };
});
route('POST', '/groups/([^/]+)/transfer', (m, b) => {
  const g = findGroup(m[1]);
  if (gRole(g) !== 'owner') fail(403, 'Chỉ chủ nhóm mới có quyền này.');
  const target = db.members[g.id].find((x) => x.user.id === b.userId && x.status === 'active');
  if (!target) fail(404, 'Người này chưa là thành viên của nhóm.');
  target!.role = 'owner';
  gMembership(g)!.role = 'admin';
  g.ownerId = b.userId;
  return { ok: true };
});

route('GET', '/groups/([^/]+)/posts', (m, _b, q) => {
  const g = findGroup(m[1]);
  const pending = q.get('status') === 'pending';
  if (pending) {
    if (gRole(g) === null) fail(403, 'Bạn cần là thành viên của nhóm.');
    return { posts: db.posts.filter((p) => p.groupId === g.id && p.groupStatus === 'pending' && (gIsAdmin(g) || p.author.id === db.me.id)) };
  }
  if (g.privacy === 'private' && gRole(g) === null) fail(403, 'Chỉ thành viên mới xem được bài viết của nhóm.');
  return { posts: db.posts.filter((p) => p.groupId === g.id && p.groupStatus === 'approved') };
});
route('POST', '/groups/([^/]+)/posts', (m, b) => {
  const g = findGroup(m[1]);
  if (gRole(g) === null) fail(403, 'Bạn cần là thành viên của nhóm.');
  if (!b.content && !b.images?.length && !b.video) fail(400, 'Bài viết không được để trống.');
  const needs = g.postApproval && gRole(g) === 'member';
  const post: Post = {
    id: nextId('p'), author: db.me, content: b.content, images: b.images?.length ? b.images : undefined, video: b.video, privacy: 'only_me', feeling: b.feeling, location: b.location,
    createdAt: iso(0), reactions: [], commentsCount: 0, sharesCount: 0, isSaved: false, pinned: false, groupId: g.id, groupName: g.name, groupStatus: needs ? 'pending' : 'approved',
  };
  db.posts.unshift(post);
  return { post };
});
route('POST', '/groups/([^/]+)/posts/([^/]+)/(approve|reject)', (m) => {
  const g = findGroup(m[1]);
  if (!gIsAdmin(g)) fail(403, 'Chỉ quản trị viên nhóm mới có quyền này.');
  const post = db.posts.find((p) => p.id === m[2] && p.groupId === g.id && p.groupStatus === 'pending');
  if (!post) fail(404, 'Không tìm thấy bài viết đang chờ duyệt.');
  if (m[3] === 'approve') {
    post!.groupStatus = 'approved';
    return { post };
  }
  db.posts = db.posts.filter((p) => p !== post);
  return { ok: true };
});
route('DELETE', '/groups/([^/]+)/posts/([^/]+)', (m) => {
  const g = findGroup(m[1]);
  const post = db.posts.find((p) => p.id === m[2] && p.groupId === g.id);
  if (!post) fail(404, 'Không tìm thấy bài viết.');
  if (post!.author.id !== db.me.id && !gIsAdmin(g)) fail(403, 'Bạn không có quyền xoá bài viết này.');
  db.posts = db.posts.filter((p) => p !== post);
  db.reports = db.reports.filter((r) => r.postId !== post!.id);
  return { ok: true };
});
route('POST', '/groups/([^/]+)/posts/([^/]+)/report', (m, b) => {
  const g = findGroup(m[1]);
  if (gRole(g) === null) fail(403, 'Bạn cần là thành viên của nhóm.');
  const post = db.posts.find((p) => p.id === m[2] && p.groupId === g.id && p.groupStatus === 'approved');
  if (!post) fail(404, 'Không tìm thấy bài viết.');
  if (post!.author.id === db.me.id) fail(400, 'Bạn không thể báo cáo bài viết của chính mình.');
  if (db.reports.some((r) => r.postId === post!.id && r.reporterId === db.me.id)) fail(409, 'Đã có lỗi xảy ra.');
  db.reports.push({ id: nextId('rp'), groupId: g.id, postId: post!.id, reporterId: db.me.id, reason: b.reason || '' });
  return { ok: true };
});
route('GET', '/groups/([^/]+)/reports', (m) => {
  const g = findGroup(m[1]);
  if (!gIsAdmin(g)) fail(403, 'Chỉ quản trị viên nhóm mới có quyền này.');
  return {
    reports: db.reports
      .filter((r) => r.groupId === g.id)
      .map((r) => ({ id: r.id, reporter: byId(r.reporterId)!, reason: r.reason, createdAt: iso(1), post: db.posts.find((p) => p.id === r.postId)! })),
  };
});
route('POST', '/groups/([^/]+)/reports/([^/]+)/resolve', (m, b) => {
  const g = findGroup(m[1]);
  if (!gIsAdmin(g)) fail(403, 'Chỉ quản trị viên nhóm mới có quyền này.');
  const report = db.reports.find((r) => r.id === m[2] && r.groupId === g.id);
  if (!report) fail(404, 'Không tìm thấy báo cáo.');
  if (b.action === 'remove') {
    db.posts = db.posts.filter((p) => p.id !== report!.postId);
    db.reports = db.reports.filter((r) => r.postId !== report!.postId);
  } else db.reports = db.reports.filter((r) => r !== report);
  return { ok: true };
});

// ---------- Trang (fanpage) ----------
// Mô phỏng luật của server: chủ trang > quản trị viên > người xem; chỉ quản trị viên đăng bài / sửa; theo dõi không trùng.
const pgAdminIds = (pg: Page) => [pg.ownerId, ...(db.pageAdmins[pg.id] || [])];
const pgRole = (pg: Page): Page['myRole'] => (pg.ownerId === db.me.id ? 'owner' : (db.pageAdmins[pg.id] || []).includes(db.me.id) ? 'admin' : null);
const findPage = (id: string) => db.pages.find((p) => p.id === id) || fail(404, 'Không tìm thấy trang.');
const pageJson = (pg: Page): Page => ({
  ...pg,
  myRole: pgRole(pg),
  isFollowing: db.pageFollows.includes(pg.id),
  admins: pgRole(pg) ? pgAdminIds(pg).map((id) => byId(id)!).filter(Boolean) : undefined,
});
const requirePageAdmin = (pg: Page) => pgRole(pg) || fail(403, 'Chỉ quản trị viên của trang mới có quyền này.');

route('GET', '/pages', (_m, _b, q) => {
  const scope = q.get('scope');
  const term = (q.get('q') || '').toLowerCase();
  const pages = db.pages.filter((p) => p.name.toLowerCase().includes(term)).filter((p) => (scope === 'mine' ? pgRole(p) : scope === 'following' ? db.pageFollows.includes(p.id) : !pgRole(p) && !db.pageFollows.includes(p.id)));
  return { pages: pages.map(pageJson) };
});
route('POST', '/pages', (_m, b) => {
  if (!b.name || String(b.name).trim().length < 2) fail(400, 'Dữ liệu không hợp lệ.');
  const pg: Page = { id: nextId('pg'), name: b.name, category: b.category || 'other', description: b.description || '', website: b.website, address: b.address, ownerId: db.me.id, followersCount: 0, createdAt: iso(0), myRole: 'owner', isFollowing: false };
  db.pages.unshift(pg);
  return { page: pageJson(pg) };
});
route('GET', '/pages/([^/]+)', (m) => ({ page: pageJson(findPage(m[1])) }));
route('PATCH', '/pages/([^/]+)', (m, b) => {
  const pg = findPage(m[1]);
  requirePageAdmin(pg);
  Object.assign(pg, b);
  return { page: pageJson(pg) };
});
route('DELETE', '/pages/([^/]+)', (m) => {
  const pg = findPage(m[1]);
  if (pgRole(pg) !== 'owner') fail(403, 'Chỉ chủ trang mới có quyền này.');
  db.pages = db.pages.filter((p) => p !== pg);
  db.posts = db.posts.filter((p) => p.pageId !== pg.id);
  return { ok: true };
});
route('POST', '/pages/([^/]+)/follow', (m) => {
  const pg = findPage(m[1]);
  if (!db.pageFollows.includes(pg.id)) {
    db.pageFollows.push(pg.id);
    pg.followersCount += 1;
  }
  return { page: pageJson(pg) };
});
route('DELETE', '/pages/([^/]+)/follow', (m) => {
  const pg = findPage(m[1]);
  if (db.pageFollows.includes(pg.id)) {
    db.pageFollows = db.pageFollows.filter((id) => id !== pg.id);
    pg.followersCount = Math.max(0, pg.followersCount - 1);
  }
  return { page: pageJson(pg) };
});
route('GET', '/pages/([^/]+)/followers', (m) => {
  requirePageAdmin(findPage(m[1]));
  return { users: db.users.filter((u) => u.id === 'f2') };
});
route('POST', '/pages/([^/]+)/admins', (m, b) => {
  const pg = findPage(m[1]);
  if (pgRole(pg) !== 'owner') fail(403, 'Chỉ chủ trang mới có quyền này.');
  if (pgAdminIds(pg).includes(b.userId)) fail(409, 'Người này đã là quản trị viên của trang.');
  (db.pageAdmins[pg.id] ||= []).push(b.userId);
  return { page: pageJson(pg) };
});
route('DELETE', '/pages/([^/]+)/admins/([^/]+)', (m) => {
  const pg = findPage(m[1]);
  if (pgRole(pg) !== 'owner' && m[2] !== db.me.id) fail(403, 'Chỉ chủ trang mới gỡ được quản trị viên khác.');
  db.pageAdmins[pg.id] = (db.pageAdmins[pg.id] || []).filter((id) => id !== m[2]);
  return { page: pageJson(pg) };
});
route('GET', '/pages/([^/]+)/posts', (m) => ({ posts: db.posts.filter((p) => p.pageId === findPage(m[1]).id) }));
route('POST', '/pages/([^/]+)/posts', (m, b) => {
  const pg = findPage(m[1]);
  requirePageAdmin(pg);
  if (!b.content && !b.images?.length && !b.video) fail(400, 'Bài viết không được để trống.');
  const post: Post = { id: nextId('p'), author: db.me, content: b.content, images: b.images?.length ? b.images : undefined, video: b.video, privacy: 'public', createdAt: iso(0), reactions: [], commentsCount: 0, sharesCount: 0, pageId: pg.id, pageName: pg.name, pageAvatar: pg.avatar };
  db.posts.unshift(post);
  return { post };
});
route('DELETE', '/pages/([^/]+)/posts/([^/]+)', (m) => {
  const pg = findPage(m[1]);
  requirePageAdmin(pg);
  const post = db.posts.find((p) => p.id === m[2] && p.pageId === pg.id) || fail(404, 'Không tìm thấy bài viết.');
  db.posts = db.posts.filter((p) => p !== post);
  return { ok: true };
});

// ---------- Reels ----------
const reelsVisible = () => db.posts.filter((p) => p.kind === 'reel' && !db.blocked.includes(p.author.id) && !db.hidden.includes(p.id) && (p.privacy !== 'friends' || p.author.id === db.me.id || isFriend(p.author.id)));
route('GET', '/reels', (_m, _b, q) => {
  const skip = Number(q.get('skip')) || 0;
  const limit = Number(q.get('limit')) || 10;
  return { reels: reelsVisible().slice(skip, skip + limit) };
});
route('GET', '/reels/([^/]+)', (m) => ({ reel: reelsVisible().find((p) => p.id === m[1]) || fail(404, 'Không tìm thấy reel.') }));
route('POST', '/reels', (_m, b) => {
  if (!b.video) fail(400, 'Dữ liệu không hợp lệ.');
  const reel: Post = { id: nextId('r'), author: db.me, content: b.caption || '', video: b.video, privacy: b.privacy || 'public', createdAt: iso(0), reactions: [], commentsCount: 0, sharesCount: 0, kind: 'reel', viewsCount: 0 };
  db.posts.unshift(reel);
  return { reel };
});
route('POST', '/reels/([^/]+)/view', (m) => {
  const reel = reelsVisible().find((p) => p.id === m[1]) || fail(404, 'Không tìm thấy reel.');
  reel.viewsCount = (reel.viewsCount || 0) + 1;
  return { viewsCount: reel.viewsCount };
});

// ---------- Tìm kiếm tổng hợp ----------
// Bản rút gọn của server: lọc theo từ khoá và quyền xem; lý do "Bạn bè" / "Nhóm của bạn" / "Đang theo dõi" để kiểm tra giao diện.
route('GET', '/search', (_m, _b, q) => {
  const term = (q.get('q') || '').trim().toLowerCase();
  const type = q.get('type') || 'all';
  const limit = type === 'all' ? 5 : Number(q.get('limit')) || 20;
  const want = (t: string) => type === 'all' || type === t;
  if (!term) return { query: '', people: [], groups: [], pages: [], posts: [] };
  const people = want('people')
    ? db.users.filter((u) => u.id !== db.me.id && !db.blocked.includes(u.id) && `${u.name} ${u.username}`.toLowerCase().includes(term))
        .sort((a, b) => Number(isFriend(b.id)) - Number(isFriend(a.id)))
        .slice(0, limit)
        .map((user) => ({ user, reasons: isFriend(user.id) ? ['Bạn bè'] : db.following.includes(user.id) ? ['Đang theo dõi'] : [] }))
    : [];
  const groups = want('groups')
    ? db.groups.filter((g) => g.name.toLowerCase().includes(term)).slice(0, limit).map((g) => ({ group: groupJson(g), reasons: gRole(g) ? ['Nhóm của bạn'] : [] }))
    : [];
  const pages = want('pages')
    ? db.pages.filter((p) => p.name.toLowerCase().includes(term)).slice(0, limit).map((p) => ({ page: pageJson(p), reasons: pgRole(p) ? ['Bạn quản trị'] : db.pageFollows.includes(p.id) ? ['Đang theo dõi'] : [] }))
    : [];
  const posts = want('posts')
    ? db.posts
        .filter((p) => !db.blocked.includes(p.author.id) && p.content.toLowerCase().includes(term) && (p.groupId ? p.groupStatus === 'approved' && gRole(findGroup(p.groupId)) !== null : p.privacy !== 'friends' || isFriend(p.author.id) || p.author.id === db.me.id))
        .slice(0, limit)
        .map((post) => ({ post, reasons: isFriend(post.author.id) ? ['Bạn bè'] : [] }))
    : [];
  return { query: term, people, groups, pages, posts };
});

// ---------- Thông báo ----------
route('GET', '/notifications', (_m, _b, q) => {
  const skip = Number(q.get('skip')) || 0;
  const limit = Number(q.get('limit')) || 30;
  return { notifications: db.notifications.slice(skip, skip + limit) };
});
route('PATCH', '/notifications/read-all', () => {
  db.notifications.forEach((n) => (n.isRead = true));
  return { ok: true };
});
route('PATCH', '/notifications/([^/]+)/read', (m) => {
  const n = db.notifications.find((x) => x.id === m[1]);
  if (n) n.isRead = true;
  return { ok: true };
});

/** Xử lý một request giả. `db.failNext.add("POST /posts")` làm request kế tiếp tới route đó trả lỗi 500. */
export async function handle(method: string, fullPath: string, body?: unknown) {
  calls.push({ method, path: fullPath, body });
  const key = `${method} ${fullPath.split('?')[0]}`;
  if (db.failNext.has(key)) {
    db.failNext.delete(key);
    throw new ApiError(500, 'Lỗi máy chủ giả lập');
  }
  const [path, qs = ''] = fullPath.split('?');
  for (const [m, regex, handler] of routes) {
    if (m !== method) continue;
    const match = path.match(regex);
    if (match) return JSON.parse(JSON.stringify(handler(match, body ?? {}, new URLSearchParams(qs))));
  }
  throw new ApiError(404, `Route giả chưa có: ${method} ${path}`);
}

// ---------- Module thay thế ----------
let token: string | null = null;
export const apiModule = {
  ApiError,
  getToken: () => token,
  setToken: (t: string | null) => void (token = t),
  api: {
    get: (p: string) => handle('GET', p),
    post: (p: string, b?: unknown) => handle('POST', p, b),
    patch: (p: string, b?: unknown) => handle('PATCH', p, b),
    delete: (p: string) => handle('DELETE', p),
  },
  uploadFile: async (file: File) => ({ url: `/uploads/${file.name}`, name: file.name, size: file.size }),
};

const listeners = new Map<string, Set<(payload: unknown) => void>>();
export const fakeSocket = {
  on: (event: string, fn: (payload: unknown) => void) => void (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(fn),
  off: (event: string, fn: (payload: unknown) => void) => void listeners.get(event)?.delete(fn),
  auth: {} as unknown,
  emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
};
export const socketModule = { getSocket: () => fakeSocket, disconnectSocket: () => {} };
/** Giả lập server đẩy sự kiện realtime tới trình duyệt. Nhớ bọc trong act(). */
export const serverEmit = (event: string, payload: unknown) => listeners.get(event)?.forEach((fn) => fn(payload));
export const setLoggedIn = (loggedIn = true) => void (token = loggedIn ? 'token-u1' : null);

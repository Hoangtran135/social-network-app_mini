import type { User, Post, Comment, Story, Conversation, Message, FriendRequest, NotificationItem } from '../../src/types';

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
  notifications: NotificationItem[]; memories: Post[]; blocked: string[]; passwords: Record<string, string>; failNext: Set<string>;
}

export const calls: { method: string; path: string; body?: unknown }[] = [];
export const db = {} as Db;

/** Dựng lại dữ liệu mặc định: tôi (u1) có 2 bạn (f1 online, f2), 1 người lạ (s1), 1 lời mời đến (s2), 1 lời mời đi (s3), vài bài viết. */
export function resetDb() {
  seq = 1000;
  calls.length = 0;
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
    passwords: { 'u1@test.vn': 'secret123' },
    failNext: new Set<string>(),
  });
  conversationsFix();
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
route('GET', '/auth/me', () => ({ user: db.me }));
route('POST', '/auth/login', (_m, b) => {
  const user = db.users.find((u) => u.email === String(b.email).toLowerCase());
  if (!user || db.passwords[user.email] !== b.password) fail(401, 'Email hoặc mật khẩu không chính xác.');
  db.me = { ...user!, blockedUserIds: db.blocked };
  return { token: 'token-' + user!.id, user: db.me };
});
route('POST', '/auth/register', (_m, b) => {
  if (db.users.some((u) => u.email === b.email || u.username === b.username)) fail(409, 'Email hoặc username đã được sử dụng.');
  const user = makeUser(nextId('n'), b.name, { username: b.username, email: b.email });
  db.users.push(user);
  db.passwords[b.email] = b.password;
  db.me = { ...user, blockedUserIds: [] };
  return { token: 'token-' + user.id, user: db.me };
});
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
  if (b.currentPassword !== db.passwords[db.me.email]) fail(400, 'Mật khẩu hiện tại không chính xác.');
  db.passwords[db.me.email] = b.newPassword;
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
  const skip = Number(q.get('skip')) || 0;
  const limit = Number(q.get('limit')) || 30;
  return { posts: db.posts.filter((p) => !db.blocked.includes(p.author.id)).slice(skip, skip + limit).map(withSaved) };
});
route('GET', '/posts/memories', () => ({ posts: db.memories }));
route('GET', '/posts/([^/]+)', (m) => ({ post: withSaved(findPost(m[1])) }));
route('POST', '/posts', (_m, b) => {
  const wall = b.wallOwnerId ? byId(b.wallOwnerId) : undefined;
  const post: Post = {
    id: nextId('p'), author: db.me, content: b.content, images: b.images?.length ? b.images : undefined, video: b.video, privacy: b.privacy || 'public',
    feeling: b.feeling, createdAt: iso(0), reactions: [], commentsCount: 0, sharesCount: 0, isSaved: false, pinned: false,
    wallOwnerId: wall?.id, wallOwnerName: wall?.name, taggedUsers: (b.taggedUserIds || []).map(byId).filter(Boolean) as User[],
  };
  db.posts.unshift(post);
  return { post };
});
route('PATCH', '/posts/([^/]+)', (m, b) => {
  const post = findPost(m[1]);
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
route('POST', '/posts/([^/]+)/save', (m) => {
  const post = findPost(m[1]);
  post.isSaved = !post.isSaved;
  return { post };
});
route('POST', '/posts/([^/]+)/share', (m) => {
  const original = findPost(m[1]);
  original.sharesCount++;
  const post: Post = { id: nextId('p'), author: db.me, content: `[Chia sẻ]: ${original.content}`, privacy: 'public', createdAt: iso(0), reactions: [], commentsCount: 0, sharesCount: 0 };
  db.posts.unshift(post);
  return { post };
});

// ---------- Bình luận ----------
route('GET', '/comments', (_m, _b, q) => ({ comments: db.comments.filter((c) => c.postId === q.get('postId')) }));
route('POST', '/comments', (_m, b) => {
  const comment: Comment = { id: nextId('c'), postId: b.postId, author: db.me, content: b.content, image: b.image, createdAt: iso(0), likes: [], parentId: b.parentId, taggedUsers: (b.taggedUserIds || []).map(byId).filter(Boolean) as User[] };
  db.comments.push(comment);
  return { comment };
});
route('DELETE', '/comments/([^/]+)', (m) => {
  db.comments = db.comments.filter((c) => c.id !== m[1]);
  return { ok: true };
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
route('POST', '/messages/conversations/([^/]+)/messages/([^/]+)/react', (m, b) => {
  const message = db.messages[m[1]].find((x) => x.id === m[2])!;
  const reactions = { ...(message.reactions || {}) };
  if (reactions[db.me.id] === b.emoji) delete reactions[db.me.id];
  else reactions[db.me.id] = b.emoji;
  message.reactions = Object.keys(reactions).length ? reactions : undefined;
  return { message };
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
};
export const socketModule = { getSocket: () => fakeSocket, disconnectSocket: () => {} };
/** Giả lập server đẩy sự kiện realtime tới trình duyệt. Nhớ bọc trong act(). */
export const serverEmit = (event: string, payload: unknown) => listeners.get(event)?.forEach((fn) => fn(payload));
export const setLoggedIn = (loggedIn = true) => void (token = loggedIn ? 'token-u1' : null);

// Chuyển dữ liệu lấy từ MongoDB (document) thành JSON gọn để trả về cho trình duyệt:
// đổi _id thành id dạng chuỗi, bỏ các trường bí mật (mật khẩu, token...), đổi Map thành object thường.
// Dạng JSON ở đây phải khớp với các kiểu trong src/types.ts phía frontend.

// Document của Mongoose có thể mang bất kỳ trường nào, nên dùng kiểu "lỏng" cho gọn
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = any;

/** Lấy id dạng chuỗi, dù là ObjectId hay document đã populate. */
export function getId(doc: Doc): string {
  return doc?._id ? doc._id.toString() : doc?.toString?.() ?? '';
}

const isoDate = (d: Date | string | undefined) => (d ? new Date(d).toISOString() : undefined);
const notEmpty = <T>(arr: T[] | undefined) => (arr && arr.length > 0 ? arr : undefined);

/** Thông tin công khai của một người dùng (không có mật khẩu). */
export function userToJson(u: Doc) {
  if (!u) return null;
  return {
    id: getId(u), 
    name: u.name,
    username: u.username,
    // KHÔNG có email: thông tin riêng tư, chỉ trả cho chính chủ (xem meToJson)
    avatar: u.avatar,
    coverImage: u.coverImage,
    bio: u.bio,
    workplace: u.workplace,
    education: u.education,
    location: u.location,
    website: u.website,
    avatarFrame: u.avatarFrame || 'none',
    // Chỉ trả các liên kết có giá trị
    socialLinks: Object.fromEntries(Object.entries(u.socialLinks?.toObject?.() ?? u.socialLinks ?? {}).filter(([, v]) => typeof v === 'string' && v)),
    joinDate: isoDate(u.joinDate),
    friendsCount: u.friendsCount ?? 0,
    isOnline: u.isOnline,
    lastActive: isoDate(u.lastActive),
  };
}

/** Thông tin của chính mình: như trên + danh sách người mình đã chặn. */
export function meToJson(u: Doc) {
  const base = userToJson(u);
  return base && { ...base, email: u.email, role: u.role === 'admin' ? 'admin' : 'user', blockedUserIds: (u.blockedUsers || []).map(getId), emailVerified: u.emailVerified !== false };
}

/** viewerId: người đang xem, để biết họ đã lưu bài này chưa (isSaved). */
export function postToJson(p: Doc, viewerId?: string) {
  return {
    id: getId(p),
    author: userToJson(p.author),
    wallOwnerId: p.wallOwner ? getId(p.wallOwner) : undefined,
    wallOwnerName: p.wallOwner?.name,
    content: p.content,
    images: notEmpty(p.images),
    video: p.video || undefined,
    privacy: p.privacy,
    feeling: p.feeling,
    location: p.location,
    taggedUsers: (p.taggedUsers || []).map(userToJson).filter(Boolean),
    createdAt: p.createdAt,
    updatedAt: p.editedAt,
    editHistory: notEmpty((p.editHistory || []).map((h: Doc) => ({ content: h.content, editedAt: h.editedAt }))),
    hashtags: notEmpty(p.hashtags),
    commentsDisabled: !!p.commentsDisabled,
    reactions: (p.reactions || []).map((r: Doc) => ({ type: r.type, userId: getId(r.userId), userName: r.userId?.name })),
    commentsCount: p.commentsCount || 0,
    sharesCount: p.sharesCount || 0,
    pinned: p.pinned,
    // Bài trong nhóm: id + tên nhóm (khi đã populate) + trạng thái duyệt
    groupId: p.group ? getId(p.group) : undefined,
    groupName: p.group?.name,
    groupStatus: p.group ? p.groupStatus : undefined,
    // Bài đăng với tư cách Trang: hiển thị trang thay cho người đăng
    pageId: p.page ? getId(p.page) : undefined,
    pageName: p.page?.name,
    pageAvatar: p.page?.avatar,
    kind: p.kind === 'reel' ? 'reel' : undefined,
    viewsCount: p.kind === 'reel' ? p.viewsCount || 0 : undefined,
    isSaved: viewerId ? (p.savedBy || []).some((u: Doc) => getId(u) === viewerId) : false,
  };
}

export function commentToJson(c: Doc) {
  return {
    id: getId(c),
    postId: getId(c.post),
    author: userToJson(c.author),
    content: c.content,
    image: c.image,
    taggedUsers: (c.taggedUsers || []).map(userToJson).filter(Boolean),
    createdAt: c.createdAt,
    likes: (c.likes || []).map(getId),
    // Gộp "thích" và các cảm xúc khác thành một danh sách: [{ type, userId }]
    reactions: [
      ...(c.likes || []).map((id: Doc) => ({ type: 'like', userId: getId(id) })),
      ...(c.reactions || []).map((r: Doc) => ({ type: r.type, userId: getId(r.userId) })),
    ],
    editedAt: c.editedAt,
    parentId: c.parent ? getId(c.parent) : undefined,
  };
}

export function storyToJson(s: Doc) {
  return {
    id: getId(s),
    user: userToJson(s.user),
    type: s.type,
    privacy: s.privacy || 'public',
    mediaUrl: s.mediaUrl,
    textContent: s.textContent,
    backgroundGradient: s.backgroundGradient,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    reactions: (s.reactions || []).map((r: Doc) => ({ userId: getId(r.user), userName: r.user?.name, avatar: r.user?.avatar, emoji: r.emoji })),
    viewers: (s.viewers || []).map((v: Doc) => ({
      userId: getId(v.user),
      userName: v.user?.name,
      avatar: v.user?.avatar,
      viewedAt: v.viewedAt,
    })),
  };
}

export function friendRequestToJson(r: Doc) {
  return {
    id: getId(r),
    sender: userToJson(r.sender),
    receiverId: getId(r.receiver),
    receiver: r.receiver?.name ? userToJson(r.receiver) : undefined,
    createdAt: r.createdAt,
  };
}

export function notificationToJson(n: Doc) {
  return {
    id: getId(n),
    userId: getId(n.user),
    actor: userToJson(n.actor),
    type: n.type,
    content: n.content,
    targetId: n.targetId,
    targetType: n.targetType,
    commentId: n.commentId,
    focus: n.focus,
    isRead: n.isRead,
    createdAt: n.createdAt,
  };
}

export function conversationToJson(c: Doc, lastMessage?: Doc, unreadCount = 0) {
  const participantIds = (c.participants || []).map(getId);
  return {
    id: getId(c),
    isGroup: c.isGroup,
    name: c.name,
    avatar: c.avatar,
    participants: (c.participants || []).map(userToJson),
    nicknames: c.nicknames ? Object.fromEntries(c.nicknames) : {},
    themeColor: c.themeColor,
    lastMessage: lastMessage ? messageToJson(lastMessage, participantIds) : undefined,
    unreadCount,
    updatedAt: c.updatedAt,
  };
}

/** isRead = mọi thành viên khác (trừ người gửi) đều đã đọc. */
export function messageToJson(m: Doc, participantIds: string[] = []) {
  const senderId = getId(m.sender);
  const readBy = new Set((m.readBy || []).map(getId));
  return {
    id: getId(m),
    conversationId: getId(m.conversation),
    kind: m.kind || 'text',
    senderId,
    senderName: m.sender?.name,
    senderAvatar: m.sender?.avatar,
    content: m.content,
    attachments: notEmpty(m.attachments),
    sharedPostId: m.sharedPostId ? getId(m.sharedPostId) : undefined,
    createdAt: m.createdAt,
    deliveredTo: (m.deliveredTo || []).map(getId),
    isRead: participantIds.filter((pid) => pid !== senderId).every((pid) => readBy.has(pid)),
    isRecalled: !!m.isRecalled,
    reactions: m.reactions?.size > 0 ? Object.fromEntries(m.reactions) : undefined,
  };
}

/** Nhóm giao lưu + vai trò / trạng thái của người xem (membership). extra: số liệu chỉ dành cho quản trị viên. */
export function groupToJson(g: Doc, membership?: Doc | null, extra: { pendingMembersCount?: number; pendingPostsCount?: number; openReportsCount?: number } = {}) {
  const active = membership?.status === 'active';
  return {
    id: getId(g),
    name: g.name,
    description: g.description || '',
    rules: g.rules,
    privacy: g.privacy,
    avatar: g.avatar,
    cover: g.cover,
    ownerId: getId(g.owner),
    postApproval: !!g.postApproval,
    joinQuestions: g.joinQuestions,
    membersCount: g.membersCount,
    createdAt: g.createdAt,
    myRole: active ? membership.role : null,
    myStatus: membership?.status ?? null,
    ...extra,
  };
}

/** Một thành viên nhóm. Câu trả lời xin vào nhóm chỉ trả cho quản trị viên (withAnswers). */
export function memberToJson(m: Doc, withAnswers = false) {
  return {
    user: userToJson(m.user),
    role: m.role,
    status: m.status,
    answers: withAnswers ? m.answers.map((a: Doc) => ({ question: a.question, answer: a.answer })) : undefined,
    joinedAt: m.createdAt,
  };
}

/** Báo cáo bài viết trong nhóm (kèm bài bị báo cáo). */
export function reportToJson(r: Doc) {
  return {
    id: getId(r),
    reporter: userToJson(r.reporter),
    reason: r.reason || '',
    createdAt: r.createdAt,
    post: postToJson(r.post),
  };
}

/** Trang (fanpage) + quan hệ của người xem với trang (myRole: owner / admin / null, isFollowing). */
export function pageToJson(pg: Doc, viewerId: string, isFollowing = false) {
  const ownerId = getId(pg.owner);
  const isAdmin = ownerId === viewerId || pg.admins.some((a: Doc) => getId(a) === viewerId);
  return {
    id: getId(pg),
    name: pg.name,
    category: pg.category,
    description: pg.description || '',
    website: pg.website,
    address: pg.address,
    avatar: pg.avatar,
    cover: pg.cover,
    ownerId,
    followersCount: pg.followersCount || 0,
    createdAt: pg.createdAt,
    myRole: ownerId === viewerId ? 'owner' : isAdmin ? 'admin' : null,
    isFollowing,
    // Chỉ quản trị viên thấy danh sách người quản trị (đã populate)
    admins: isAdmin ? [pg.owner, ...pg.admins].filter((u: Doc) => u.name).map(userToJson) : undefined,
  };
}

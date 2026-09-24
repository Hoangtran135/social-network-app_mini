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
    email: u.email,
    avatar: u.avatar,
    coverImage: u.coverImage,
    bio: u.bio,
    workplace: u.workplace,
    education: u.education,
    location: u.location,
    website: u.website,
    joinDate: isoDate(u.joinDate),
    friendsCount: u.friendsCount ?? 0,
    isOnline: u.isOnline,
    lastActive: isoDate(u.lastActive),
  };
}

/** Thông tin của chính mình: như trên + danh sách người mình đã chặn. */
export function meToJson(u: Doc) {
  const base = userToJson(u);
  return base && { ...base, blockedUserIds: (u.blockedUsers || []).map(getId) };
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
    reactions: (p.reactions || []).map((r: Doc) => ({ type: r.type, userId: getId(r.userId), userName: r.userId?.name })),
    commentsCount: p.commentsCount || 0,
    sharesCount: p.sharesCount || 0,
    pinned: p.pinned,
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
    isRead: participantIds.filter((pid) => pid !== senderId).every((pid) => readBy.has(pid)),
    isRecalled: !!m.isRecalled,
    reactions: m.reactions?.size > 0 ? Object.fromEntries(m.reactions) : undefined,
  };
}

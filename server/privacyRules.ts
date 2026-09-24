import { UserModel } from './models/User';
import { FriendshipModel } from './models/Friendship';
import { emitToUsers, emitToEveryone } from './socketServer';
import { Doc } from './formatResponse';

// Các luật "ai được xem gì" dùng chung cho mọi route:
// - quan hệ bạn bè và quan hệ chặn
// - nội dung công khai / bạn bè / chỉ mình tôi có hiển thị với một người không
// - gửi realtime chỉ tới những người được phép xem

export type Privacy = 'public' | 'friends' | 'only_me';

/** Tập id bạn bè của một người. */
export async function getFriendIds(userId: string): Promise<Set<string>> {
  const friendships = await FriendshipModel.find({ $or: [{ userA: userId }, { userB: userId }] });
  // Mỗi quan hệ lưu 2 người (A, B) → lấy "người còn lại"
  return new Set(friendships.map((f: Doc) => (f.userA.toString() === userId ? f.userB.toString() : f.userA.toString())));
}

/** Tập id những người có quan hệ chặn với userId, theo cả 2 chiều (mình chặn họ hoặc họ chặn mình). */
export async function getBlockedIds(userId: string): Promise<Set<string>> {
  const [me, blockedMe] = await Promise.all([
    UserModel.findById(userId, 'blockedUsers'),
    UserModel.find({ blockedUsers: userId }, '_id'),
  ]);
  return new Set([...(me?.blockedUsers || []).map(String), ...blockedMe.map((u: Doc) => u._id.toString())]);
}

export async function isBlockedBetween(userA: string, userB: string | undefined) {
  if (!userB || userA === userB) return false;
  return (await getBlockedIds(userA)).has(userB);
}

/** Lấy cùng lúc bạn bè + người bị chặn của người xem (hai thứ luôn cần khi lọc nội dung). */
export async function getFriendAndBlockedIds(viewerId: string) {
  const [friendIds, blockedIds] = await Promise.all([getFriendIds(viewerId), getBlockedIds(viewerId)]);
  return { friendIds, blockedIds };
}

/**
 * Luật hiển thị: tác giả luôn thấy bài của mình; bị chặn thì luôn ẩn;
 * "chỉ mình tôi" thì người khác không thấy; "bạn bè" thì chỉ bạn bè thấy; còn lại là công khai.
 */
export function canViewContent(
  authorId: string,
  viewerId: string,
  privacy: Privacy = 'public',
  friendIds: Set<string>,
  blockedIds: Set<string>
) {
  if (authorId === viewerId) return true;
  if (blockedIds.has(authorId)) return false;
  if (privacy === 'only_me') return false;
  if (privacy === 'friends') return friendIds.has(authorId);
  return true;
}

/** Kiểm tra nhanh MỘT nội dung có hiển thị với người xem không. */
export async function canView(authorId: string, viewerId: string, privacy?: Privacy) {
  const { friendIds, blockedIds } = await getFriendAndBlockedIds(viewerId);
  return canViewContent(authorId, viewerId, privacy, friendIds, blockedIds);
}

/**
 * Gửi sự kiện realtime tới đúng những người được xem nội dung:
 * công khai → mọi người; bạn bè → bạn của tác giả (và tác giả); chỉ mình tôi → không gửi.
 * excludeUserId: người không cần nhận (mặc định là tác giả — họ đã có dữ liệu mới trong response).
 */
export async function emitToAllowedViewers(privacy: string | undefined, authorId: string, event: string, payload: unknown, excludeUserId = authorId) {
  if (privacy === 'only_me') return;
  if (privacy === 'friends') {
    const receivers = [...(await getFriendIds(authorId)), authorId].filter((id) => id !== excludeUserId);
    return emitToUsers(receivers, event, payload);
  }
  emitToEveryone(event, payload, excludeUserId);
}

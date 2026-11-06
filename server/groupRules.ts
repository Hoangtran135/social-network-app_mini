import { GroupModel } from './models/Group';
import { GroupMemberModel } from './models/GroupMember';
import { canView, getBlockedIds } from './privacyRules';
import { emitToUsers } from './socketServer';
import { getId, Doc } from './formatResponse';

// Luật "ai được làm gì" trong nhóm giao lưu, dùng chung cho route nhóm, bài viết và bình luận.
//  - Bài viết nhóm luôn có privacy = 'only_me' nên các đường cũ (bảng tin, hashtag, chia sẻ, realtime...) tự đóng;
//    quyền xem thật sự được quyết định ở đây theo quyền riêng tư của nhóm + tư cách thành viên.

export type Membership = { status?: string; role?: string } | null | undefined;

/** Bản ghi thành viên của một người trong một nhóm (kể cả đang chờ duyệt). */
export const getMembership = (groupId: string, userId: string) => GroupMemberModel.findOne({ group: groupId, user: userId });

export const isActiveMember = (m: Membership) => m?.status === 'active';
/** Chủ nhóm hoặc quản trị viên (đã là thành viên). */
export const isGroupAdmin = (m: Membership) => isActiveMember(m) && (m?.role === 'owner' || m?.role === 'admin');

/** Id những người đang là thành viên. admins = true → chỉ chủ nhóm + quản trị viên. */
export async function getMemberIds(groupId: string, admins = false): Promise<string[]> {
  const filter: Record<string, unknown> = { group: groupId, status: 'active' };
  if (admins) filter.role = { $in: ['owner', 'admin'] };
  return (await GroupMemberModel.find(filter).select('user')).map((m: Doc) => getId(m.user));
}

export interface GroupEmitOptions {
  /** Người không cần nhận (thường là người vừa thực hiện, đã có kết quả trong response). */
  exclude?: string;
  /** Chỉ gửi cho chủ nhóm + quản trị viên (vd bài đang chờ duyệt). */
  adminsOnly?: boolean;
  /** Id tác giả của nội dung: thành viên có quan hệ chặn với người này sẽ KHÔNG nhận (khớp với luật xem bài qua HTTP). */
  hideFromBlockedBy?: string;
}

/** Gửi realtime tới các thành viên đang hoạt động của nhóm, theo tuỳ chọn ở GroupEmitOptions. */
export async function emitToGroupMembers(groupId: string, event: string, payload: unknown, { exclude, adminsOnly = false, hideFromBlockedBy }: GroupEmitOptions = {}) {
  let ids = (await getMemberIds(groupId, adminsOnly)).filter((id) => id !== exclude);
  if (hideFromBlockedBy) {
    const blocked = await getBlockedIds(hideFromBlockedBy);
    ids = ids.filter((id) => !blocked.has(id));
  }
  emitToUsers(ids, event, payload);
}

/**
 * Người này có XEM được bài viết không (bài thường: theo quyền riêng tư; bài nhóm: theo quyền riêng tư của nhóm).
 * Bài nhóm: tác giả luôn xem được; người bị chặn thì không; bài chờ duyệt chỉ tác giả + quản trị viên;
 * bài đã duyệt: nhóm công khai → ai cũng xem, nhóm riêng tư → chỉ thành viên.
 */
export async function canViewPost(post: Doc, userId: string): Promise<boolean> {
  const authorId = getId(post.author);
  if (!post.group) return canView(authorId, userId, post.privacy);
  if (authorId === userId) return true;
  if ((await getBlockedIds(userId)).has(authorId)) return false;
  const groupId = getId(post.group);
  const [group, membership] = await Promise.all([GroupModel.findById(groupId).select('privacy'), getMembership(groupId, userId)]);
  if (!group) return false;
  if (post.groupStatus === 'pending') return isGroupAdmin(membership);
  return group.privacy === 'public' || isActiveMember(membership);
}

/**
 * Có được TƯƠNG TÁC (thả cảm xúc, bình luận) không: bài thường như xem; bài nhóm phải là thành viên và bài đã được duyệt.
 * viewChecked = true khi nơi gọi đã kiểm tra canViewPost rồi (tránh lặp lại các truy vấn quyền xem).
 */
export async function canInteractPost(post: Doc, userId: string, viewChecked = false): Promise<boolean> {
  if (!viewChecked && !(await canViewPost(post, userId))) return false;
  if (!post.group) return true;
  if (post.groupStatus === 'pending') return false;
  return isActiveMember(await getMembership(getId(post.group), userId));
}

import { RequestHandler } from 'express';
import { GroupModel } from '../../models/Group';
import { GroupMemberModel } from '../../models/GroupMember';
import { GroupReportModel } from '../../models/GroupReport';
import { CommentModel } from '../../models/Comment';
import { createNotification } from '../../createNotification';
import { isGroupAdmin, isActiveMember, getMemberIds } from '../../groupRules';
import { Doc } from '../../formatResponse';

// Phần dùng chung của các route nhóm: nạp nhóm theo :id, kiểm tra vai trò, gửi thông báo cho quản trị viên, xoá bài, đếm thành viên.

/** Nạp nhóm theo :id và tư cách thành viên của người gọi vào res.locals (404 nếu nhóm không tồn tại). */
export const withGroup: RequestHandler = async (req, res, next) => {
  const group = await GroupModel.findById(req.params.id);
  if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm.' });
  res.locals.group = group;
  res.locals.membership = await GroupMemberModel.findOne({ group: group._id, user: req.userId });
  next();
};

export const requireActive: RequestHandler = (_req, res, next) => (isActiveMember(res.locals.membership) ? next() : void res.status(403).json({ error: 'Bạn cần là thành viên của nhóm.' }));
export const requireAdmin: RequestHandler = (_req, res, next) => (isGroupAdmin(res.locals.membership) ? next() : void res.status(403).json({ error: 'Chỉ quản trị viên nhóm mới có quyền này.' }));
export const requireOwner: RequestHandler = (_req, res, next) => (res.locals.membership?.role === 'owner' ? next() : void res.status(403).json({ error: 'Chỉ chủ nhóm mới có quyền này.' }));

/** Thông báo trong nhóm: bấm vào thì mở trang nhóm. */
export const notifyGroup = (userId: string, actor: string, group: Doc, content: string) =>
  createNotification({ user: userId, actor, type: 'system', content, targetId: group.id, targetType: 'group' });

/** Báo cho chủ nhóm + quản trị viên (trừ người gây ra sự việc). */
export async function notifyAdmins(group: Doc, actor: string, content: string) {
  const adminIds = (await getMemberIds(group.id, true)).filter((id) => id !== actor);
  await Promise.all(adminIds.map((id) => notifyGroup(id, actor, group, content)));
}

/** Xoá một bài trong nhóm cùng bình luận và báo cáo của nó. */
export async function removePost(post: Doc) {
  await Promise.all([CommentModel.deleteMany({ post: post._id }), GroupReportModel.deleteMany({ post: post._id })]);
  await post.deleteOne();
}

/** Thêm / bớt 1 thành viên đang hoạt động vào bộ đếm của nhóm (cập nhật nguyên tử bằng $inc). */
export const bumpMembers = (groupId: string, by: 1 | -1) => GroupModel.findByIdAndUpdate(groupId, { $inc: { membersCount: by } }, { returnDocument: 'after' });

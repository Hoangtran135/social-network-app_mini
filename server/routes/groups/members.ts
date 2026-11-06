import { Router } from 'express';
import { GroupMemberModel, ROLE_RANK } from '../../models/GroupMember';
import { PostModel } from '../../models/Post';
import { validate, setMemberRoleSchema, transferGroupSchema } from '../../validation';
import { memberToJson, getId, Doc } from '../../formatResponse';
import { getBlockedIds } from '../../privacyRules';
import { isGroupAdmin, isActiveMember } from '../../groupRules';
import { pageParams } from '../../pagination';
import { withGroup, requireAdmin, requireOwner, notifyGroup, bumpMembers } from './middleware';

// Thành viên: danh sách, duyệt / từ chối yêu cầu, đuổi, đổi vai trò (bổ nhiệm / gỡ quyền quản trị viên), chuyển quyền chủ nhóm.

export function registerGroupMembers(router: Router) {
  /** Danh sách thành viên. ?status=pending (chỉ quản trị viên): yêu cầu chờ duyệt kèm câu trả lời. Nhóm riêng tư: chỉ thành viên xem được. */
  router.get('/:id/members', withGroup, async (req, res) => {
    const { group, membership } = res.locals;
    const pending = req.query.status === 'pending';
    if (pending && !isGroupAdmin(membership)) return res.status(403).json({ error: 'Chỉ quản trị viên nhóm mới có quyền này.' });
    if (!pending && group.privacy === 'private' && !isActiveMember(membership)) return res.status(403).json({ error: 'Chỉ thành viên mới xem được danh sách thành viên.' });

    const { limit, skip } = pageParams(req.query, 50);
    const [members, blockedIds] = await Promise.all([
      GroupMemberModel.find({ group: group._id, status: pending ? 'pending' : 'active' }).sort({ rank: 1, createdAt: 1 }).limit(limit).skip(skip).populate('user'),
      getBlockedIds(req.userId),
    ]);
    res.json({ members: members.filter((m: Doc) => m.user && !blockedIds.has(getId(m.user))).map((m: Doc) => memberToJson(m, pending)) });
  });

  /** Duyệt yêu cầu tham gia (quản trị viên). */
  router.post('/:id/members/:userId/approve', withGroup, requireAdmin, async (req, res) => {
    const { group } = res.locals;
    // Cập nhật có điều kiện status = pending: hai quản trị viên bấm duyệt cùng lúc thì chỉ một lần thành công
    const member = await GroupMemberModel.findOneAndUpdate({ group: group._id, user: req.params.userId, status: 'pending' }, { status: 'active' }, { returnDocument: 'after' });
    if (!member) return res.status(404).json({ error: 'Không có yêu cầu tham gia từ người này.' });
    await bumpMembers(group.id, 1);
    await notifyGroup(req.params.userId, req.userId, group, `đã chấp nhận yêu cầu tham gia nhóm "${group.name}" của bạn.`);
    res.json({ ok: true });
  });

  /** Từ chối yêu cầu tham gia (quản trị viên). */
  router.post('/:id/members/:userId/reject', withGroup, requireAdmin, async (req, res) => {
    const { group } = res.locals;
    const removed = await GroupMemberModel.findOneAndDelete({ group: group._id, user: req.params.userId, status: 'pending' });
    if (!removed) return res.status(404).json({ error: 'Không có yêu cầu tham gia từ người này.' });
    await notifyGroup(req.params.userId, req.userId, group, `đã từ chối yêu cầu tham gia nhóm "${group.name}" của bạn.`);
    res.json({ ok: true });
  });

  /** Đuổi thành viên khỏi nhóm. Quản trị viên đuổi được thành viên; chỉ chủ nhóm đuổi được quản trị viên; không ai đuổi được chủ nhóm. */
  router.delete('/:id/members/:userId', withGroup, requireAdmin, async (req, res) => {
    const { group, membership } = res.locals;
    const target = await GroupMemberModel.findOne({ group: group._id, user: req.params.userId, status: 'active' });
    if (!target) return res.status(404).json({ error: 'Không tìm thấy thành viên này trong nhóm.' });
    if (target.role === 'owner') return res.status(403).json({ error: 'Không thể xoá chủ nhóm.' });
    if (getId(target.user) === req.userId) return res.status(400).json({ error: 'Bạn không thể tự xoá mình. Hãy dùng chức năng rời nhóm.' });
    if (target.role === 'admin' && membership.role !== 'owner') return res.status(403).json({ error: 'Chỉ chủ nhóm mới xoá được quản trị viên.' });

    const removed = await GroupMemberModel.findOneAndDelete({ _id: target._id });
    if (removed) {
      await bumpMembers(group.id, -1);
      await PostModel.deleteMany({ group: group._id, author: req.params.userId, groupStatus: 'pending' });
      await notifyGroup(req.params.userId, req.userId, group, `đã xoá bạn khỏi nhóm "${group.name}".`);
    }
    res.json({ ok: true });
  });

  /** Đổi vai trò thành viên: quản trị viên ↔ thành viên (chỉ chủ nhóm). */
  router.patch('/:id/members/:userId', withGroup, requireOwner, validate(setMemberRoleSchema), async (req, res) => {
    const { group } = res.locals;
    const { role } = req.body;
    const target = await GroupMemberModel.findOne({ group: group._id, user: req.params.userId, status: 'active' });
    if (!target) return res.status(404).json({ error: 'Không tìm thấy thành viên này trong nhóm.' });
    if (target.role === 'owner') return res.status(400).json({ error: 'Không thể đổi vai trò của chủ nhóm.' });
    if (target.role !== role) {
      await GroupMemberModel.updateOne({ _id: target._id }, { role, rank: ROLE_RANK[role as 'admin' | 'member'] });
      const content = role === 'admin' ? `đã chỉ định bạn làm quản trị viên nhóm "${group.name}".` : `đã gỡ quyền quản trị viên của bạn trong nhóm "${group.name}".`;
      await notifyGroup(req.params.userId, req.userId, group, content);
    }
    res.json({ ok: true });
  });

  /** Chuyển quyền chủ nhóm cho một thành viên khác; chủ cũ trở thành quản trị viên. */
  router.post('/:id/transfer', withGroup, requireOwner, validate(transferGroupSchema), async (req, res) => {
    const { group } = res.locals;
    const { userId } = req.body;
    if (userId === req.userId) return res.status(400).json({ error: 'Bạn đã là chủ nhóm.' });
    const target = await GroupMemberModel.findOne({ group: group._id, user: userId, status: 'active' });
    if (!target) return res.status(404).json({ error: 'Người này chưa là thành viên của nhóm.' });

    await GroupMemberModel.updateOne({ _id: target._id }, { role: 'owner', rank: ROLE_RANK.owner });
    await GroupMemberModel.updateOne({ group: group._id, user: req.userId }, { role: 'admin', rank: ROLE_RANK.admin });
    group.owner = userId;
    await group.save();
    await notifyGroup(userId, req.userId, group, `đã chuyển quyền chủ nhóm "${group.name}" cho bạn.`);
    res.json({ ok: true });
  });
}

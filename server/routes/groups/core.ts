import { Router } from 'express';
import { GroupModel } from '../../models/Group';
import { GroupMemberModel, ROLE_RANK } from '../../models/GroupMember';
import { GroupReportModel } from '../../models/GroupReport';
import { PostModel } from '../../models/Post';
import { validate, createGroupSchema, updateGroupSchema, joinGroupSchema } from '../../validation';
import { groupToJson, getId, Doc } from '../../formatResponse';
import { isBlockedBetween } from '../../privacyRules';
import { isGroupAdmin } from '../../groupRules';
import { pageParams } from '../../pagination';
import { withGroup, requireAdmin, requireOwner, notifyAdmins, bumpMembers } from './middleware';
import { escapeRegex } from '../../regex';
import { removeGroup } from '../../contentRemoval';

// Nhóm: danh sách, tạo, xem, sửa, xoá; tham gia / rời nhóm.


export function registerGroupCore(router: Router) {
  /** Danh sách nhóm. ?scope=mine → nhóm mình đã tham gia; mặc định (discover) → nhóm chưa tham gia. ?q= lọc theo tên. */
  router.get('/', async (req, res) => {
    const me = req.userId;
    const { limit, skip } = pageParams(req.query, 30);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const filter: Record<string, unknown> = q ? { name: new RegExp(escapeRegex(q), 'i') } : {};
    const mine = req.query.scope === 'mine';

    const active = await GroupMemberModel.find({ user: me, status: 'active' }).select('group');
    const activeIds = active.map((m: Doc) => m.group);
    filter._id = mine ? { $in: activeIds } : { $nin: activeIds };

    const groups = await GroupModel.find(filter).sort(mine ? { createdAt: -1 } : { membersCount: -1, createdAt: -1 }).limit(limit).skip(skip);
    const memberships = await GroupMemberModel.find({ user: me, group: { $in: groups.map((g: Doc) => g._id) } });
    const byGroup = new Map(memberships.map((m: Doc) => [getId(m.group), m]));
    res.json({ groups: groups.map((g: Doc) => groupToJson(g, byGroup.get(getId(g)))) });
  });

  /** Tạo nhóm: người tạo là chủ nhóm. */
  router.post('/', validate(createGroupSchema), async (req, res) => {
    const group = await GroupModel.create({ ...req.body, owner: req.userId, membersCount: 1 });
    const membership = await GroupMemberModel.create({ group: group._id, user: req.userId, role: 'owner', rank: ROLE_RANK.owner, status: 'active' });
    res.json({ group: groupToJson(group, membership) });
  });

  /** Xem một nhóm. Quản trị viên được kèm số yêu cầu / bài / báo cáo đang chờ xử lý. */
  router.get('/:id', withGroup, async (_req, res) => {
    const { group, membership } = res.locals;
    let extra = {};
    if (isGroupAdmin(membership)) {
      const [pendingMembersCount, pendingPostsCount, openReportsCount] = await Promise.all([
        GroupMemberModel.countDocuments({ group: group._id, status: 'pending' }),
        PostModel.countDocuments({ group: group._id, groupStatus: 'pending' }),
        GroupReportModel.countDocuments({ group: group._id, status: 'open' }),
      ]);
      extra = { pendingMembersCount, pendingPostsCount, openReportsCount };
    }
    res.json({ group: groupToJson(group, membership, extra) });
  });

  /** Sửa nhóm (quản trị viên). Đổi quyền riêng tư (công khai / riêng tư) chỉ chủ nhóm làm được. */
  router.patch('/:id', withGroup, requireAdmin, validate(updateGroupSchema), async (req, res) => {
    const { group, membership } = res.locals;
    if (req.body.privacy !== undefined && req.body.privacy !== group.privacy && membership.role !== 'owner') {
      return res.status(403).json({ error: 'Chỉ chủ nhóm mới được đổi quyền riêng tư của nhóm.' });
    }
    Object.assign(group, req.body);
    await group.save();
    res.json({ group: groupToJson(group, membership) });
  });

  /** Xoá nhóm (chủ nhóm): xoá cả thành viên, bài viết, bình luận và báo cáo. */
  router.delete('/:id', withGroup, requireOwner, async (_req, res) => {
    const { group } = res.locals;
    await removeGroup(group);
    res.json({ ok: true });
  });

  /** Xin tham gia nhóm (MỌI nhóm, kể cả công khai, đều phải chờ quản trị viên duyệt; nhóm có câu hỏi thì phải trả lời đủ). */
  router.post('/:id/join', withGroup, validate(joinGroupSchema), async (req, res) => {
    const { group, membership } = res.locals;
    const me = req.userId;
    if (membership) return res.status(409).json({ error: membership.status === 'active' ? 'Bạn đã là thành viên của nhóm này.' : 'Bạn đã gửi yêu cầu tham gia, đang chờ duyệt.' });
    if (await isBlockedBetween(me, getId(group.owner))) return res.status(403).json({ error: 'Không thể tham gia nhóm này.' });

    const questions: string[] = group.joinQuestions || [];
    const answers: string[] = req.body.answers;
    if (questions.length > 0 && (answers.length !== questions.length || answers.some((a) => !a))) {
      return res.status(400).json({ error: 'Vui lòng trả lời tất cả câu hỏi trước khi xin tham gia.' });
    }
    const pending = await GroupMemberModel.create({
      group: group._id,
      user: me,
      role: 'member',
      rank: ROLE_RANK.member,
      status: 'pending',
      answers: questions.map((question, i) => ({ question, answer: answers[i] })),
    });
    await notifyAdmins(group, me, `đã xin tham gia nhóm "${group.name}".`);
    res.json({ group: groupToJson(group, pending) });
  });

  /** Rời nhóm, hoặc huỷ yêu cầu tham gia đang chờ. Chủ nhóm không rời được (phải chuyển quyền hoặc xoá nhóm). */
  router.delete('/:id/join', withGroup, async (req, res) => {
    const { group, membership } = res.locals;
    if (!membership) return res.status(404).json({ error: 'Bạn chưa tham gia nhóm này.' });
    if (membership.role === 'owner') return res.status(400).json({ error: 'Chủ nhóm không thể rời nhóm. Hãy chuyển quyền chủ nhóm hoặc xoá nhóm.' });

    // findOneAndDelete: nếu bấm 2 lần cùng lúc thì chỉ một lần xoá được → bộ đếm chỉ giảm một lần
    const removed = await GroupMemberModel.findOneAndDelete({ _id: membership._id });
    if (removed && membership.status === 'active') {
      await bumpMembers(group.id, -1);
      await PostModel.deleteMany({ group: group._id, author: req.userId, groupStatus: 'pending' });
    }
    res.json({ ok: true });
  });
}

import { Router } from 'express';
import { PostModel } from '../../models/Post';
import { GroupReportModel } from '../../models/GroupReport';
import { validate, reportGroupPostSchema, resolveReportSchema } from '../../validation';
import { reportToJson, getId, Doc } from '../../formatResponse';
import { emitToGroupMembers } from '../../groupRules';
import { POPULATE } from '../posts.routes';
import { withGroup, requireActive, requireAdmin, notifyGroup, notifyAdmins, removePost } from './middleware';

// Báo cáo bài viết: thành viên báo cáo, quản trị viên xem và xử lý (bỏ qua / xoá bài).

export function registerGroupReports(router: Router) {
  /** Báo cáo một bài đã duyệt cho quản trị viên (thành viên; không báo cáo bài của mình; mỗi người một lần). */
  router.post('/:id/posts/:postId/report', withGroup, requireActive, validate(reportGroupPostSchema), async (req, res) => {
    const { group } = res.locals;
    const post = await PostModel.findOne({ _id: req.params.postId, group: group._id, groupStatus: 'approved' });
    if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
    if (getId(post.author) === req.userId) return res.status(400).json({ error: 'Bạn không thể báo cáo bài viết của chính mình.' });
    await GroupReportModel.create({ group: group._id, post: post._id, reporter: req.userId, reason: req.body.reason }); // báo cáo trùng → lỗi khoá duy nhất → 409
    await notifyAdmins(group, req.userId, `đã báo cáo một bài viết trong nhóm "${group.name}".`, 'reports');
    res.json({ ok: true });
  });

  /** Các báo cáo chưa xử lý (quản trị viên). */
  router.get('/:id/reports', withGroup, requireAdmin, async (_req, res) => {
    const { group } = res.locals;
    const reports = await GroupReportModel.find({ group: group._id, status: 'open' })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('reporter')
      .populate({ path: 'post', populate: POPULATE });
    res.json({ reports: reports.filter((r: Doc) => r.post).map(reportToJson) });
  });

  /** Xử lý báo cáo (quản trị viên): bỏ qua, hoặc xoá bài bị báo cáo. */
  router.post('/:id/reports/:reportId/resolve', withGroup, requireAdmin, validate(resolveReportSchema), async (req, res) => {
    const { group } = res.locals;
    const report = await GroupReportModel.findOne({ _id: req.params.reportId, group: group._id, status: 'open' });
    if (!report) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });

    if (req.body.action === 'dismiss') {
      await GroupReportModel.updateOne({ _id: report._id }, { status: 'resolved' });
      return res.json({ ok: true });
    }
    const post = await PostModel.findById(report.post);
    if (post) {
      const authorId = getId(post.author);
      await removePost(post);
      if (authorId !== req.userId) await notifyGroup(authorId, req.userId, group, `đã xoá bài viết của bạn khỏi nhóm "${group.name}" do bị báo cáo.`);
      await emitToGroupMembers(group.id, 'post:delete', { postId: post.id }, { exclude: req.userId });
    }
    await GroupReportModel.deleteOne({ _id: report._id }); // báo cáo không còn bài để xử lý (removePost đã xoá phần lớn)
    res.json({ ok: true });
  });
}

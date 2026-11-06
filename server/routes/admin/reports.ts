import { Router } from 'express';
import { ReportModel } from '../../models/Report';
import { UserModel } from '../../models/User';
import { validate, handleReportSchema } from '../../validation';
import { pageParams } from '../../pagination';
import { escapeRegex } from '../../regex';
import { logAdminAction } from '../../auditLog';
import { createNotification } from '../../createNotification';
import { emitToAdmins } from '../../adminRealtime';
import { Doc } from '../../formatResponse';
import { adminReportToJson } from './format';
import { removeTarget, RemovableType } from './removal';

// Báo cáo vi phạm do người dùng gửi: xem, xử lý (xác nhận có / không gỡ nội dung) hoặc bỏ qua.

export const adminReportsRouter = Router();
const POPULATE_REPORT = [{ path: 'reporter', select: 'name username avatar' }, { path: 'handledBy', select: 'name username avatar' }];

adminReportsRouter.get('/', async (req, res) => {
  const filter: Record<string, unknown> = {};
  const status = String(req.query.status);
  if (['pending', 'resolved', 'dismissed'].includes(status)) filter.status = status;
  const q = String(req.query.q || '').trim();
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    const reporters = await UserModel.find({ $or: [{ name: regex }, { username: regex }] }).select('_id').limit(200);
    filter.$or = [{ targetName: regex }, { description: regex }, { reporter: { $in: reporters.map((u: Doc) => u._id) } }];
  }
  const { limit, skip } = pageParams(req.query, 30);
  const [reports, total, pending] = await Promise.all([
    ReportModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate(POPULATE_REPORT),
    ReportModel.countDocuments(filter),
    ReportModel.countDocuments({ status: 'pending' }),
  ]);
  res.json({ reports: reports.map(adminReportToJson), total, pending });
});

/**
 * Xử lý một báo cáo: resolved (đã xử lý, tuỳ chọn gỡ luôn nội dung bị báo cáo) hoặc dismissed (bỏ qua).
 * Gỡ nội dung → mọi báo cáo đang chờ về cùng đối tượng cũng được đóng. Người báo cáo nhận thông báo kết quả.
 */
adminReportsRouter.patch('/:id', validate(handleReportSchema), async (req, res) => {
  const { status, note, removeContent } = req.body;
  const report = await ReportModel.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
  if (report.status !== 'pending') return res.status(409).json({ error: 'Báo cáo này đã được xử lý.' });
  if (removeContent && (status !== 'resolved' || report.targetType === 'user')) return res.status(400).json({ error: 'Chỉ gỡ được bài viết, bình luận, nhóm hoặc trang khi xác nhận báo cáo; với người dùng hãy dùng khoá tài khoản.' });

  const removed = removeContent ? await removeTarget(report.targetType as RemovableType, report.targetId, req.userId) : null;
  const handled = { status, resolutionNote: note || undefined, handledBy: req.userId, handledAt: new Date() };
  await ReportModel.updateMany(removed ? { targetType: report.targetType, targetId: report.targetId, status: 'pending' } : { _id: report._id }, handled);
  await logAdminAction(req.userId, `report.${status === 'resolved' ? 'resolve' : 'dismiss'}`, 'report', report.id, { targetType: report.targetType, targetId: report.targetId, removed: !!removed, note: note || undefined });

  await createNotification({
    user: report.reporter.toString(),
    actor: req.userId,
    type: 'system',
    content: status === 'resolved' ? 'Cảm ơn bạn, báo cáo của bạn đã được xử lý.' : 'Báo cáo của bạn đã được xem xét và không phát hiện vi phạm.',
    targetType: 'system',
  });
  const fresh = await ReportModel.findById(report._id).populate(POPULATE_REPORT);
  res.json({ report: adminReportToJson(fresh) });
  emitToAdmins('report:update', { id: report.id, status });
});

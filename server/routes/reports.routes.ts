import { Router } from 'express';
import { ReportModel } from '../models/Report';
import { PostModel } from '../models/Post';
import { CommentModel } from '../models/Comment';
import { GroupModel } from '../models/Group';
import { PageModel } from '../models/Page';
import { UserModel } from '../models/User';
import { requireAuth } from '../jwtAuth';
import { validate, createReportSchema } from '../validation';
import { emitToAdmins } from '../adminRealtime';
import { Doc, getId } from '../formatResponse';

// API báo cáo vi phạm (/api/reports): người dùng báo cáo bài viết / bình luận / người dùng / nhóm / trang cho quản trị hệ thống.

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const clip = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Đối tượng bị báo cáo: tên hiển thị + chủ của nó (để chặn tự báo cáo). */
const DESCRIBE: Record<string, (id: string) => Promise<{ name: string; ownerId: string } | null>> = {
  post: async (id) => {
    const p = await PostModel.findById(id).select('content author kind');
    return p && { name: clip(p.content || (p.kind === 'reel' ? '[Reel]' : '[Bài viết không có chữ]')), ownerId: getId(p.author) };
  },
  comment: async (id) => {
    const c = await CommentModel.findById(id).select('content author');
    return c && { name: clip(c.content || '[Ảnh]'), ownerId: getId(c.author) };
  },
  user: async (id) => {
    const u = await UserModel.findById(id).select('name');
    return u && { name: u.name, ownerId: u.id };
  },
  group: async (id) => {
    const g = await GroupModel.findById(id).select('name owner');
    return g && { name: g.name, ownerId: getId(g.owner) };
  },
  page: async (id) => {
    const pg = await PageModel.findById(id).select('name owner');
    return pg && { name: pg.name, ownerId: getId(pg.owner) };
  },
};

reportsRouter.post('/', validate(createReportSchema), async (req, res) => {
  const { targetType, targetId, reason, description } = req.body;
  const target = await DESCRIBE[targetType](targetId);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy nội dung cần báo cáo.' });
  if (target.ownerId === req.userId) return res.status(400).json({ error: 'Bạn không thể báo cáo nội dung của chính mình.' });

  try {
    const report = await ReportModel.create({ reporter: req.userId, targetType, targetId, targetName: target.name, reason, description });
    res.status(201).json({ ok: true });
    emitToAdmins('report:new', { id: report.id, targetType, targetName: target.name });
  } catch (error) {
    if ((error as Doc).code !== 11000) throw error;
    res.status(409).json({ error: 'Bạn đã báo cáo nội dung này rồi. Quản trị viên sẽ xem xét sớm.' });
  }
});

import { Router } from 'express';
import { PostModel } from '../../models/Post';
import { CommentModel } from '../../models/Comment';
import { GroupModel } from '../../models/Group';
import { PageModel } from '../../models/Page';
import { UserModel } from '../../models/User';
import { pageParams } from '../../pagination';
import { escapeRegex } from '../../regex';
import { logAdminAction } from '../../auditLog';
import { Doc } from '../../formatResponse';
import { adminPostToJson, adminCommentToJson, adminGroupToJson, adminPageToJson } from './format';
import { removeTarget, RemovableType } from './removal';

// Kiểm duyệt nội dung: danh sách bài viết / reel, bình luận, nhóm, trang và gỡ nội dung vi phạm.

export const adminContentRouter = Router();

const KIND_FILTERS: Record<string, Record<string, unknown>> = {
  post: { kind: { $ne: 'reel' }, group: { $exists: false }, page: { $exists: false } },
  reel: { kind: 'reel' },
  group: { group: { $exists: true } },
  page: { page: { $exists: true } },
};

/** Điều kiện tìm: nội dung chứa chữ q, hoặc do người có tên / username khớp q viết. */
async function textOrAuthorFilter(q: string, contentField: string) {
  if (!q) return {};
  const regex = new RegExp(escapeRegex(q), 'i');
  const authors = await UserModel.find({ $or: [{ name: regex }, { username: regex }] }).select('_id').limit(200);
  return { $or: [{ [contentField]: regex }, { author: { $in: authors.map((a: Doc) => a._id) } }] };
}

adminContentRouter.get('/posts', async (req, res) => {
  const filter = { ...KIND_FILTERS[String(req.query.kind)], ...(await textOrAuthorFilter(String(req.query.q || '').trim(), 'content')) };
  const { limit, skip } = pageParams(req.query, 30);
  const [posts, total] = await Promise.all([
    PostModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('author group page', 'name username avatar'),
    PostModel.countDocuments(filter),
  ]);
  res.json({ posts: posts.map(adminPostToJson), total });
});

adminContentRouter.get('/comments', async (req, res) => {
  const filter = await textOrAuthorFilter(String(req.query.q || '').trim(), 'content');
  const { limit, skip } = pageParams(req.query, 30);
  const [comments, total] = await Promise.all([
    CommentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('author', 'name username avatar').populate('post', 'content'),
    CommentModel.countDocuments(filter),
  ]);
  res.json({ comments: comments.map(adminCommentToJson), total });
});

/** Đếm bài viết theo từng nhóm / trang trong danh sách (một truy vấn gộp thay vì đếm từng cái). */
async function countPostsBy(field: 'group' | 'page', ids: unknown[]) {
  const rows = await PostModel.aggregate([{ $match: { [field]: { $in: ids } } }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
  return new Map<string, number>(rows.map((r: { _id: unknown; count: number }) => [String(r._id), r.count]));
}

adminContentRouter.get('/groups', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const regex = new RegExp(escapeRegex(q), 'i');
  const filter = q ? { $or: [{ name: regex }, { description: regex }] } : {};
  const { limit, skip } = pageParams(req.query, 30);
  const [groups, total] = await Promise.all([GroupModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('owner', 'name username avatar'), GroupModel.countDocuments(filter)]);
  const counts = await countPostsBy('group', groups.map((g: Doc) => g._id));
  res.json({ groups: groups.map((g: Doc) => adminGroupToJson(g, counts.get(String(g._id)) ?? 0)), total });
});

adminContentRouter.get('/pages', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = q ? { name: new RegExp(escapeRegex(q), 'i') } : {};
  const { limit, skip } = pageParams(req.query, 30);
  const [pages, total] = await Promise.all([PageModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('owner', 'name username avatar'), PageModel.countDocuments(filter)]);
  const counts = await countPostsBy('page', pages.map((p: Doc) => p._id));
  res.json({ pages: pages.map((p: Doc) => adminPageToJson(p, counts.get(String(p._id)) ?? 0)), total });
});

/** DELETE /api/admin/posts|comments|groups|pages/:id */
for (const [path, type] of [['posts', 'post'], ['comments', 'comment'], ['groups', 'group'], ['pages', 'page']] as [string, RemovableType][]) {
  adminContentRouter.delete(`/${path}/:id`, async (req, res) => {
    const removed = await removeTarget(type, req.params.id, req.userId);
    if (!removed) return res.status(404).json({ error: 'Không tìm thấy nội dung.' });
    await logAdminAction(req.userId, `${type}.delete`, type, req.params.id, { ownerId: removed.ownerId });
    res.json({ ok: true });
  });
}

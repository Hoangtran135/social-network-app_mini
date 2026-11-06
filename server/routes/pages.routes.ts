import { Router, RequestHandler } from 'express';
import { PageModel } from '../models/Page';
import { PageFollowModel } from '../models/PageFollow';
import { PostModel } from '../models/Post';
import { CommentModel } from '../models/Comment';
import { UserModel } from '../models/User';
import { createNotification } from '../createNotification';
import { requireAuth } from '../jwtAuth';
import { validate, createPageSchema, updatePageSchema, pageAdminSchema, createPagePostSchema } from '../validation';
import { pageToJson, postToJson, userToJson, getId, Doc } from '../formatResponse';
import { emitToAllowedViewers, isBlockedBetween } from '../privacyRules';
import { pageParams } from '../pagination';
import { extractHashtags } from '../hashtags';
import { POPULATE } from './posts.routes';
import { escapeRegex } from '../regex';
import { removePage } from '../contentRemoval';

// API Trang / fanpage (/api/pages): danh sách (của tôi / đang theo dõi / khám phá), tạo, xem, sửa, xoá trang,
// theo dõi / bỏ theo dõi, quản trị viên (chủ trang thêm / gỡ), đăng bài với tư cách trang và xoá bài của trang.
// Bài của trang luôn công khai (hiện ở bảng tin và trang của trang); chủ trang + quản trị viên là những người được đăng.

export const pagesRouter = Router();
pagesRouter.use(requireAuth);

const isAdminOf = (page: Doc, userId: string) => getId(page.owner) === userId || page.admins.some((a: Doc) => getId(a) === userId);

/** Nạp trang theo :id (kèm chủ trang + quản trị viên) và trạng thái theo dõi của người gọi vào res.locals. */
const withPage: RequestHandler = async (req, res, next) => {
  const page = await PageModel.findById(req.params.id).populate(['owner', 'admins']);
  if (!page) return res.status(404).json({ error: 'Không tìm thấy trang.' });
  res.locals.page = page;
  res.locals.following = !!(await PageFollowModel.exists({ page: page._id, user: req.userId }));
  next();
};
const requirePageAdmin: RequestHandler = (req, res, next) => (isAdminOf(res.locals.page, req.userId) ? next() : void res.status(403).json({ error: 'Chỉ quản trị viên của trang mới có quyền này.' }));
const requirePageOwner: RequestHandler = (req, res, next) => (getId(res.locals.page.owner) === req.userId ? next() : void res.status(403).json({ error: 'Chỉ chủ trang mới có quyền này.' }));

/** Xoá một bài của trang cùng bình luận của nó và báo cho mọi người xem. */
async function removePagePost(post: Doc, actorId: string) {
  await CommentModel.deleteMany({ post: post._id });
  await post.deleteOne();
  emitToAllowedViewers('public', actorId, 'post:delete', { postId: post.id }, actorId);
}

/** Danh sách trang. scope: mine = trang mình quản trị; following = trang mình theo dõi; còn lại (discover) = trang chưa theo dõi / không quản trị. */
pagesRouter.get('/', async (req, res) => {
  const me = req.userId;
  const { limit, skip } = pageParams(req.query, 30);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const filter: Record<string, unknown> = q ? { name: new RegExp(escapeRegex(q), 'i') } : {};
  const followed = (await PageFollowModel.find({ user: me }).select('page')).map((f: Doc) => f.page);
  const scope = req.query.scope;
  let sort: Record<string, 1 | -1> = { followersCount: -1, createdAt: -1 };
  if (scope === 'mine') {
    filter.$or = [{ owner: me }, { admins: me }];
    sort = { createdAt: -1 };
  } else if (scope === 'following') {
    filter._id = { $in: followed };
    sort = { followersCount: -1, createdAt: -1 };
  } else {
    filter._id = { $nin: followed };
    filter.owner = { $ne: me };
    filter.admins = { $ne: me };
  }
  const pages = await PageModel.find(filter).sort(sort).limit(limit).skip(skip).populate(['owner', 'admins']);
  const followedSet = new Set(followed.map(String));
  res.json({ pages: pages.map((p: Doc) => pageToJson(p, me, followedSet.has(getId(p)))) });
});

/** Tạo trang: người tạo là chủ trang. */
pagesRouter.post('/', validate(createPageSchema), async (req, res) => {
  const page = await PageModel.create({ ...req.body, owner: req.userId });
  await page.populate(['owner', 'admins']);
  res.json({ page: pageToJson(page, req.userId, false) });
});

pagesRouter.get('/:id', withPage, (req, res) => res.json({ page: pageToJson(res.locals.page, req.userId, res.locals.following) }));

/** Sửa trang (chủ trang + quản trị viên). */
pagesRouter.patch('/:id', withPage, requirePageAdmin, validate(updatePageSchema), async (req, res) => {
  const { page, following } = res.locals;
  Object.assign(page, req.body);
  await page.save();
  res.json({ page: pageToJson(page, req.userId, following) });
});

/** Xoá trang (chủ trang): xoá cả bài viết, bình luận và lượt theo dõi. */
pagesRouter.delete('/:id', withPage, requirePageOwner, async (_req, res) => {
  const { page } = res.locals;
  await removePage(page);
  res.json({ ok: true });
});

// ----- Theo dõi -----

/** Theo dõi trang (không trùng: theo dõi nhiều lần / song song vẫn chỉ tính một). Chủ trang được báo. */
pagesRouter.post('/:id/follow', withPage, async (req, res) => {
  const { page } = res.locals;
  const me = req.userId;
  let inserted = false;
  try {
    inserted = (await PageFollowModel.updateOne({ page: page._id, user: me }, { $setOnInsert: { page: page._id, user: me } }, { upsert: true })).upsertedCount === 1;
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err; // 2 yêu cầu cùng lúc: bên kia đã tạo rồi
  }
  if (inserted) {
    await PageModel.updateOne({ _id: page._id }, { $inc: { followersCount: 1 } });
    page.followersCount = (page.followersCount || 0) + 1;
    if (getId(page.owner) !== me) await createNotification({ user: getId(page.owner), actor: me, type: 'system', content: `đã theo dõi trang "${page.name}" của bạn.`, targetId: page.id, targetType: 'page' });
  }
  res.json({ page: pageToJson(page, me, true) });
});

/** Bỏ theo dõi trang. */
pagesRouter.delete('/:id/follow', withPage, async (req, res) => {
  const { page } = res.locals;
  const removed = (await PageFollowModel.deleteOne({ page: page._id, user: req.userId })).deletedCount === 1;
  if (removed) {
    await PageModel.updateOne({ _id: page._id }, [{ $set: { followersCount: { $max: [0, { $subtract: [{ $ifNull: ['$followersCount', 0] }, 1] }] } } }], { updatePipeline: true });
    page.followersCount = Math.max(0, page.followersCount - 1);
  }
  res.json({ page: pageToJson(page, req.userId, false) });
});

/** Danh sách người theo dõi (chỉ quản trị viên của trang). */
pagesRouter.get('/:id/followers', withPage, requirePageAdmin, async (req, res) => {
  const { limit, skip } = pageParams(req.query, 50);
  const follows = await PageFollowModel.find({ page: res.locals.page._id }).sort({ createdAt: -1 }).limit(limit).skip(skip).populate('user');
  res.json({ users: follows.filter((f: Doc) => f.user).map((f: Doc) => userToJson(f.user)) });
});

// ----- Quản trị viên -----

/** Thêm quản trị viên (chủ trang). */
pagesRouter.post('/:id/admins', withPage, requirePageOwner, validate(pageAdminSchema), async (req, res) => {
  const { page } = res.locals;
  const { userId } = req.body;
  if (userId === req.userId) return res.status(400).json({ error: 'Bạn đã là chủ trang.' });
  if (!(await UserModel.exists({ _id: userId }))) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  if (await isBlockedBetween(req.userId, userId)) return res.status(403).json({ error: 'Không thể thêm người dùng này làm quản trị viên.' });
  if (isAdminOf(page, userId)) return res.status(409).json({ error: 'Người này đã là quản trị viên của trang.' });
  await PageModel.updateOne({ _id: page._id }, { $addToSet: { admins: userId } });
  await createNotification({ user: userId, actor: req.userId, type: 'system', content: `đã thêm bạn làm quản trị viên của trang "${page.name}".`, targetId: page.id, targetType: 'page' });
  const fresh = await PageModel.findById(page._id).populate(['owner', 'admins']);
  res.json({ page: pageToJson(fresh, req.userId, res.locals.following) });
});

/** Gỡ quản trị viên: chủ trang gỡ được bất kỳ ai; quản trị viên tự rời được. Chủ trang không bị gỡ. */
pagesRouter.delete('/:id/admins/:userId', withPage, async (req, res) => {
  const { page } = res.locals;
  const me = req.userId;
  const target = req.params.userId;
  if (getId(page.owner) === target) return res.status(400).json({ error: 'Không thể gỡ chủ trang.' });
  if (getId(page.owner) !== me && target !== me) return res.status(403).json({ error: 'Chỉ chủ trang mới gỡ được quản trị viên khác.' });
  if (!page.admins.some((a: Doc) => getId(a) === target)) return res.status(404).json({ error: 'Người này không phải quản trị viên của trang.' });
  await PageModel.updateOne({ _id: page._id }, { $pull: { admins: target } });
  if (target !== me) await createNotification({ user: target, actor: me, type: 'system', content: `đã gỡ quyền quản trị viên của bạn khỏi trang "${page.name}".`, targetId: page.id, targetType: 'page' });
  const fresh = await PageModel.findById(page._id).populate(['owner', 'admins']);
  res.json({ page: pageToJson(fresh, me, res.locals.following) });
});

// ----- Bài viết của trang -----

/** Bài viết của trang (công khai, mới nhất trước). */
pagesRouter.get('/:id/posts', withPage, async (req, res) => {
  const { limit, skip } = pageParams(req.query, 30);
  const posts = await PostModel.find({ page: res.locals.page._id }).sort({ createdAt: -1 }).limit(limit).skip(skip).populate(POPULATE);
  res.json({ posts: posts.map((p: Doc) => postToJson(p, req.userId)) });
});

/** Đăng bài với tư cách trang (chủ trang + quản trị viên). */
pagesRouter.post('/:id/posts', withPage, requirePageAdmin, validate(createPagePostSchema), async (req, res) => {
  const { page } = res.locals;
  if (!req.body.content && !req.body.images?.length && !req.body.video) return res.status(400).json({ error: 'Bài viết không được để trống.' });
  const post = await PostModel.create({ ...req.body, author: req.userId, page: page._id, privacy: 'public', hashtags: extractHashtags(req.body.content) });
  await post.populate(POPULATE);
  res.json({ post: postToJson(post, req.userId) });
  emitToAllowedViewers('public', req.userId, 'post:new', { post: postToJson(post) });
});

/** Xoá bài của trang (chủ trang + quản trị viên, kể cả bài do người khác đăng). */
pagesRouter.delete('/:id/posts/:postId', withPage, requirePageAdmin, async (req, res) => {
  const post = await PostModel.findOne({ _id: req.params.postId, page: res.locals.page._id });
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  await removePagePost(post, req.userId);
  res.json({ ok: true });
});

import { Router } from 'express';
import mongoose from 'mongoose';
import { PostModel } from '../models/Post';
import { createNotification } from '../createNotification';
import { requireAuth } from '../jwtAuth';
import { validate, createPostSchema, updatePostSchema, reactPostSchema, sharePostSchema } from '../validation';
import { postToJson, getId, Doc } from '../formatResponse';
import { getFriendAndBlockedIds, getFriendIds, isBlockedBetween, emitToAllowedViewers, visibleToViewerFilter } from '../privacyRules';
import { canViewPost, canInteractPost, emitToGroupMembers, getMembership, isActiveMember } from '../groupRules';
import { notifyAdmins } from './groups/middleware';
import { GroupModel } from '../models/Group';
import { CommentModel } from '../models/Comment';
import { GroupReportModel } from '../models/GroupReport';
import { UserModel } from '../models/User';
import { pageParams } from '../pagination';
import { extractHashtags, normalizeTag } from '../hashtags';

// API bài viết (/api/posts): bảng tin (lọc theo #hashtag, bỏ bài đã ẩn), kỷ niệm, đăng / sửa (có lịch sử) / xoá bài,
// thả cảm xúc, ghim, lưu, chia sẻ, tắt / bật bình luận, ẩn / hiện lại bài.
// Mọi thay đổi đều được đẩy realtime tới những người được xem bài (post:new / post:update / post:delete).

export const postsRouter = Router();
postsRouter.use(requireAuth);

// Các trường cần "populate" (thay id bằng thông tin đầy đủ) mỗi khi trả bài viết về client (bài nhóm kèm tên nhóm)
export const POPULATE = [{ path: 'author' }, { path: 'wallOwner' }, { path: 'reactions.userId' }, { path: 'savedBy' }, { path: 'taggedUsers' }, { path: 'group', select: 'name' }, { path: 'page', select: 'name avatar' }];

const GROUP_POST_ERROR = 'Bài viết trong nhóm chỉ thao tác được trong trang nhóm.';

/** Gửi bài viết realtime tới người được xem (bài nhóm: chỉ thành viên nhóm; bài chờ duyệt: chỉ quản trị viên) */
const emitPostToViewers = (post: Doc, event: 'post:new' | 'post:update') =>
  post.group
    ? emitToGroupMembers(getId(post.group), event, { post: postToJson(post) }, { exclude: getId(post.author), adminsOnly: post.groupStatus === 'pending', hideFromBlockedBy: getId(post.author) })
    : emitToAllowedViewers(post.privacy, getId(post.author), event, { post: postToJson(post) });

/** Lấy bài viết nếu được xem */
async function findPostIfVisible(id: string, userId: string) {
  const post = await PostModel.findById(id).populate(POPULATE);
  return post && (await canViewPost(post, userId)) ? post : null;
}

/** Lấy bảng tin. ?tag=<hashtag> chỉ lấy bài có hashtag đó. Bài mình đã ẩn không hiện. */
postsRouter.get('/', async (req, res) => {
  const { limit, skip } = pageParams(req.query, 30);
  const me = req.userId;
  const { friendIds, blockedIds } = await getFriendAndBlockedIds(me);
  // Lọc quyền xem ngay trong truy vấn (không phải sau khi đã cắt trang) → mỗi trang đủ `limit` bài, phân trang đúng:
  // bài của mình, bài công khai, bài "bạn bè" của bạn bè; bỏ bài của người bị chặn. Bài nhóm chỉ xem ở trang nhóm; reel chỉ ở mục Reels.
  const filter: Record<string, unknown> = { hiddenBy: { $ne: me }, group: null, kind: { $ne: 'reel' }, ...visibleToViewerFilter(me, friendIds, blockedIds) };
  if (req.query.tag !== undefined) {
    const tag = normalizeTag(req.query.tag);
    if (!tag) return res.json({ posts: [] }); // tag rác → không có bài nào (không lỗi, không trả toàn bộ bảng tin)
    filter.hashtags = tag;
  }
  const posts = await PostModel.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).populate(POPULATE);
  res.json({ posts: posts.map((p: Doc) => postToJson(p, me)) });
});

/** Lấy kỷ niệm (phải đặt trước '/:id') */
postsRouter.get('/memories', async (req, res) => {
  const now = new Date();
  const posts = await PostModel.find({ author: req.userId, group: null, kind: { $ne: 'reel' }, createdAt: { $lt: new Date(now.getFullYear(), 0, 1) } })
    .sort({ createdAt: -1 })
    .populate(POPULATE);
  const memories = posts.filter((p: Doc) => p.createdAt.getDate() === now.getDate() && p.createdAt.getMonth() === now.getMonth());
  res.json({ posts: memories.map((p: Doc) => postToJson(p, req.userId)) });
});

/** Lấy chi tiết bài viết */
postsRouter.get('/:id', async (req, res) => {
  const post = await findPostIfVisible(req.params.id, req.userId);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  res.json({ post: postToJson(post, req.userId) });
});

/** Đăng bài viết */
postsRouter.post('/', validate(createPostSchema), async (req, res) => {
  const { wallOwnerId, taggedUserIds = [], ...fields } = req.body;
  const me = req.userId;
  if (!fields.content && !fields.images?.length && !fields.video) return res.status(400).json({ error: 'Bài viết không được để trống.' });
  const wallOwner = wallOwnerId && wallOwnerId !== me ? wallOwnerId : undefined;
  // Đăng lên tường người khác: người đó phải tồn tại, không chặn nhau, và hai bên là bạn bè (đúng như giao diện cho phép)
  if (wallOwner) {
    if (!(await UserModel.exists({ _id: wallOwner }))) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    if (await isBlockedBetween(me, wallOwner)) return res.status(403).json({ error: 'Không thể đăng lên tường của người dùng này.' });
    if (!(await getFriendIds(me)).has(wallOwner)) return res.status(403).json({ error: 'Chỉ bạn bè mới được đăng lên tường của nhau.' });
  }
  const tagged: string[] = [...new Set<string>(taggedUserIds)].filter((id) => id !== me);

  const post = await PostModel.create({ ...fields, author: me, wallOwner, taggedUsers: tagged, hashtags: extractHashtags(fields.content) });
  await post.populate(POPULATE);

  const target = { targetId: post.id, targetType: 'post' as const };
  if (wallOwner) await createNotification({ user: wallOwner, actor: me, type: 'system', content: 'đã đăng một bài viết lên tường nhà bạn.', ...target });
  await Promise.all(tagged.map((id) => createNotification({ user: id, actor: me, type: 'system', content: 'đã gắn thẻ bạn trong một bài viết.', ...target })));

  res.json({ post: postToJson(post, me) });
  emitPostToViewers(post, 'post:new');
});

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Nội dung / ảnh / video của bài có bị đổi bởi bản sửa này không. */
const changesContent = (post: Doc, body: Record<string, unknown>) =>
  (body.content !== undefined && body.content !== post.content) || (body.images !== undefined && !sameJson([...post.images], body.images)) || (body.video !== undefined && body.video !== post.video);

/**
 * Luật sửa bài NHÓM: tác giả phải còn là thành viên; nhóm bật duyệt bài thì thành viên thường sửa nội dung / ảnh / video của bài đã duyệt
 * sẽ đưa bài quay lại "chờ duyệt" (tránh duyệt bài lành rồi đổi sang nội dung vi phạm). Trả về lỗi, hoặc nhóm + cờ cần duyệt lại.
 */
async function checkGroupPostEdit(post: Doc, userId: string, body: Record<string, unknown>) {
  const membership = await getMembership(getId(post.group), userId);
  if (!isActiveMember(membership)) return { error: 'Bạn không còn là thành viên của nhóm này nên không thể sửa bài viết.' } as const;
  const group = await GroupModel.findById(post.group);
  const needsReapproval = !!group?.postApproval && membership?.role === 'member' && post.groupStatus === 'approved' && changesContent(post, body);
  return { group, needsReapproval } as const;
}

/** Sửa bài viết */
postsRouter.patch('/:id', validate(updatePostSchema), async (req, res) => {
  const post = await PostModel.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  if (post.author.toString() !== req.userId) return res.status(403).json({ error: 'Bạn không có quyền sửa bài viết này.' });

  // Quyền riêng tư của bài nhóm (luôn 'only_me') và bài của trang (luôn 'public') do hệ thống quản, tác giả không được đổi
  if (post.group || post.page) delete req.body.privacy;

  let reapproval: { group: Doc } | null = null;
  if (post.group) {
    const check = await checkGroupPostEdit(post, req.userId, req.body);
    if ('error' in check) return res.status(403).json({ error: check.error });
    if (check.needsReapproval) reapproval = { group: check.group };
  }

  // Nội dung đổi thì lưu phiên bản cũ vào lịch sử (tối đa 20 phiên bản gần nhất) và tính lại hashtag
  if (req.body.content !== undefined && req.body.content !== post.content) {
    post.editHistory = [...(post.editHistory || []), { content: post.content, editedAt: new Date() }].slice(-20);
    post.hashtags = extractHashtags(req.body.content);
  }
  Object.assign(post, req.body, { editedAt: new Date() });
  if (reapproval) post.groupStatus = 'pending';
  await post.save();
  await post.populate(POPULATE);
  res.json({ post: postToJson(post, req.userId) });

  if (!reapproval) return void emitPostToViewers(post, 'post:update');
  // Bài quay lại chờ duyệt: thành viên khác phải bỏ bản đã duyệt cũ; chỉ quản trị viên được báo và thấy bản chờ duyệt
  const groupId = getId(post.group);
  await notifyAdmins(reapproval.group, req.userId, `đã sửa một bài viết đã duyệt trong nhóm "${reapproval.group.name}", bài đang chờ duyệt lại.`, 'pending-posts');
  await emitToGroupMembers(groupId, 'post:delete', { postId: post.id }, { exclude: req.userId });
  await emitToGroupMembers(groupId, 'post:new', { post: postToJson(post) }, { exclude: req.userId, adminsOnly: true, hideFromBlockedBy: req.userId });
});

/** Xoá bài viết */
postsRouter.delete('/:id', async (req, res) => {
  const post = await PostModel.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  if (post.author.toString() !== req.userId) return res.status(403).json({ error: 'Bạn không có quyền xóa bài viết này.' });

  // Xoá kèm bình luận của bài (không để lại bình luận mồ côi)
  await Promise.all([CommentModel.deleteMany({ post: post._id }), post.deleteOne()]);
  res.json({ ok: true });
  if (post.group) {
    await GroupReportModel.deleteMany({ post: post._id });
    emitToGroupMembers(getId(post.group), 'post:delete', { postId: post.id }, { exclude: req.userId, adminsOnly: post.groupStatus === 'pending' });
  } else emitToAllowedViewers(post.privacy, req.userId, 'post:delete', { postId: post.id });
});

/** Thả / đổi / bỏ cảm xúc bài viết */
  postsRouter.post('/:id/react', validate(reactPostSchema), async (req, res) => {
    const { type } = req.body;
    const me = req.userId;
    const post = await findPostIfVisible(req.params.id, me);
    if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
    if (post.group && !(await canInteractPost(post, me, true))) return res.status(403).json({ error: 'Bạn cần tham gia nhóm để tương tác với bài viết này.' });

    const _id = post._id;
    // MỘT cập nhật nguyên tử (pipeline): cùng loại thì bỏ, khác loại thì thay, chưa có thì thêm. Nhiều request song song của cùng một người
    // được MongoDB xử lý lần lượt trên tài liệu, nên không bao giờ có hơn 1 cảm xúc của một người (kiểu "đọc rồi ghi" nhiều bước thì có).
    const meId = new mongoose.Types.ObjectId(me);
    const all = { $ifNull: ['$reactions', []] };
    const others = { $filter: { input: all, cond: { $ne: ['$$this.userId', meId] } } };
    const myTypes = { $map: { input: { $filter: { input: all, cond: { $eq: ['$$this.userId', meId] } } }, as: 'r', in: '$$r.type' } };
    const before = await PostModel.findOneAndUpdate(
      { _id },
      [{ $set: { reactions: { $cond: [{ $in: [type, myTypes] }, others, { $concatArrays: [others, [{ type, userId: meId }]] }] } } }],
      { updatePipeline: true, returnDocument: 'before' }
    );
    const hadReaction = (before?.reactions || []).some((r: Doc) => r.userId.toString() === me);
    if (!hadReaction) {
      const authorId = getId(post.author);
      if (authorId !== me) {
        await createNotification({ user: authorId, actor: me, type: 'like', content: `đã thả cảm xúc (${type}) về bài viết của bạn`, targetId: post.id, targetType: 'post' });
      }
    }

    const fresh = await PostModel.findById(_id).populate(POPULATE);
    res.json({ post: postToJson(fresh, me) });
    emitPostToViewers(fresh, 'post:update');
  });

/** Ghim / bỏ ghim bài viết */
postsRouter.post('/:id/pin', async (req, res) => {
  const post = await PostModel.findById(req.params.id).populate(POPULATE);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  if (getId(post.author) !== req.userId) return res.status(403).json({ error: 'Bạn không có quyền ghim bài viết này.' });
  if (post.group) return res.status(400).json({ error: GROUP_POST_ERROR });

  post.pinned = !post.pinned;
  await post.save();
  res.json({ post: postToJson(post, req.userId) });
  emitPostToViewers(post, 'post:update');
});

/** Tắt / bật bình luận (chỉ chủ bài) */
postsRouter.post('/:id/toggle-comments', async (req, res) => {
  const post = await PostModel.findById(req.params.id).populate(POPULATE);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  if (getId(post.author) !== req.userId) return res.status(403).json({ error: 'Bạn không có quyền tắt bình luận của bài viết này.' });

  post.commentsDisabled = !post.commentsDisabled;
  await post.save();
  res.json({ post: postToJson(post, req.userId) });
  emitPostToViewers(post, 'post:update');
});

/** Ẩn bài khỏi bảng tin của mình ("không quan tâm"). Không ảnh hưởng người khác. */
postsRouter.post('/:id/hide', async (req, res) => {
  const post = await findPostIfVisible(req.params.id, req.userId);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  await PostModel.updateOne({ _id: post._id }, { $addToSet: { hiddenBy: req.userId } });
  res.json({ ok: true });
});

/** Hiện lại bài đã ẩn (hoàn tác) */
postsRouter.delete('/:id/hide', async (req, res) => {
  const post = await PostModel.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  await PostModel.updateOne({ _id: post._id }, { $pull: { hiddenBy: req.userId } });
  res.json({ ok: true });
});

/** Lưu / bỏ lưu bài viết */
postsRouter.post('/:id/save', async (req, res) => {
  const post = await findPostIfVisible(req.params.id, req.userId);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  if (post.group) return res.status(400).json({ error: GROUP_POST_ERROR });

  const alreadySaved = post.savedBy.some((u: Doc) => getId(u) === req.userId);
  await PostModel.updateOne({ _id: post._id }, alreadySaved ? { $pull: { savedBy: req.userId } } : { $addToSet: { savedBy: req.userId } });
  const fresh = await PostModel.findById(post._id).populate(POPULATE);
  res.json({ post: postToJson(fresh, req.userId) });
});

/** Chia sẻ bài viết */
postsRouter.post('/:id/share', validate(sharePostSchema), async (req, res) => {
  const original = await findPostIfVisible(req.params.id, req.userId);
  if (!original) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  if (original.group) return res.status(400).json({ error: GROUP_POST_ERROR });
  if (original.kind === 'reel') return res.status(400).json({ error: 'Không thể chia sẻ Reel lên trang cá nhân.' });

  await PostModel.updateOne({ _id: original._id }, { $inc: { sharesCount: 1 } });
  original.sharesCount = (original.sharesCount || 0) + 1; // để phản hồi / sự kiện realtime hiện số mới

  const quote = `[Chia sẻ từ @${original.author.name}]:\n${original.content}`;
  const shared = await PostModel.create({
    author: req.userId,
    content: req.body.message ? `${req.body.message}\n\n${quote}` : quote,
    images: original.images,
    // Không làm rộng quyền xem: bài gốc chỉ-bạn-bè thì bài chia sẻ cũng chỉ bạn bè của người chia sẻ xem được
    privacy: original.privacy === 'public' ? 'public' : 'friends',
    hashtags: extractHashtags(req.body.message ? `${req.body.message}\n\n${quote}` : quote),
  });
  await shared.populate(POPULATE);
  res.json({ post: postToJson(shared, req.userId) });
  emitPostToViewers(shared, 'post:new');
  emitPostToViewers(original, 'post:update');
});

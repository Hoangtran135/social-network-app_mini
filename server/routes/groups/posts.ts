import { Router } from 'express';
import { PostModel } from '../../models/Post';
import { validate, createGroupPostSchema } from '../../validation';
import { postToJson, getId, Doc } from '../../formatResponse';
import { getBlockedIds } from '../../privacyRules';
import { isGroupAdmin, isActiveMember, emitToGroupMembers } from '../../groupRules';
import { emitToUsers } from '../../socketServer';
import { pageParams } from '../../pagination';
import { extractHashtags } from '../../hashtags';
import { POPULATE } from '../posts.routes';
import { withGroup, requireActive, requireAdmin, notifyGroup, notifyAdmins, removePost } from './middleware';

// Bài viết trong nhóm: danh sách (đã duyệt / chờ duyệt), đăng, duyệt, từ chối, xoá.
// Bài nhóm chỉ xem trong trang nhóm; realtime chỉ gửi cho thành viên (bài chờ duyệt: chỉ quản trị viên).

export function registerGroupPosts(router: Router) {
  /** Bài viết của nhóm. ?status=pending → bài chờ duyệt (quản trị viên thấy tất cả, thành viên chỉ thấy bài của mình). */
  router.get('/:id/posts', withGroup, async (req, res) => {
    const { group, membership } = res.locals;
    const me = req.userId;
    const pending = req.query.status === 'pending';
    const filter: Record<string, unknown> = { group: group._id, groupStatus: pending ? 'pending' : 'approved' };
    if (pending) {
      if (!isActiveMember(membership)) return res.status(403).json({ error: 'Bạn cần là thành viên của nhóm.' });
      if (!isGroupAdmin(membership)) filter.author = me;
    } else {
      if (group.privacy === 'private' && !isActiveMember(membership)) return res.status(403).json({ error: 'Chỉ thành viên mới xem được bài viết của nhóm.' });
      filter.hiddenBy = { $ne: me };
    }
    const { limit, skip } = pageParams(req.query, 30);
    const [posts, blockedIds] = await Promise.all([PostModel.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).populate(POPULATE), getBlockedIds(me)]);
    res.json({ posts: posts.filter((p: Doc) => !blockedIds.has(getId(p.author))).map((p: Doc) => postToJson(p, me)) });
  });

  /** Đăng bài vào nhóm (thành viên). Nhóm bật duyệt bài: bài của thành viên thường ở trạng thái chờ duyệt. */
  router.post('/:id/posts', withGroup, requireActive, validate(createGroupPostSchema), async (req, res) => {
    const { group, membership } = res.locals;
    const me = req.userId;
    if (!req.body.content && !req.body.images?.length && !req.body.video) return res.status(400).json({ error: 'Bài viết không được để trống.' });

    const needsApproval = group.postApproval && membership.role === 'member';
    const post = await PostModel.create({
      ...req.body,
      author: me,
      privacy: 'only_me', // đóng mọi đường cũ; quyền xem thật do nhóm quyết định
      group: group._id,
      groupStatus: needsApproval ? 'pending' : 'approved',
      hashtags: extractHashtags(req.body.content),
    });
    await post.populate(POPULATE);

    if (needsApproval) {
      await notifyAdmins(group, me, `có bài viết đang chờ duyệt trong nhóm "${group.name}".`, 'pending-posts');
      await emitToGroupMembers(group.id, 'post:new', { post: postToJson(post) }, { exclude: me, adminsOnly: true, hideFromBlockedBy: me });
    } else {
      await emitToGroupMembers(group.id, 'post:new', { post: postToJson(post) }, { exclude: me, hideFromBlockedBy: me });
    }
    res.json({ post: postToJson(post, me) });
  });

  /** Duyệt bài chờ duyệt (quản trị viên): bài hiện cho cả nhóm. */
  router.post('/:id/posts/:postId/approve', withGroup, requireAdmin, async (req, res) => {
    const { group } = res.locals;
    const post = await PostModel.findOneAndUpdate({ _id: req.params.postId, group: group._id, groupStatus: 'pending' }, { groupStatus: 'approved' }, { returnDocument: 'after' }).populate(POPULATE);
    if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết đang chờ duyệt.' });
    const authorId = getId(post.author);
    if (authorId !== req.userId) await notifyGroup(authorId, req.userId, group, `đã duyệt bài viết của bạn trong nhóm "${group.name}".`);
    await emitToGroupMembers(group.id, 'post:new', { post: postToJson(post) }, { exclude: req.userId, hideFromBlockedBy: authorId });
    res.json({ post: postToJson(post, req.userId) });
  });

  /** Từ chối bài chờ duyệt (quản trị viên): bài bị xoá. */
  router.post('/:id/posts/:postId/reject', withGroup, requireAdmin, async (req, res) => {
    const { group } = res.locals;
    const post = await PostModel.findOne({ _id: req.params.postId, group: group._id, groupStatus: 'pending' });
    if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết đang chờ duyệt.' });
    const authorId = getId(post.author);
    await removePost(post);
    if (authorId !== req.userId) await notifyGroup(authorId, req.userId, group, `đã từ chối bài viết của bạn trong nhóm "${group.name}".`);
    emitToUsers([authorId], 'post:delete', { postId: post.id });
    await emitToGroupMembers(group.id, 'post:delete', { postId: post.id }, { exclude: req.userId, adminsOnly: true });
    res.json({ ok: true });
  });

  /** Xoá bài trong nhóm: tác giả hoặc quản trị viên. */
  router.delete('/:id/posts/:postId', withGroup, async (req, res) => {
    const { group, membership } = res.locals;
    const post = await PostModel.findOne({ _id: req.params.postId, group: group._id });
    if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
    const authorId = getId(post.author);
    const isAuthor = authorId === req.userId;
    if (!isAuthor && !isGroupAdmin(membership)) return res.status(403).json({ error: 'Bạn không có quyền xoá bài viết này.' });

    const wasPending = post.groupStatus === 'pending';
    await removePost(post);
    if (!isAuthor) await notifyGroup(authorId, req.userId, group, `đã xoá bài viết của bạn khỏi nhóm "${group.name}".`);
    if (wasPending) {
      emitToUsers([authorId].filter((id) => id !== req.userId), 'post:delete', { postId: post.id });
      await emitToGroupMembers(group.id, 'post:delete', { postId: post.id }, { exclude: req.userId, adminsOnly: true });
    } else {
      await emitToGroupMembers(group.id, 'post:delete', { postId: post.id }, { exclude: req.userId });
    }
    res.json({ ok: true });
  });
}

import { PostModel } from '../../models/Post';
import { CommentModel } from '../../models/Comment';
import { GroupModel } from '../../models/Group';
import { GroupReportModel } from '../../models/GroupReport';
import { PageModel } from '../../models/Page';
import { removeGroup, removePage } from '../../contentRemoval';
import { emitToAllowedViewers } from '../../privacyRules';
import { emitToGroupMembers } from '../../groupRules';
import { createNotification } from '../../createNotification';
import { Doc, getId } from '../../formatResponse';

// Gỡ một nội dung vi phạm khỏi hệ thống (bài viết / reel, bình luận, nhóm, trang) và báo cho chủ nội dung.

export type RemovableType = 'post' | 'comment' | 'group' | 'page';

const LABELS: Record<RemovableType, string> = { post: 'Bài viết', comment: 'Bình luận', group: 'Nhóm', page: 'Trang' };

async function removePost(post: Doc) {
  await Promise.all([CommentModel.deleteMany({ post: post._id }), GroupReportModel.deleteMany({ post: post._id }), post.deleteOne()]);
  const payload = { postId: post.id };
  if (post.group) await emitToGroupMembers(getId(post.group), 'post:delete', payload, { adminsOnly: post.groupStatus === 'pending' });
  else await emitToAllowedViewers(post.privacy, getId(post.author), 'post:delete', payload, '');
  return { ownerId: getId(post.author), label: post.kind === 'reel' ? 'Reel' : LABELS.post };
}

async function removeComment(comment: Doc) {
  const replies = await CommentModel.find({ parent: comment._id }).select('_id');
  const removed = 1 + replies.length;
  await CommentModel.deleteMany({ _id: { $in: [comment._id, ...replies.map((r: Doc) => r._id)] } });
  const post = await PostModel.findById(comment.post).select('privacy author group');
  if (post) {
    await PostModel.updateOne({ _id: post._id }, [{ $set: { commentsCount: { $max: [0, { $subtract: [{ $ifNull: ['$commentsCount', 0] }, removed] }] } } }], { updatePipeline: true });
    const payload = { postId: post.id, commentId: comment.id };
    if (post.group) await emitToGroupMembers(getId(post.group), 'comment:delete', payload);
    else await emitToAllowedViewers(post.privacy, getId(post.author), 'comment:delete', payload, '');
  }
  return { ownerId: getId(comment.author), label: LABELS.comment };
}

/** Gỡ nội dung. Trả về chủ nội dung + loại (để ghi nhật ký / báo cho chủ), hoặc null nếu không tìm thấy. */
export async function removeTarget(type: RemovableType, id: string, adminId: string): Promise<{ ownerId: string; label: string } | null> {
  const found = await ({ post: PostModel, comment: CommentModel, group: GroupModel, page: PageModel }[type]).findById(id);
  if (!found) return null;
  const removed =
    type === 'post' ? await removePost(found)
    : type === 'comment' ? await removeComment(found)
    : type === 'group' ? (await removeGroup(found), { ownerId: getId(found.owner), label: LABELS.group })
    : (await removePage(found), { ownerId: getId(found.owner), label: LABELS.page });
  await createNotification({ user: removed.ownerId, actor: adminId, type: 'system', content: `${removed.label} của bạn đã bị quản trị viên gỡ do vi phạm quy định cộng đồng.`, targetType: 'system' });
  return removed;
}

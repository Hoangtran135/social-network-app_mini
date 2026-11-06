import { PostModel } from './models/Post';
import { CommentModel } from './models/Comment';
import { GroupModel } from './models/Group';
import { GroupMemberModel } from './models/GroupMember';
import { GroupReportModel } from './models/GroupReport';
import { PageModel } from './models/Page';
import { PageFollowModel } from './models/PageFollow';
import { Doc } from './formatResponse';

// Xoá nội dung KÈM mọi thứ phụ thuộc (không để lại dữ liệu mồ côi). Dùng cho cả chủ sở hữu (route nhóm / trang) và quản trị hệ thống.

/** Xoá toàn bộ bình luận của các bài thuộc bộ lọc rồi xoá chính các bài đó. */
async function removePostsWhere(filter: Record<string, unknown>) {
  const postIds = (await PostModel.find(filter).select('_id')).map((p: Doc) => p._id);
  await CommentModel.deleteMany({ post: { $in: postIds } });
  await PostModel.deleteMany({ _id: { $in: postIds } });
}

/** Xoá một nhóm: bài viết + bình luận, báo cáo, thành viên. */
export async function removeGroup(group: Doc) {
  await removePostsWhere({ group: group._id });
  await Promise.all([GroupReportModel.deleteMany({ group: group._id }), GroupMemberModel.deleteMany({ group: group._id }), GroupModel.deleteOne({ _id: group._id })]);
}

/** Xoá một trang: bài viết + bình luận, lượt theo dõi. */
export async function removePage(page: Doc) {
  await removePostsWhere({ page: page._id });
  await Promise.all([PageFollowModel.deleteMany({ page: page._id }), PageModel.deleteOne({ _id: page._id })]);
}

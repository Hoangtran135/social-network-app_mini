import { Router } from 'express';
import { UserModel } from '../models/User';
import { PostModel } from '../models/Post';
import { GroupModel } from '../models/Group';
import { GroupMemberModel } from '../models/GroupMember';
import { PageModel } from '../models/Page';
import { PageFollowModel } from '../models/PageFollow';
import { FollowModel } from '../models/Follow';
import { FriendshipModel } from '../models/Friendship';
import { requireAuth } from '../jwtAuth';
import { userToJson, postToJson, groupToJson, pageToJson, getId, Doc } from '../formatResponse';
import { getFriendAndBlockedIds, visibleToViewerFilter } from '../privacyRules';
import { normalizeTag } from '../hashtags';
import { pageParams } from '../pagination';
import { POPULATE } from './posts.routes';
import { escapeRegex } from '../regex';

// API tìm kiếm tổng hợp (/api/search?q=&type=all|people|groups|pages|posts): tìm ĐỒNG THỜI người, nhóm, trang và bài viết.
//
// Quy tắc:
//  1. Quyền xem: chỉ trả những gì người tìm được phép thấy (quyền riêng tư bài viết / nhóm, người bị chặn, không tìm theo email).
//  2. Xếp hạng theo quan hệ xã hội: bạn bè, người đang theo dõi, bạn chung, nhóm đã tham gia, trang đang theo dõi,
//     nhóm / trang mà bạn bè của mình đang ở... lên trước; cùng quan hệ thì xét độ khớp từ khoá, độ phổ biến, độ mới.
//  3. Mỗi kết quả kèm "reasons" (lý do hiển thị, vd "Bạn bè", "3 bạn chung") để giao diện giải thích vì sao nó xuất hiện.
//  4. type=all: mỗi loại tối đa 5 kết quả; chọn một loại: tối đa 20 (có limit / skip).
//
// Cấu trúc file: Rank (điểm + lý do) → SearchContext (quan hệ của người tìm) → findPeople / findGroups / findPages / findPosts → route.

export const searchRouter = Router();
searchRouter.use(requireAuth);

const PREVIEW = 5; // số kết quả mỗi loại khi tìm "tất cả"
const CANDIDATES = 300; // số ứng viên tối đa lấy từ DB mỗi loại trước khi xếp hạng
const MAX_QUERY = 100; // độ dài tối đa của từ khoá

// Điểm cộng theo quan hệ (đủ lớn để quan hệ luôn thắng độ khớp từ khoá, nhưng độ khớp vẫn phân định trong cùng một quan hệ)
const POINTS = {
  friend: 100,
  following: 70,
  mutualEach: 10,
  myGroup: 100,
  pendingGroup: 40,
  friendInGroupEach: 15,
  managedPage: 100,
  followedPage: 100,
  friendFollowsPageEach: 15,
  friendPost: 50,
  followingPost: 35,
  ownPost: 20,
  postInMyGroup: 40,
  postFromFollowedPage: 40,
};
const MAX_SOCIAL_COUNT = 10; // chặn trần số "bạn chung / bạn bè đã tham gia..." khi tính điểm

type Ranked<T> = { item: T; score: number; reasons: string[] };

/** Gom điểm và lý do hiển thị của một kết quả. */
class Rank {
  score = 0;
  reasons: string[] = [];
  /** Cộng điểm; có `reason` thì thêm vào danh sách lý do hiển thị. */
  add(points: number, reason?: string) {
    this.score += points;
    if (reason) this.reasons.push(reason);
    return this;
  }
  done<T>(item: T): Ranked<T> {
    return { item, score: this.score, reasons: this.reasons };
  }
}
const byScore = <T>(a: Ranked<T>, b: Ranked<T>) => b.score - a.score;

/** Mọi thứ cần biết về người đang tìm để lọc quyền xem và xếp hạng. */
interface SearchContext {
  me: string;
  q: string;
  regex: RegExp;
  friendIds: Set<string>;
  blockedIds: Set<string>;
  followingIds: Set<string>;
  myGroups: Map<string, Doc>; // nhóm mình có liên quan (tham gia / đang chờ) → bản ghi thành viên
  activeGroupIds: Set<string>; // nhóm mình đã là thành viên
  followedPageIds: Set<string>;
}


async function buildContext(me: string, q: string): Promise<SearchContext> {
  const [{ friendIds, blockedIds }, following, memberships, followedPages] = await Promise.all([
    getFriendAndBlockedIds(me),
    FollowModel.find({ follower: me }).select('following'),
    GroupMemberModel.find({ user: me }).select('group status'),
    PageFollowModel.find({ user: me }).select('page'),
  ]);
  return {
    me,
    q,
    regex: new RegExp(escapeRegex(q), 'i'),
    friendIds,
    blockedIds,
    followingIds: new Set(following.map((f: Doc) => getId(f.following))),
    myGroups: new Map(memberships.map((m: Doc) => [getId(m.group), m])),
    activeGroupIds: new Set(memberships.filter((m: Doc) => m.status === 'active').map((m: Doc) => getId(m.group))),
    followedPageIds: new Set(followedPages.map((f: Doc) => getId(f.page))),
  };
}

/** Điểm khớp văn bản: trùng hẳn > bắt đầu bằng từ khoá > có từ bắt đầu bằng từ khoá > chỉ chứa. */
function textMatchScore(text: string, q: string) {
  const t = text.toLowerCase();
  const needle = q.toLowerCase();
  if (t === needle) return 40;
  if (t.startsWith(needle)) return 25;
  if (t.split(/\s+/).some((word) => word.startsWith(needle))) return 12;
  return 0;
}

/** Đếm số lần mỗi id xuất hiện ở trường `field` của các bản ghi. */
function countBy(docs: Doc[], field: string) {
  const counts = new Map<string, number>();
  for (const doc of docs) counts.set(getId(doc[field]), (counts.get(getId(doc[field])) || 0) + 1);
  return counts;
}

const capped = (n: number) => Math.min(n, MAX_SOCIAL_COUNT);

// ================= NGƯỜI =================

/** Số bạn chung của từng ứng viên: số bạn của mình cũng là bạn của người đó. */
async function countMutualFriends(ctx: SearchContext, candidateIds: unknown[]) {
  const friends = [...ctx.friendIds];
  const mutual = new Map<string, number>();
  if (friends.length === 0) return mutual;
  const links = await FriendshipModel.find({ $or: [{ userA: { $in: candidateIds }, userB: { $in: friends } }, { userA: { $in: friends }, userB: { $in: candidateIds } }] });
  for (const link of links) {
    const candidate = ctx.friendIds.has(getId(link.userA)) ? getId(link.userB) : getId(link.userA);
    mutual.set(candidate, (mutual.get(candidate) || 0) + 1);
  }
  return mutual;
}

async function findPeople(ctx: SearchContext) {
  // Chỉ tìm theo tên / username (không tìm theo email — riêng tư); loại bản thân và người bị chặn.
  // Bạn bè và người đang theo dõi luôn được xét đủ; phần còn lại lấy tối đa CANDIDATES (đang online / mới tham gia trước) để không cắt ngẫu nhiên.
  const match = { $or: [{ name: ctx.regex }, { username: ctx.regex }] };
  const excluded = [...ctx.blockedIds, ctx.me];
  const close = [...ctx.friendIds, ...ctx.followingIds];
  const [closeUsers, otherUsers] = await Promise.all([
    close.length ? UserModel.find({ ...match, _id: { $in: close, $nin: excluded } }) : [],
    UserModel.find({ ...match, _id: { $nin: [...excluded, ...close] } }).sort({ isOnline: -1, joinDate: -1 }).limit(CANDIDATES),
  ]);
  const users = [...closeUsers, ...otherUsers];
  const mutual = await countMutualFriends(ctx, users.map((u: Doc) => u._id));

  return users
    .map((user: Doc) => {
      const id = getId(user);
      const rank = new Rank().add(Math.max(textMatchScore(user.name, ctx.q), textMatchScore(user.username, ctx.q)) + (user.isOnline ? 3 : 0));
      if (ctx.friendIds.has(id)) rank.add(POINTS.friend, 'Bạn bè');
      else if (ctx.followingIds.has(id)) rank.add(POINTS.following, 'Đang theo dõi');
      const mutualCount = mutual.get(id) || 0;
      if (mutualCount > 0 && !ctx.friendIds.has(id)) rank.add(POINTS.mutualEach * capped(mutualCount), `${mutualCount} bạn chung`);
      return rank.done(userToJson(user));
    })
    .sort(byScore);
}

// ================= NHÓM =================

async function findGroups(ctx: SearchContext) {
  // Nhóm riêng tư chỉ khớp theo TÊN (mô tả của nhóm kín không bị lộ qua tìm kiếm); nhóm công khai khớp cả mô tả
  const match = { $or: [{ name: ctx.regex }, { privacy: 'public', description: ctx.regex }] };
  const mine = [...ctx.myGroups.keys()];
  const [myMatches, otherMatches] = await Promise.all([
    mine.length ? GroupModel.find({ $and: [match, { _id: { $in: mine } }] }) : [],
    GroupModel.find({ $and: [match, { _id: { $nin: mine } }] }).sort({ membersCount: -1 }).limit(CANDIDATES), // nhóm đông thành viên trước
  ]);
  const groups = [...myMatches, ...otherMatches];
  const friends = [...ctx.friendIds];
  const friendMembers = friends.length ? await GroupMemberModel.find({ group: { $in: groups.map((g: Doc) => g._id) }, user: { $in: friends }, status: 'active' }).select('group') : [];
  const friendsInGroup = countBy(friendMembers, 'group');

  return groups
    .map((group: Doc) => {
      const id = getId(group);
      const membership = ctx.myGroups.get(id);
      const rank = new Rank().add(textMatchScore(group.name, ctx.q) + (group.privacy === 'public' ? 5 : 0) + Math.log1p(group.membersCount));
      if (membership?.status === 'active') rank.add(POINTS.myGroup, 'Nhóm của bạn');
      else if (membership?.status === 'pending') rank.add(POINTS.pendingGroup, 'Đã gửi yêu cầu tham gia');
      const friendCount = friendsInGroup.get(id) || 0;
      if (friendCount > 0) rank.add(POINTS.friendInGroupEach * capped(friendCount), `${friendCount} bạn bè đã tham gia`);
      return rank.done(groupToJson(group, membership));
    })
    .sort(byScore);
}

// ================= TRANG =================

async function findPages(ctx: SearchContext) {
  const match = { $or: [{ name: ctx.regex }, { description: ctx.regex }] };
  const followed = [...ctx.followedPageIds];
  const [closePages, otherPages] = await Promise.all([
    PageModel.find({ $and: [match, { $or: [{ _id: { $in: followed } }, { owner: ctx.me }, { admins: ctx.me }] }] }).populate(['owner', 'admins']), // trang đang theo dõi / quản trị
    PageModel.find({ $and: [match, { _id: { $nin: followed }, owner: { $ne: ctx.me }, admins: { $ne: ctx.me } }] }).sort({ followersCount: -1 }).limit(CANDIDATES).populate(['owner', 'admins']),
  ]);
  const pages = [...closePages, ...otherPages];
  const friends = [...ctx.friendIds];
  const friendFollows = friends.length ? await PageFollowModel.find({ page: { $in: pages.map((p: Doc) => p._id) }, user: { $in: friends } }).select('page') : [];
  const friendsFollowing = countBy(friendFollows, 'page');

  return pages
    .map((page: Doc) => {
      const id = getId(page);
      const json = pageToJson(page, ctx.me, ctx.followedPageIds.has(id));
      const rank = new Rank().add(textMatchScore(page.name, ctx.q) + Math.log1p(page.followersCount || 0));
      if (json.myRole) rank.add(POINTS.managedPage, 'Bạn quản trị');
      else if (json.isFollowing) rank.add(POINTS.followedPage, 'Đang theo dõi');
      const friendCount = friendsFollowing.get(id) || 0;
      if (friendCount > 0) rank.add(POINTS.friendFollowsPageEach * capped(friendCount), `${friendCount} bạn bè theo dõi`);
      return rank.done(json);
    })
    .sort(byScore);
}

// ================= BÀI VIẾT =================

/**
 * Điều kiện quyền xem bài viết, viết thẳng trong truy vấn DB (để 300 ứng viên đều là bài xem được, không bị bài riêng tư lấp chỗ):
 *  - bài thường: của mình, công khai, hoặc "bạn bè" của bạn bè;
 *  - bài nhóm: đã duyệt VÀ ở nhóm công khai hoặc nhóm mình đã tham gia.
 * Kèm: không phải bài mình đã ẩn, không phải của người bị chặn.
 */
async function visiblePostsFilter(ctx: SearchContext) {
  const visibleGroupIds = (await GroupModel.find({ $or: [{ privacy: 'public' }, { _id: { $in: [...ctx.activeGroupIds] } }] }).select('_id')).map((g: Doc) => g._id);
  return {
    hiddenBy: { $ne: ctx.me },
    $or: [
      { group: null, ...visibleToViewerFilter(ctx.me, ctx.friendIds, ctx.blockedIds) },
      { group: { $in: visibleGroupIds }, groupStatus: 'approved', author: { $nin: [...ctx.blockedIds] } },
    ],
  };
}

async function findPosts(ctx: SearchContext) {
  const isHashtag = ctx.q.startsWith('#');
  const needle = isHashtag ? ctx.q.slice(1) : ctx.q;
  if (!needle.trim()) return []; // chỉ gõ "#" thì không có gì để tìm (tránh regex rỗng khớp mọi bài)
  const tag = isHashtag ? normalizeTag(ctx.q) : '';
  const textMatch = [{ content: new RegExp(escapeRegex(needle), 'i') }, ...(tag ? [{ hashtags: tag }] : [])];

  const posts = await PostModel.find({ $and: [{ $or: textMatch }, await visiblePostsFilter(ctx)] })
    .sort({ createdAt: -1 })
    .limit(CANDIDATES)
    .populate(POPULATE);

  const now = Date.now();
  return posts
    .map((post: Doc) => {
      const authorId = getId(post.author);
      const rank = new Rank();
      if (post.group && ctx.activeGroupIds.has(getId(post.group))) rank.add(POINTS.postInMyGroup, 'Trong nhóm của bạn');
      if (post.page && ctx.followedPageIds.has(getId(post.page))) rank.add(POINTS.postFromFollowedPage, 'Từ trang bạn theo dõi');
      if (authorId === ctx.me) rank.add(POINTS.ownPost);
      else if (ctx.friendIds.has(authorId)) rank.add(POINTS.friendPost, 'Bạn bè');
      else if (ctx.followingIds.has(authorId)) rank.add(POINTS.followingPost, 'Đang theo dõi');
      if (post.kind === 'reel') rank.add(0, 'Reel');

      const ageDays = (now - new Date(post.createdAt).getTime()) / 86_400_000;
      rank.add(Math.max(0, 20 - ageDays) + (post.reactions?.length || 0) * 0.5 + (post.commentsCount || 0)); // độ mới + tương tác
      return rank.done(postToJson(post, ctx.me));
    })
    .sort(byScore);
}

// ================= ROUTE =================

type SearchType = 'all' | 'people' | 'groups' | 'pages' | 'posts';
const parseType = (value: unknown): SearchType => (['people', 'groups', 'pages', 'posts'].includes(String(value)) ? (String(value) as SearchType) : 'all');

searchRouter.get('/', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_QUERY) : '';
  const type = parseType(req.query.type);
  if (!q) return res.json({ query: '', people: [], groups: [], pages: [], posts: [] });

  const { limit, skip } = type === 'all' ? { limit: PREVIEW, skip: 0 } : pageParams(req.query, 20);
  const ctx = await buildContext(req.userId, q);
  /** Chỉ chạy tìm kiếm cho loại được yêu cầu, rồi lấy đúng trang kết quả. */
  const run = async <T>(kind: SearchType, find: (c: SearchContext) => Promise<Ranked<T>[]>) => (type === 'all' || type === kind ? (await find(ctx)).slice(skip, skip + limit) : []);

  const [people, groups, pages, posts] = await Promise.all([run('people', findPeople), run('groups', findGroups), run('pages', findPages), run('posts', findPosts)]);
  res.json({
    query: q,
    people: people.map((h) => ({ user: h.item, reasons: h.reasons })),
    groups: groups.map((h) => ({ group: h.item, reasons: h.reasons })),
    pages: pages.map((h) => ({ page: h.item, reasons: h.reasons })),
    posts: posts.map((h) => ({ post: h.item, reasons: h.reasons })),
  });
});

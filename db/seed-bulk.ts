// Nạp biến môi trường từ .env để dùng đúng database của app (MONGODB_URI)
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserModel } from '../server/models/User';
import { PostModel } from '../server/models/Post';
import { CommentModel } from '../server/models/Comment';
import { FriendshipModel } from '../server/models/Friendship';
import { FollowModel } from '../server/models/Follow';
import { GroupModel } from '../server/models/Group';
import { GroupMemberModel, ROLE_RANK } from '../server/models/GroupMember';
import { PageModel } from '../server/models/Page';
import { PageFollowModel } from '../server/models/PageFollow';
import { StoryModel } from '../server/models/Story';
import { extractHashtags } from '../server/hashtags';
import { chance, hoursAgo, pick, randInt, sample, daysAgo } from './seed-random';
import {
  CITIES, FIRST, GROUP_NAMES, LAST, MIDDLE, PAGE_NAMES, REACTION_TYPES, STORY_EMOJIS, STORY_GRADIENTS, TOPICS, VIDEOS, WORKPLACES,
  groupPost, normalPost, pagePost, reelPost, storyExpiry, storyText,
} from './seed-content';

// DỮ LIỆU LỚN để thử hiệu năng và tìm kiếm: 500 tài khoản + 10.000 bài viết đa dạng (bài ngắn / dài, nhiều ảnh, video, check-in, gắn thẻ,
// chia sẻ, đăng lên tường, đã sửa), cùng bạn bè, theo dõi, nhóm, trang, reel, ~1.700 story và ~15.000 bình luận.
// KHÔNG xoá dữ liệu có sẵn (khác seed-demo.ts): chỉ THÊM. Tài khoản tạo ra có email "bulkNNNN@seed.local", mật khẩu "123456".
//   npm run db:seed-bulk            → tạo dữ liệu (nếu đã có thì dừng, không tạo trùng)
//   npm run db:seed-bulk -- --reset → xoá toàn bộ dữ liệu do script này tạo (không đụng dữ liệu khác)
// Lưu ý: story tự hết hạn sau 24 giờ (MongoDB TTL) — chạy lại (--reset rồi tạo lại) để có story mới.
// Nội dung và bộ sinh số ngẫu nhiên nằm ở seed-content.ts / seed-random.ts.

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/social-network-app';
const USERS = 500;
const POSTS = 10_000;
const BATCH = 1000;
const EMAIL_PATTERN = /@seed\.local$/;
const PASSWORD = '123456';

// Cơ cấu 10.000 bài: bài thường 72%, bài trong nhóm 16%, bài của trang 8%, reel 4%
const SHARE = { normal: 0.72, group: 0.16, page: 0.08 }; // phần còn lại là reel

type Id = mongoose.Types.ObjectId;
const slice = <T>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const log = (message: string) => console.log(`  ${message}`);

/** Chia nhỏ mảng và insert từng lô; trả về các document đã tạo (có _id). */
async function insertInBatches<T>(model: { insertMany: (docs: unknown[], options?: unknown) => Promise<T[]> }, docs: unknown[], options: unknown = { ordered: false }): Promise<T[]> {
  const out: T[] = [];
  for (const part of slice(docs, BATCH)) out.push(...(await model.insertMany(part, options)));
  return out;
}

// ================= XOÁ DỮ LIỆU CŨ CỦA SCRIPT NÀY =================
async function resetBulk() {
  const users = await UserModel.find({ email: EMAIL_PATTERN }).select('_id');
  const userIds = users.map((u: { _id: unknown }) => u._id);
  if (userIds.length === 0) return log('Không có dữ liệu bulk để xoá.');
  const groupIds = (await GroupModel.find({ owner: { $in: userIds } }).select('_id')).map((g: { _id: unknown }) => g._id);
  const pageIds = (await PageModel.find({ owner: { $in: userIds } }).select('_id')).map((p: { _id: unknown }) => p._id);
  const postIds = (await PostModel.find({ $or: [{ author: { $in: userIds } }, { group: { $in: groupIds } }, { page: { $in: pageIds } }] }).select('_id')).map((p: { _id: unknown }) => p._id);
  const counts = {
    stories: (await StoryModel.deleteMany({ user: { $in: userIds } })).deletedCount,
    comments: (await CommentModel.deleteMany({ $or: [{ author: { $in: userIds } }, { post: { $in: postIds } }] })).deletedCount,
    posts: (await PostModel.deleteMany({ _id: { $in: postIds } })).deletedCount,
    groupMembers: (await GroupMemberModel.deleteMany({ $or: [{ group: { $in: groupIds } }, { user: { $in: userIds } }] })).deletedCount,
    groups: (await GroupModel.deleteMany({ _id: { $in: groupIds } })).deletedCount,
    pageFollows: (await PageFollowModel.deleteMany({ $or: [{ page: { $in: pageIds } }, { user: { $in: userIds } }] })).deletedCount,
    pages: (await PageModel.deleteMany({ _id: { $in: pageIds } })).deletedCount,
    follows: (await FollowModel.deleteMany({ $or: [{ follower: { $in: userIds } }, { following: { $in: userIds } }] })).deletedCount,
    friendships: (await FriendshipModel.deleteMany({ $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }] })).deletedCount,
    users: (await UserModel.deleteMany({ _id: { $in: userIds } })).deletedCount,
  };
  log(`Đã xoá: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
}

// ================= TẠO DỮ LIỆU =================

/** Tạo người dùng. Trả về id (theo thứ tự) và bảng id → tên (để dựng bài chia sẻ). */
async function createUsers() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10); // băm MỘT lần dùng cho cả 500 tài khoản
  const docs = Array.from({ length: USERS }, (_, i) => {
    const n = String(i + 1).padStart(4, '0');
    return {
      name: `${LAST[i % LAST.length]} ${pick(MIDDLE)} ${FIRST[(i * 7 + randInt(0, 5)) % FIRST.length]}`,
      username: `bulk${n}`,
      email: `bulk${n}@seed.local`,
      passwordHash,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=bulk${n}`,
      bio: `Thích ${pick(TOPICS)} và ${pick(TOPICS)}.`,
      workplace: pick(WORKPLACES),
      location: pick(CITIES),
      joinDate: daysAgo(900),
      isOnline: chance(0.1),
    };
  });
  const users = await insertInBatches<{ _id: Id; name: string }>(UserModel, docs);
  log(`${users.length} tài khoản`);
  return { ids: users.map((u) => u._id), names: new Map(users.map((u) => [String(u._id), u.name])) };
}

/** Cặp người không trùng, không tự nối với mình: mỗi người chọn `min`–`max` người khác. */
function randomPairs(ids: Id[], min: number, max: number, symmetric: boolean): [Id, Id][] {
  const seen = new Set<string>();
  const pairs: [Id, Id][] = [];
  for (const a of ids) {
    for (const b of sample(ids, randInt(min, max))) {
      if (String(a) === String(b)) continue;
      const key = symmetric ? [String(a), String(b)].sort().join('|') : `${a}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([a, b]);
    }
  }
  return pairs;
}

async function createRelations(userIds: Id[]) {
  const friendships = randomPairs(userIds, 4, 9, true);
  await insertInBatches(FriendshipModel, friendships.map(([userA, userB]) => ({ userA, userB })));
  const follows = randomPairs(userIds, 4, 12, false);
  await insertInBatches(FollowModel, follows.map(([follower, following]) => ({ follower, following })));
  log(`${friendships.length} quan hệ bạn bè, ${follows.length} lượt theo dõi`);
}

type SeededGroup = { id: Id; name: string; members: Id[] };

/** Tạo nhóm cùng thành viên (chủ nhóm + 2 quản trị viên + thành viên thường). */
async function createGroups(userIds: Id[]): Promise<SeededGroup[]> {
  const groupDocs = GROUP_NAMES.map((name) => {
    const isPrivate = chance(0.3);
    return {
      name,
      description: `Nơi giao lưu về "${name.toLowerCase()}". Ai quan tâm đều được chào đón.`,
      rules: ['Tôn trọng mọi người', 'Không quảng cáo', 'Đăng đúng chủ đề'],
      privacy: isPrivate ? 'private' : 'public',
      joinQuestions: isPrivate ? ['Vì sao bạn muốn tham gia nhóm?'] : [],
      postApproval: chance(0.25),
      owner: pick(userIds),
    };
  });
  const groups = await insertInBatches<{ _id: Id; owner: Id }>(GroupModel, groupDocs);

  const members: { group: Id; user: Id; role: string; rank: number; status: string }[] = [];
  const rosters = new Map<string, Id[]>();
  for (const g of groups) {
    const others = sample(userIds.filter((u) => String(u) !== String(g.owner)), randInt(25, 120));
    const roster = [g.owner, ...others];
    rosters.set(String(g._id), roster);
    roster.forEach((user, i) => {
      const role = i === 0 ? 'owner' : i <= 2 ? 'admin' : 'member';
      members.push({ group: g._id, user, role, rank: ROLE_RANK[role as keyof typeof ROLE_RANK], status: 'active' });
    });
  }
  await insertInBatches(GroupMemberModel, members);
  await GroupModel.bulkWrite(groups.map((g) => ({ updateOne: { filter: { _id: g._id }, update: { $set: { membersCount: rosters.get(String(g._id))!.length } } } })));
  log(`${groups.length} nhóm, ${members.length} lượt tham gia`);
  return groups.map((g, i) => ({ id: g._id, name: GROUP_NAMES[i], members: rosters.get(String(g._id))! }));
}

type SeededPage = { id: Id; name: string; owner: Id };

/** Tạo trang cùng người theo dõi. */
async function createPages(userIds: Id[]): Promise<SeededPage[]> {
  const pageDocs = PAGE_NAMES.map((name) => ({
    name,
    category: pick(['brand', 'business', 'community', 'public_figure', 'entertainment', 'education']),
    description: `Trang chính thức của ${name}. Theo dõi để cập nhật tin mới mỗi ngày.`,
    address: pick(CITIES),
    owner: pick(userIds),
  }));
  const pages = await insertInBatches<{ _id: Id; owner: Id }>(PageModel, pageDocs);
  const follows = pages.flatMap((p) => sample(userIds, randInt(30, 200)).map((user) => ({ page: p._id, user })));
  await insertInBatches(PageFollowModel, follows);
  const counts = new Map<string, number>();
  follows.forEach((f) => counts.set(String(f.page), (counts.get(String(f.page)) || 0) + 1));
  await PageModel.bulkWrite(pages.map((p) => ({ updateOne: { filter: { _id: p._id }, update: { $set: { followersCount: counts.get(String(p._id)) || 0 } } } })));
  log(`${pages.length} trang, ${follows.length} lượt theo dõi trang`);
  return pages.map((p, i) => ({ id: p._id, name: PAGE_NAMES[i], owner: p.owner }));
}

/** Cảm xúc ngẫu nhiên của một bài (mỗi người một cảm xúc; ~30% bài chưa có ai thả). */
const randomReactions = (users: Id[]) => sample(users, chance(0.3) ? 0 : randInt(1, 14)).map((userId) => ({ type: pick(REACTION_TYPES), userId }));

/** Dựng 10.000 bài theo cơ cấu SHARE: bài thường (nhiều kiểu), bài nhóm, bài trang, reel. */
async function createPosts(users: Awaited<ReturnType<typeof createUsers>>, groups: SeededGroup[], pages: SeededPage[]) {
  const { ids: userIds, names } = users;
  const counts = { normal: Math.round(POSTS * SHARE.normal), group: Math.round(POSTS * SHARE.group), page: Math.round(POSTS * SHARE.page), reel: 0 };
  counts.reel = POSTS - counts.normal - counts.group - counts.page;
  const withReactions = (fields: Record<string, unknown>) => ({ createdAt: daysAgo(365), reactions: randomReactions(userIds), ...fields });
  const stringIds = userIds.map(String);

  const posts: Record<string, unknown>[] = [];
  const commentPools: string[][] = []; // song song với posts: bình luận phù hợp với nội dung từng bài
  const add = (post: Record<string, unknown>, comments: string[]) => {
    posts.push(withReactions(post));
    commentPools.push(comments);
  };
  for (let i = 0; i < counts.normal; i++) {
    const author = pick(userIds);
    const { post, comments } = normalPost({ authorId: String(author), userIds: stringIds, names });
    add({ ...post, author }, comments);
  }
  for (let i = 0; i < counts.group; i++) {
    const g = pick(groups);
    const { fields, comments } = groupPost(g.name);
    add({ ...fields, author: pick(g.members), privacy: 'only_me', group: g.id, groupStatus: 'approved' }, comments);
  }
  for (let i = 0; i < counts.page; i++) {
    const p = pick(pages);
    const { fields, comments } = pagePost(p.name);
    add({ ...fields, author: p.owner, privacy: 'public', page: p.id }, comments);
  }
  for (let i = 0; i < counts.reel; i++) {
    const { content, comments } = reelPost();
    add({ author: pick(userIds), kind: 'reel', video: pick(VIDEOS), content, privacy: chance(0.8) ? 'public' : 'friends', viewsCount: randInt(0, 5000) }, comments);
  }
  // Hashtag lưu sẵn trong bài (server tự tính khi đăng bài thật) để trang #hashtag và tìm kiếm tìm được
  const withHashtags = posts.map((p) => ({ ...p, hashtags: extractHashtags(String(p.content)) }));
  const created = await insertInBatches<{ _id: Id; group?: Id }>(PostModel, withHashtags);
  log(`${created.length} bài viết (${counts.normal} thường, ${counts.group} trong nhóm, ${counts.page} của trang, ${counts.reel} reel)`);
  return created.map((post, i) => ({ _id: post._id, group: post.group, commentPool: commentPools[i] }));
}

async function createComments(userIds: Id[], posts: { _id: Id; group?: Id; commentPool: string[] }[], groups: SeededGroup[]) {
  const membersOf = new Map(groups.map((g) => [String(g.id), g.members]));
  const docs = [];
  for (const post of sample(posts, Math.round(posts.length * 0.6))) {
    // Bình luận ở bài nhóm do chính thành viên nhóm viết (đúng với luật quyền của server)
    const pool = post.group ? membersOf.get(String(post.group))! : userIds;
    for (let i = randInt(1, 4); i > 0; i--) docs.push({ post: post._id, author: pick(pool), content: pick(post.commentPool), createdAt: daysAgo(300) });
  }
  await insertInBatches(CommentModel, docs);
  // Cập nhật số bình luận lưu sẵn trong mỗi bài
  const perPost = new Map<string, number>();
  docs.forEach((d) => perPost.set(String(d.post), (perPost.get(String(d.post)) || 0) + 1));
  for (const part of slice([...perPost], BATCH)) {
    await PostModel.bulkWrite(part.map(([id, n]) => ({ updateOne: { filter: { _id: id }, update: { $set: { commentsCount: n } } } })));
  }
  log(`${docs.length} bình luận`);
}

/**
 * Story: mỗi người 0–6 story trong vài giờ gần đây (còn hạn ≥ 16 giờ), gồm story chữ trên nền màu và story ảnh;
 * có người xem và cảm xúc nhanh. 70% công khai, 30% chỉ bạn bè.
 */
async function createStories(userIds: Id[]) {
  const docs = userIds.flatMap((user) => {
    if (chance(0.15)) return []; // một số người không đăng story
    return Array.from({ length: randInt(2, 6) }, (_, i) => {
      const createdAt = hoursAgo(8);
      const viewers = sample(userIds, randInt(0, 25)).map((viewer) => ({ user: viewer, viewedAt: new Date(createdAt.getTime() + randInt(1, 400) * 60_000) }));
      const reactions = sample(viewers, randInt(0, Math.min(6, viewers.length))).map((v) => ({ user: v.user, emoji: pick(STORY_EMOJIS) }));
      const isImage = chance(0.45);
      return {
        user,
        type: isImage ? 'image' : 'text',
        privacy: chance(0.7) ? 'public' : 'friends',
        mediaUrl: isImage ? `https://picsum.photos/seed/story-${user}-${i}/600/1000` : undefined,
        textContent: isImage ? undefined : storyText(),
        backgroundGradient: isImage ? undefined : pick(STORY_GRADIENTS),
        createdAt,
        expiresAt: storyExpiry(createdAt),
        viewers,
        reactions,
      };
    });
  });
  await insertInBatches(StoryModel, docs);
  log(`${docs.length} story (hết hạn sau ≥ 16 giờ)`);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Kết nối ${MONGODB_URI}`);

  if (process.argv.includes('--reset')) {
    console.log('Xoá dữ liệu bulk cũ...');
    await resetBulk();
    return;
  }
  if (await UserModel.exists({ email: EMAIL_PATTERN })) {
    console.log('Đã có dữ liệu bulk. Chạy với --reset để xoá trước nếu muốn tạo lại.');
    return;
  }

  console.log(`Tạo ${USERS} tài khoản và ${POSTS} bài viết...`);
  const started = Date.now();
  const users = await createUsers();
  await createRelations(users.ids);
  const groups = await createGroups(users.ids);
  const pages = await createPages(users.ids);
  const posts = await createPosts(users, groups, pages);
  await createComments(users.ids, posts, groups);
  await createStories(users.ids);
  console.log(`Xong sau ${((Date.now() - started) / 1000).toFixed(1)} giây. Đăng nhập thử: bulk0001@seed.local / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

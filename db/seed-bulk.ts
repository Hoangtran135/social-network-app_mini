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

// DỮ LIỆU LỚN để thử hiệu năng và tìm kiếm: 500 tài khoản + 10.000 bài viết (cùng bạn bè, theo dõi, nhóm, trang, reel, bình luận).
// KHÔNG xoá dữ liệu có sẵn (khác seed-demo.ts): chỉ THÊM. Tài khoản tạo ra có email "bulkNNNN@seed.local", mật khẩu "123456".
//   npm run db:seed-bulk            → tạo dữ liệu (nếu đã có thì dừng, không tạo trùng)
//   npm run db:seed-bulk -- --reset → xoá toàn bộ dữ liệu do script này tạo (không đụng dữ liệu khác)

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/social-network-app';
const USERS = 500;
const POSTS = 10_000;
const BATCH = 1000;
const EMAIL_PATTERN = /@seed\.local$/;
const PASSWORD = '123456';
const SAMPLE_VIDEO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

// Cơ cấu 10.000 bài: bài thường 72%, bài trong nhóm 16%, bài của trang 8%, reel 4%
const SHARE = { normal: 0.72, group: 0.16, page: 0.08 }; // phần còn lại là reel

// ---------- Bộ sinh số ngẫu nhiên có seed cố định → chạy lại vẫn ra cùng dữ liệu ----------
let seed = 20261105;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
/** Lấy `count` phần tử khác nhau từ danh sách (xáo bằng Fisher–Yates một phần). */
function sample<T>(list: readonly T[], count: number): T[] {
  const copy = [...list];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
const chance = (p: number) => rand() < p;
const DAY = 86_400_000;
const daysAgo = (max: number) => new Date(Date.now() - rand() * max * DAY);

// ---------- Kho nội dung tiếng Việt ----------
const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Quốc', 'Ngọc', 'Gia', 'Thanh', 'Hữu', 'Đức', 'Anh', 'Thu', 'Bảo'];
const FIRST = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hiếu', 'Hoa', 'Hùng', 'Khánh', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Nga', 'Phong', 'Phúc', 'Quân', 'Sơn', 'Thảo', 'Tuấn', 'Trang', 'Trung', 'Vy', 'Yến', 'Hạnh', 'Lộc', 'Tâm'];
const CITIES = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Huế', 'Nha Trang', 'Đà Lạt', 'Vũng Tàu'];
const WORKPLACES = ['FPT Software', 'VNG', 'Viettel', 'Shopee', 'Tiki', 'Freelancer', 'Sinh viên', 'Giáo viên', 'Bác sĩ', 'Kiến trúc sư'];
const TOPICS = ['du lịch', 'ẩm thực', 'công nghệ', 'âm nhạc', 'thể thao', 'sách', 'phim ảnh', 'nhiếp ảnh', 'học tập', 'thú cưng', 'game', 'khởi nghiệp'];
const SENTENCES = [
  'Cuối tuần này mình vừa có một trải nghiệm rất tuyệt về {t}, mọi người có gợi ý gì thêm không?',
  'Chia sẻ nhanh một mẹo nhỏ về {t} mà mình mới học được hôm nay.',
  'Ai đang quan tâm đến {t} thì cho mình xin vài địa chỉ / tài liệu hay với nhé!',
  'Hôm nay trời đẹp, tranh thủ làm chút gì đó liên quan đến {t}. Cảm giác thật thư giãn.',
  'Mới tìm được một góc nhìn thú vị về {t}, ghi lại ở đây để nhớ.',
  'Có bạn nào cùng sở thích {t} muốn giao lưu không? Mình ở gần trung tâm.',
  'Sau một tuần bận rộn, điều làm mình vui nhất vẫn là {t}.',
  'Review thật lòng sau một tháng gắn bó với {t}: có ưu điểm, cũng có vài điểm cần cải thiện.',
  'Câu hỏi nhỏ cho cả nhà: bạn bắt đầu với {t} từ khi nào và điều gì khiến bạn gắn bó?',
  'Thành quả nho nhỏ của mình về {t} tuần này, mong nhận được góp ý!',
];
const GROUP_NAMES = ['Hội yêu du lịch', 'Dân công nghệ', 'Ẩm thực Việt', 'Nhiếp ảnh phố', 'Chạy bộ mỗi sáng', 'Đọc sách cùng nhau', 'Lập trình React', 'Mê phim hay', 'Thú cưng dễ thương', 'Game thủ Việt', 'Khởi nghiệp trẻ', 'Guitar & Piano', 'Học tiếng Anh', 'Phượt xe máy', 'Nấu ăn tại nhà', 'Cà phê cuối tuần', 'Cộng đồng AI', 'Yoga mỗi ngày', 'Đầu tư tài chính', 'Làm vườn trên sân thượng', 'Bóng đá phủi', 'Cờ vua online', 'Vẽ & thiết kế', 'Làm đẹp tự nhiên', 'Review sách hay', 'Du học sinh', 'Mẹ và bé', 'Xe cổ & mô tô', 'Âm nhạc indie', 'Marketing số'];
const PAGE_NAMES = ['Tiệm bánh Hạnh Phúc', 'Cà phê Góc Phố', 'Tin công nghệ 24h', 'Nhà sách Trẻ', 'Phòng gym Fit+', 'Studio Ảnh Cưới', 'Quán phở Gia Truyền', 'Thời trang Minimal', 'Học viện Lập trình', 'Du lịch Việt Xanh', 'Cửa hàng Hoa Tươi', 'Podcast Chuyện Đêm', 'Nhạc viện Mini', 'Điện máy Số 1', 'Spa Thư Giãn', 'Nội thất Gỗ Ấm', 'Tiệm Sửa Xe Anh Ba', 'Kênh Review Phim', 'Trường Mầm Non Hoa Mai', 'Thú Y Pet Care'];
const FEELINGS = ['hạnh phúc 😊', 'hào hứng 🌟', 'thư giãn ☕', 'tuyệt vời 🌄'];
const REACTION_TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry'] as const;
const COMMENTS = ['Hay quá bạn ơi!', 'Cảm ơn bạn đã chia sẻ 👍', 'Mình cũng nghĩ vậy.', 'Cho mình xin thêm thông tin với nhé.', 'Tuyệt vời, chúc mừng bạn!', 'Mình sẽ thử xem sao.', 'Đồng ý hoàn toàn 😄', 'Bài viết rất hữu ích.', 'Lần sau rủ mình đi cùng nhé!', 'Ảnh đẹp quá!'];

/** Nội dung một bài: câu ngẫu nhiên về một chủ đề, kèm 0–2 hashtag của chủ đề đó. */
function postContent() {
  const topic = pick(TOPICS);
  const tags = sample([topic, 'cuoctuan', 'chiase', 'vui', `${topic.replace(/\s/g, '')}`], randInt(0, 2)).map((t) => `#${t.replace(/\s/g, '')}`);
  return [pick(SENTENCES).replace('{t}', topic), ...tags].join(' ');
}

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
type Id = mongoose.Types.ObjectId;

async function createUsers(): Promise<Id[]> {
  const passwordHash = await bcrypt.hash(PASSWORD, 10); // băm MỘT lần dùng cho cả 500 tài khoản
  const docs = Array.from({ length: USERS }, (_, i) => {
    const n = String(i + 1).padStart(4, '0');
    const name = `${LAST[i % LAST.length]} ${pick(MIDDLE)} ${FIRST[(i * 7 + randInt(0, 5)) % FIRST.length]}`;
    return {
      name,
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
  const users = await insertInBatches<{ _id: Id }>(UserModel, docs);
  log(`${users.length} tài khoản`);
  return users.map((u) => u._id);
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

/** Tạo nhóm cùng thành viên (chủ nhóm + 2 quản trị viên + thành viên thường). Trả về { id, members } cho từng nhóm. */
async function createGroups(userIds: Id[]) {
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
  const byGroup = new Map<string, Id[]>();
  for (const g of groups) {
    const others = sample(userIds.filter((u) => String(u) !== String(g.owner)), randInt(25, 120));
    const roster = [g.owner, ...others];
    byGroup.set(String(g._id), roster);
    roster.forEach((user, i) => {
      const role = i === 0 ? 'owner' : i <= 2 ? 'admin' : 'member';
      members.push({ group: g._id, user, role, rank: ROLE_RANK[role as keyof typeof ROLE_RANK], status: 'active' });
    });
  }
  await insertInBatches(GroupMemberModel, members);
  await GroupModel.bulkWrite(groups.map((g) => ({ updateOne: { filter: { _id: g._id }, update: { $set: { membersCount: byGroup.get(String(g._id))!.length } } } })));
  log(`${groups.length} nhóm, ${members.length} lượt tham gia`);
  return groups.map((g) => ({ id: g._id, members: byGroup.get(String(g._id))! }));
}

/** Tạo trang cùng người theo dõi. Trả về { id, owner } cho từng trang. */
async function createPages(userIds: Id[]) {
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
  return pages.map((p) => ({ id: p._id, owner: p.owner }));
}

/** Danh sách cảm xúc ngẫu nhiên (mỗi người một cảm xúc). */
const randomReactions = (users: Id[]) => sample(users, chance(0.3) ? 0 : randInt(1, 14)).map((userId) => ({ type: pick(REACTION_TYPES), userId }));

async function createPosts(userIds: Id[], groups: Awaited<ReturnType<typeof createGroups>>, pages: Awaited<ReturnType<typeof createPages>>) {
  const counts = { normal: Math.round(POSTS * SHARE.normal), group: Math.round(POSTS * SHARE.group), page: Math.round(POSTS * SHARE.page), reel: 0 };
  counts.reel = POSTS - counts.normal - counts.group - counts.page;

  const posts: Record<string, unknown>[] = [];
  const common = (author: Id) => ({ author, createdAt: daysAgo(365), reactions: randomReactions(userIds) });

  for (let i = 0; i < counts.normal; i++) {
    const author = pick(userIds);
    const roll = rand();
    posts.push({
      ...common(author),
      content: postContent(),
      privacy: roll < 0.7 ? 'public' : roll < 0.95 ? 'friends' : 'only_me',
      images: chance(0.25) ? [`https://picsum.photos/seed/bulk${i}/800/600`] : [],
      feeling: chance(0.1) ? pick(FEELINGS) : undefined,
      location: chance(0.1) ? pick(CITIES) : undefined,
    });
  }
  for (let i = 0; i < counts.group; i++) {
    const g = pick(groups);
    posts.push({ ...common(pick(g.members)), content: postContent(), privacy: 'only_me', group: g.id, groupStatus: 'approved' });
  }
  for (let i = 0; i < counts.page; i++) {
    const p = pick(pages);
    posts.push({ ...common(p.owner), content: postContent(), privacy: 'public', page: p.id, images: chance(0.4) ? [`https://picsum.photos/seed/page${i}/800/600`] : [] });
  }
  for (let i = 0; i < counts.reel; i++) {
    posts.push({ ...common(pick(userIds)), kind: 'reel', video: SAMPLE_VIDEO, content: postContent(), privacy: chance(0.8) ? 'public' : 'friends', viewsCount: randInt(0, 5000) });
  }
  const created = await insertInBatches<{ _id: Id; group?: Id }>(PostModel, posts);
  log(`${created.length} bài viết (${counts.normal} thường, ${counts.group} trong nhóm, ${counts.page} của trang, ${counts.reel} reel)`);
  return created;
}

async function createComments(userIds: Id[], posts: { _id: Id; group?: Id }[], groups: Awaited<ReturnType<typeof createGroups>>) {
  const membersOf = new Map(groups.map((g) => [String(g.id), g.members]));
  const docs = [];
  for (const post of sample(posts, Math.round(posts.length * 0.6))) {
    // Bình luận ở bài nhóm do chính thành viên nhóm viết (đúng với luật quyền của server)
    const pool = post.group ? membersOf.get(String(post.group))! : userIds;
    for (let i = randInt(1, 4); i > 0; i--) docs.push({ post: post._id, author: pick(pool), content: pick(COMMENTS), createdAt: daysAgo(300) });
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
  const userIds = await createUsers();
  await createRelations(userIds);
  const groups = await createGroups(userIds);
  const pages = await createPages(userIds);
  const posts = await createPosts(userIds, groups, pages);
  await createComments(userIds, posts, groups);
  console.log(`Xong sau ${((Date.now() - started) / 1000).toFixed(1)} giây. Đăng nhập thử: bulk0001@seed.local / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

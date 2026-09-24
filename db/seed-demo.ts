// Nạp biến môi trường từ .env để dùng đúng database của app (MONGODB_URI)
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserModel } from '../server/models/User';
import { PostModel } from '../server/models/Post';
import { CommentModel } from '../server/models/Comment';
import { FriendRequestModel } from '../server/models/FriendRequest';
import { FriendshipModel } from '../server/models/Friendship';
import { ConversationModel } from '../server/models/Conversation';
import { MessageModel } from '../server/models/Message';
import { NotificationModel } from '../server/models/Notification';
import { StoryModel } from '../server/models/Story';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/social-network-app';

/** Tạo URL ảnh đại diện ngẫu nhiên (DiceBear) theo chuỗi seed. */
const AVATAR = (seed: string) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
/** Tạo URL ảnh minh hoạ ngẫu nhiên (Picsum) theo seed và kích thước. */
const PHOTO = (seed: string, w = 800, h = 600) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Mốc thời gian cách hiện tại một khoảng (mili giây). */
const ago = (ms: number) => new Date(Date.now() - ms);

// Bộ sinh số ngẫu nhiên có seed cố định → chạy lại script vẫn ra cùng một bộ dữ liệu
let seed = 20260923;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const shuffle = <T>(arr: T[]) => [...arr].sort(() => rand() - 0.5);

/** Thời điểm "ngày này" của `yearsBack` năm trước (cùng ngày, cùng tháng), vào giờ/phút cho trước — dùng cho Kỷ niệm. */
const sameDayYearsAgo = (yearsBack: number, hour: number, minute: number) => {
  const now = new Date();
  return new Date(now.getFullYear() - yearsBack, now.getMonth(), now.getDate(), hour, minute);
};

/** Tạo dữ liệu mẫu: người dùng, bạn bè, bài viết (kể cả kỷ niệm), bình luận, story, hội thoại, tin nhắn, thông báo. */
async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected to ${MONGODB_URI}`);

  console.log('Xoá dữ liệu cũ...');
  await Promise.all([
    UserModel.deleteMany({}),
    PostModel.deleteMany({}),
    CommentModel.deleteMany({}),
    FriendRequestModel.deleteMany({}),
    FriendshipModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
    NotificationModel.deleteMany({}),
    StoryModel.deleteMany({}),
  ]);

  // ===== NGƯỜI DÙNG: đầy đủ họ + tên đệm + tên =====
  console.log('Tạo người dùng...');
  const passwordHash = await bcrypt.hash('123456', 10);

  const usersRaw = [
    { name: 'Trần Xuân Hoàng', username: 'xuanhoang', email: 'xuanhoang@demo.vn', bio: 'Sinh viên bảo vệ đồ án tốt nghiệp 🎓', workplace: 'Social Network App', education: 'Đại học Bách Khoa Hà Nội', location: 'Hà Nội' },
    { name: 'Nguyễn Quốc Bảo', username: 'quocbao', email: 'user1@demo.vn', bio: 'Yêu công nghệ & du lịch 🌍', workplace: 'FPT Software', education: 'Đại học FPT', location: 'Đà Nẵng' },
    { name: 'Lê Thị Minh Cẩm', username: 'camle', email: 'user2@demo.vn', bio: 'Đam mê nhiếp ảnh 📸', workplace: 'Studio Cẩm', education: 'Đại học Kiến trúc TP.HCM', location: 'TP. Hồ Chí Minh' },
    { name: 'Phạm Đức Duy', username: 'ducduy', email: 'user3@demo.vn', bio: 'Sinh viên CNTT năm 4, thích React', workplace: 'Thực tập sinh tại VNG', education: 'Đại học Bách Khoa Hà Nội', location: 'Hà Nội' },
    { name: 'Hoàng Thu Hà', username: 'thuha', email: 'user4@demo.vn', bio: 'Thích đọc sách và cà phê ☕', workplace: 'NXB Trẻ', education: 'Đại học Sư phạm TP.HCM', location: 'TP. Hồ Chí Minh' },
    { name: 'Vũ Anh Khoa', username: 'anhkhoa', email: 'user5@demo.vn', bio: 'Streamer / Gamer 🎮', workplace: 'Freelancer', education: 'Đại học Cần Thơ', location: 'Cần Thơ' },
    { name: 'Đặng Ngọc Linh', username: 'ngoclinh', email: 'user6@demo.vn', bio: 'Yêu ẩm thực, review đồ ăn 🍜', workplace: 'FoodTour VN', education: 'Đại học Kinh tế Đà Nẵng', location: 'Đà Nẵng' },
    { name: 'Bùi Gia Phúc', username: 'giaphuc', email: 'user7@demo.vn', bio: 'Kỹ sư phần mềm, mê chạy bộ 🏃', workplace: 'Viettel', education: 'Học viện Bưu chính Viễn thông', location: 'Hà Nội' },
    { name: 'Ngô Thanh Tùng', username: 'thanhtung', email: 'user8@demo.vn', bio: 'Guitar & cà phê sáng 🎸', workplace: 'Giáo viên âm nhạc', education: 'Nhạc viện TP.HCM', location: 'TP. Hồ Chí Minh' },
    { name: 'Trịnh Mai Anh', username: 'maianh', email: 'user9@demo.vn', bio: 'Designer, thích màu pastel 🎨', workplace: 'Tiki', education: 'Đại học Mỹ thuật Công nghiệp', location: 'Hà Nội' },
    { name: 'Đỗ Hải Nam', username: 'hainam', email: 'user10@demo.vn', bio: 'Phượt thủ, đã đi 50 tỉnh thành 🏍️', workplace: 'Hướng dẫn viên du lịch', education: 'Đại học Văn hoá Hà Nội', location: 'Hải Phòng' },
    { name: 'Phan Bảo Ngọc', username: 'baongoc', email: 'user11@demo.vn', bio: 'Bác sĩ nội trú, mê làm bánh 🍰', workplace: 'Bệnh viện Bạch Mai', education: 'Đại học Y Hà Nội', location: 'Hà Nội' },
  ];

  const users = await UserModel.insertMany(
    usersRaw.map((u) => ({
      ...u,
      passwordHash,
      avatar: AVATAR(u.username),
      coverImage: PHOTO(`cover-${u.username}`, 1200, 400),
      isOnline: rand() > 0.5,
      lastActive: ago(randInt(1, 48) * HOUR),
      // Tham gia từ 4–5 năm trước, để các bài kỷ niệm (1–4 năm trước) nằm sau ngày tham gia
      joinDate: ago((4 * 365 + randInt(10, 300)) * DAY),
    }))
  );
  type SeedUser = (typeof users)[number];
  const [hoang, bao, cam, duy, ha, khoa, linh, phuc, tung, maianh, nam, ngoc] = users;

  // ===== BẠN BÈ =====
  console.log('Tạo quan hệ bạn bè...');
  const friendPairs: [SeedUser, SeedUser][] = [
    [hoang, bao], [hoang, cam], [hoang, duy], [hoang, khoa], [hoang, phuc], [hoang, maianh], [hoang, ngoc],
    [bao, cam], [bao, duy], [bao, phuc], [bao, nam],
    [cam, ha], [cam, linh], [cam, maianh],
    [duy, khoa], [duy, phuc], [duy, tung],
    [ha, linh], [ha, tung], [ha, ngoc],
    [khoa, nam],
    [linh, nam], [linh, ngoc],
    [phuc, maianh],
    [tung, maianh],
    [nam, ngoc],
  ];
  await FriendshipModel.insertMany(
    friendPairs.map(([a, b]) => ({ userA: a._id, userB: b._id, createdAt: ago(randInt(30, 900) * DAY) }))
  );
  const friendsOf = (u: SeedUser) =>
    friendPairs
      .filter(([a, b]) => String(a._id) === String(u._id) || String(b._id) === String(u._id))
      .map(([a, b]) => (String(a._id) === String(u._id) ? b : a));

  // Lời mời kết bạn đang chờ (để tài khoản demo có lời mời cần xử lý)
  await FriendRequestModel.insertMany([
    { sender: linh._id, receiver: hoang._id, createdAt: ago(5 * HOUR) },
    { sender: tung._id, receiver: hoang._id, createdAt: ago(26 * HOUR) },
    { sender: hoang._id, receiver: nam._id, createdAt: ago(3 * DAY) },
    { sender: phuc._id, receiver: ha._id, createdAt: ago(20 * HOUR) },
  ]);

  // ===== BÀI VIẾT =====
  // Mỗi người có bài thường (rải từ vài phút → vài tháng trước) và bài kỷ niệm (đúng ngày này 1–4 năm trước)
  console.log('Tạo bài viết...');
  type PostSeed = { content: string; images?: number; feeling?: string; location?: string; privacy?: 'public' | 'friends' };
  const contentByUser: Record<string, { recent: PostSeed[]; memories: PostSeed[] }> = {
    xuanhoang: {
      recent: [
        { content: 'Chào mừng mọi người đến với Social Network App! Đây là bản demo phục vụ báo cáo tốt nghiệp 🎓', images: 1 },
        { content: 'Còn 2 tuần nữa là bảo vệ, chạy nước rút thôi 💪', feeling: 'đang code 💻' },
        { content: 'Cuối cùng cũng xong phần realtime bằng Socket.io, tin nhắn hiện ngay lập tức 🚀' },
        { content: 'Cà phê sáng cùng team trước buổi họp nhóm ☕', images: 2, location: 'Hà Nội' },
        { content: 'Ai có kinh nghiệm deploy Node.js lên VPS Windows cho mình hỏi chút với 🙏', privacy: 'friends' },
      ],
      memories: [
        { content: 'Ngày đầu tiên nhập học Bách Khoa, trường to quá 😳', images: 1, location: 'Hà Nội' },
        { content: 'Lần đầu viết được chương trình "Hello World" bằng C, vui như Tết 😂' },
        { content: 'Đi Sa Pa cùng lớp, lạnh nhưng vui cực ❄️', images: 2, location: 'Sa Pa' },
      ],
    },
    quocbao: {
      recent: [
        { content: 'Vừa hoàn thành xong dự án mới, cảm giác thật tuyệt vời! 🚀', images: 1 },
        { content: 'Cuối tuần này đi cà phê không mọi người?' },
        { content: 'Bà Nà hôm nay đông quá, nhưng cảnh vẫn đẹp 😍', images: 2, location: 'Đà Nẵng' },
        { content: 'Review nhanh chiếc laptop mới: pin trâu, màn đẹp, gõ phím êm 👍', feeling: 'hào hứng 🌟' },
      ],
      memories: [
        { content: 'Ngày đầu đi làm ở FPT, hồi hộp ghê 😅', location: 'Đà Nẵng' },
        { content: 'Chuyến đi Hội An đáng nhớ nhất năm 🏮', images: 2, location: 'Hội An' },
      ],
    },
    camle: {
      recent: [
        { content: 'Bình minh trên vịnh Hạ Long đẹp không thể tả 🌅', images: 2, location: 'Hạ Long' },
        { content: 'Bộ ảnh chụp tại Đà Lạt tuần trước, mọi người thấy sao? 📷', images: 3, location: 'Đà Lạt' },
        { content: 'Mẹo nhỏ: chụp ngược sáng lúc 5h chiều sẽ có màu rất ấm 🌇' },
        { content: 'Studio mới sơn lại tường, chào đón các bạn ghé chụp nhé!', images: 1 },
      ],
      memories: [
        { content: 'Chiếc máy ảnh film đầu tiên của mình 📸', images: 1 },
        { content: 'Buổi triển lãm ảnh đầu tiên, cảm ơn mọi người đã đến ❤️', images: 2, location: 'TP. Hồ Chí Minh' },
        { content: 'Chụp ảnh cưới cho bạn thân, xúc động quá 🥹', images: 1 },
      ],
    },
    ducduy: {
      recent: [
        { content: 'Ai có tài liệu học React hay không cho mình xin với ạ 😅' },
        { content: 'Hôm nay bảo vệ đồ án, hồi hộp quá 😰', feeling: 'hào hứng 🌟' },
        { content: 'Vừa hiểu ra useEffect chạy khi nào, ngộ ra nhiều điều 😂' },
        { content: 'Ngày đầu thực tập ở VNG, văn phòng xịn thật sự', images: 1, location: 'Hà Nội' },
      ],
      memories: [
        { content: 'Thi xong đại học rồi, giờ chỉ chờ kết quả thôi 🙏' },
        { content: 'Nhận được học bổng kỳ này, cảm ơn bố mẹ đã luôn ủng hộ ❤️', images: 1 },
      ],
    },
    thuha: {
      recent: [
        { content: 'Cuốn sách tuần này: "Nhà giả kim". Rất đáng đọc!', images: 1 },
        { content: 'Trời Sài Gòn chiều nay mưa, ngồi quán quen đọc sách ☔', feeling: 'thư giãn ☕' },
        { content: 'Góc đọc sách mới decor xong, xinh chưa 📚', images: 2 },
        { content: 'Mọi người gợi ý giúp mình vài cuốn tiểu thuyết trinh thám nhé!', privacy: 'friends' },
      ],
      memories: [
        { content: 'Ngày đầu đứng lớp, học trò dễ thương quá 🥰', location: 'TP. Hồ Chí Minh' },
        { content: 'Hà Nội mùa thu, lá vàng rơi đầy phố 🍂', images: 1, location: 'Hà Nội' },
      ],
    },
    anhkhoa: {
      recent: [
        { content: 'Tối nay live stream game mới lúc 20h, mọi người vào ủng hộ nha!', images: 1 },
        { content: 'Vừa unbox bàn phím cơ mới, gõ sướng tay ghê 😍', images: 1 },
        { content: 'Kênh vừa đạt 10.000 người theo dõi, cảm ơn mọi người rất nhiều! 🎉', feeling: 'hạnh phúc 😊' },
        { content: 'Setup góc máy mới, đèn RGB hơi chói 😂', images: 2 },
      ],
      memories: [
        { content: 'Buổi stream đầu tiên, có đúng 3 người xem 🤣' },
        { content: 'Thắng giải game sinh viên toàn thành phố 🏆', images: 1, location: 'Cần Thơ' },
      ],
    },
    ngoclinh: {
      recent: [
        { content: 'Quán bún chả này ngon xuất sắc, phải thử ngay! 🍜', images: 1, location: 'Đà Nẵng' },
        { content: 'Công thức nấu phở bò chuẩn vị Hà Nội, ai cần thì để lại comment nhé' },
        { content: 'Mì Quảng ếch ở đây là chân ái 🐸', images: 2, feeling: 'đang ăn 🍕' },
        { content: 'Tuần sau review 5 quán bánh xèo, mọi người muốn quán nào?' },
      ],
      memories: [
        { content: 'Lần đầu tự làm bánh flan, hơi rỗ nhưng ngon 😋', images: 1 },
        { content: 'Food tour Huế 3 ngày 2 đêm, no căng bụng 🍲', images: 2, location: 'Huế' },
      ],
    },
    giaphuc: {
      recent: [
        { content: 'Deploy thành công lên production sau một đêm thức trắng debug 😴' },
        { content: 'Học thêm được một pattern hay trong lúc code hôm nay: Repository Pattern' },
        { content: 'Hoàn thành half marathon 21km đầu tiên 🏃', images: 1, feeling: 'tuyệt vời 🌄' },
        { content: 'Chạy bộ 6h sáng quanh Hồ Tây, không khí trong lành quá', images: 1, location: 'Hà Nội' },
      ],
      memories: [
        { content: 'Nhận offer đầu tiên ở Viettel 🎉' },
        { content: 'Tốt nghiệp rồi! Cảm ơn thầy cô và bạn bè 🎓', images: 2, location: 'Hà Nội' },
      ],
    },
    thanhtung: {
      recent: [
        { content: 'Cover lại bài "Nơi này có anh" bằng guitar, mọi người nghe thử nha 🎸' },
        { content: 'Lớp guitar cuối tuần còn 3 suất, ai muốn học inbox mình nhé' },
        { content: 'Sáng nay cà phê vợt, nghe nhạc Trịnh, bình yên lắm', feeling: 'thư giãn ☕', images: 1 },
      ],
      memories: [
        { content: 'Đêm diễn đầu tiên ở phòng trà, run tay luôn 😅', images: 1, location: 'TP. Hồ Chí Minh' },
        { content: 'Mua được cây đàn mơ ước sau 1 năm tiết kiệm 🎶', images: 1 },
      ],
    },
    maianh: {
      recent: [
        { content: 'Vừa ra mắt bộ icon mới cho dự án, feedback giúp mình nhé 🎨', images: 2 },
        { content: 'Màu năm nay đúng là pastel lên ngôi 💜' },
        { content: 'Workshop thiết kế UI cuối tuần, vui và học được nhiều', images: 1, location: 'Hà Nội' },
      ],
      memories: [
        { content: 'Bản vẽ đầu tiên được đăng lên tạp chí 🥳', images: 1 },
        { content: 'Trượt phỏng vấn lần 3, nhưng không bỏ cuộc 💪' },
      ],
    },
    hainam: {
      recent: [
        { content: 'Cung đường Hà Giang mùa hoa tam giác mạch 🌸', images: 3, location: 'Hà Giang' },
        { content: 'Đoàn khách tuần này siêu dễ thương, cảm ơn mọi người ❤️', images: 1 },
        { content: 'Kinh nghiệm phượt Tây Bắc mùa mưa: nhớ mang áo mưa bộ và đồ sửa xe 🏍️' },
      ],
      memories: [
        { content: 'Check-in cột cờ Lũng Cú lần đầu tiên 🇻🇳', images: 1, location: 'Hà Giang' },
        { content: 'Xe hỏng giữa đèo Mã Pí Lèng, may có người dân giúp 🙏', location: 'Hà Giang' },
        { content: 'Ngắm hoàng hôn ở Mũi Né, đẹp như tranh 🌅', images: 1, location: 'Phan Thiết' },
      ],
    },
    baongoc: {
      recent: [
        { content: 'Sau ca trực đêm, tự thưởng một chiếc bánh tiramisu tự làm 🍰', images: 1 },
        { content: 'Nhắc mọi người uống đủ nước và ngủ đủ giấc nhé 🩺', privacy: 'public' },
        { content: 'Công thức bánh bông lan trứng muối, ai cần mình gửi nè', images: 2, feeling: 'yêu đời ❤️' },
      ],
      memories: [
        { content: 'Ngày đầu mặc áo blouse trắng 👩‍⚕️', images: 1, location: 'Hà Nội' },
        { content: 'Thi xong nội trú rồi, giờ thì ngủ bù thôi 😴' },
      ],
    },
  };

  // Các khoảng thời gian cho bài thường: rải từ vài phút đến vài tháng, mỗi người lệch nhau để không trùng giờ
  const recentOffsets = [
    () => randInt(5, 50) * MINUTE,
    () => randInt(2, 20) * HOUR,
    () => randInt(1, 6) * DAY + randInt(0, 23) * HOUR,
    () => randInt(8, 30) * DAY + randInt(0, 23) * HOUR,
    () => randInt(40, 200) * DAY + randInt(0, 23) * HOUR,
  ];

  const reactionTypes = ['like', 'love', 'haha', 'wow', 'sad'] as const;
  // Thông tin tối thiểu của bài đã tạo, dùng để tạo bình luận và thông báo phía sau
  type CreatedPost = { _id: mongoose.Types.ObjectId; wallOwner?: unknown; taggedUsers?: unknown[] };
  const createdPosts: { post: CreatedPost; author: SeedUser; createdAt: Date }[] = [];
  const usedTimes = new Set<number>();

  /** Đảm bảo không có 2 bài trùng đúng thời điểm (lệch thêm vài phút nếu trùng). */
  const uniqueTime = (d: Date) => {
    let t = d.getTime();
    while (usedTimes.has(Math.floor(t / MINUTE))) t -= 7 * MINUTE;
    usedTimes.add(Math.floor(t / MINUTE));
    return new Date(t);
  };

  /** Tạo một bài viết kèm cảm xúc ngẫu nhiên của bạn bè / người khác. */
  const createPost = async (author: SeedUser, p: PostSeed, createdAt: Date, extra: Record<string, unknown> = {}) => {
    const pool = shuffle([...friendsOf(author), ...shuffle(users).slice(0, 3)]).filter(
      (u, i, arr) => String(u._id) !== String(author._id) && arr.findIndex((x) => String(x._id) === String(u._id)) === i
    );
    const reactors = pool.slice(0, randInt(0, Math.min(8, pool.length)));
    const post: CreatedPost = await PostModel.create({
      author: author._id,
      content: p.content,
      images: Array.from({ length: p.images || 0 }, (_, i) => PHOTO(`${author.username}-${createdAt.getTime()}-${i}`)),
      privacy: p.privacy || 'public',
      feeling: p.feeling,
      location: p.location,
      reactions: reactors.map((u) => ({ userId: u._id, type: pick([...reactionTypes]) })),
      sharesCount: randInt(0, 3),
      createdAt,
      ...extra,
    });
    createdPosts.push({ post, author, createdAt });
    return post;
  };

  for (const author of users) {
    const pool = contentByUser[author.username];
    // Bài thường: mỗi bài một khoảng thời gian khác nhau
    for (let i = 0; i < pool.recent.length; i++) {
      const offset = recentOffsets[i % recentOffsets.length]() + randInt(0, 59) * MINUTE;
      await createPost(author, pool.recent[i], uniqueTime(ago(offset)));
    }
    // Bài kỷ niệm: đúng ngày + tháng hôm nay, cách 1, 2, 3... năm, vào các giờ khác nhau
    for (let i = 0; i < pool.memories.length; i++) {
      const yearsBack = i + 1 + (rand() > 0.7 ? 1 : 0);
      await createPost(author, pool.memories[i], uniqueTime(sameDayYearsAgo(yearsBack, randInt(7, 22), randInt(0, 59))));
    }
  }

  // Vài bài đăng lên tường người khác và có gắn thẻ bạn bè
  await createPost(bao, { content: 'Chúc mừng sinh nhật Hoàng nhé! Sắp bảo vệ rồi, cố lên 🎂🎉' }, uniqueTime(ago(3 * HOUR)), { wallOwner: hoang._id });
  await createPost(cam, { content: 'Tặng Hà bức ảnh chụp hôm đi Đà Lạt nè 📷', images: 1 }, uniqueTime(ago(2 * DAY)), { wallOwner: ha._id });
  await createPost(duy, { content: 'Team đồ án họp nhóm lần cuối trước khi bảo vệ 💪', images: 1 }, uniqueTime(ago(9 * HOUR)), { taggedUsers: [hoang._id, phuc._id] });
  await createPost(hoang, { content: 'Đi ăn mừng hoàn thành demo cùng mọi người 🍻', images: 2, location: 'Hà Nội' }, uniqueTime(ago(30 * HOUR)), { taggedUsers: [bao._id, duy._id, maianh._id] });

  // ===== BÌNH LUẬN (kèm trả lời và lượt thích) =====
  console.log('Tạo bình luận...');
  const commentTexts = [
    'Hay quá!', 'Đẹp quá bạn ơi 😍', 'Chúc mừng nhé!', 'Cho mình xin info với', 'Haha đúng rồi đó',
    'Xuất sắc!', 'Nhìn thích ghê', 'Hôm nào rủ mình với nha', 'Tuyệt vời 👏', 'Kỷ niệm đẹp quá',
  ];
  const replyTexts = ['Cảm ơn bạn nhiều nha 🥰', 'Ok để mình gửi nhé', 'Hẹn lần sau đi cùng!', 'Haha chuẩn luôn'];
  let commentCount = 0;
  for (const { post, author, createdAt } of createdPosts) {
    if (rand() < 0.35) continue;
    const commenters = shuffle(users.filter((u) => String(u._id) !== String(author._id))).slice(0, randInt(1, 3));
    // Bình luận luôn sau thời điểm đăng bài và không vượt quá hiện tại
    const span = Math.max(Date.now() - createdAt.getTime(), MINUTE);
    let total = 0;
    for (const c of commenters) {
      const at = new Date(createdAt.getTime() + Math.floor(rand() * Math.min(span, 2 * DAY)));
      const comment = await CommentModel.create({
        post: post._id,
        author: c._id,
        content: pick(commentTexts),
        likes: shuffle(users).slice(0, randInt(0, 3)).map((u) => u._id),
        createdAt: at,
      });
      total++;
      // Thỉnh thoảng tác giả bài trả lời lại bình luận
      if (rand() < 0.4) {
        await CommentModel.create({
          post: post._id,
          author: author._id,
          content: pick(replyTexts),
          parent: comment._id,
          createdAt: new Date(Math.min(at.getTime() + randInt(5, 120) * MINUTE, Date.now())),
        });
        total++;
      }
    }
    await PostModel.updateOne({ _id: post._id }, { $set: { commentsCount: total } });
    commentCount += total;
  }

  // ===== STORY (còn hạn 24 giờ) =====
  console.log('Tạo story...');
  const gradients = [
    'from-indigo-500 via-purple-500 to-pink-500',
    'from-amber-500 via-rose-500 to-purple-600',
    'from-emerald-400 via-teal-500 to-cyan-600',
    'from-blue-600 via-indigo-600 to-violet-800',
  ];
  const storySeeds: [SeedUser, 'image' | 'text', string, number][] = [
    [cam, 'image', PHOTO('story-cam', 600, 1000), 2],
    [bao, 'text', 'Cuối tuần rồi, đi đâu chơi đây mọi người? 🏖️', 4],
    [linh, 'image', PHOTO('story-linh', 600, 1000), 6],
    [khoa, 'text', 'Live lúc 20h tối nay nha 🎮', 9],
    [nam, 'image', PHOTO('story-nam', 600, 1000), 13],
    [maianh, 'text', 'Hôm nay trời đẹp quá 🌤️', 18],
  ];
  await StoryModel.insertMany(
    storySeeds.map(([u, type, value, hoursBack]) => {
      const createdAt = ago(hoursBack * HOUR);
      return {
        user: u._id,
        type,
        privacy: 'public',
        mediaUrl: type === 'image' ? value : undefined,
        textContent: type === 'text' ? value : undefined,
        backgroundGradient: pick(gradients),
        createdAt,
        expiresAt: new Date(createdAt.getTime() + DAY),
        viewers: shuffle(users).slice(0, randInt(1, 5)).map((v) => ({ user: v._id, viewedAt: ago(randInt(0, hoursBack) * HOUR) })),
      };
    })
  );

  // ===== HỘI THOẠI & TIN NHẮN =====
  console.log('Tạo hội thoại & tin nhắn...');
  const convoPairs: [SeedUser, SeedUser, string[]][] = [
    [hoang, bao, ['Ê Bảo, mai họp nhóm lúc mấy giờ?', '9h sáng nhé, ở thư viện', 'Ok, nhớ mang laptop', 'Chuẩn bị slide chưa đấy 😂']],
    [hoang, duy, ['Phần realtime chạy ổn chưa em?', 'Ổn rồi anh, tin nhắn hiện ngay luôn', 'Tuyệt, tối anh review code nhé']],
    [bao, cam, ['Chào Cẩm, dạo này khoẻ không?', 'Mình khoẻ, cảm ơn Bảo nhé!', 'Cuối tuần đi cà phê không?', 'Ok luôn, mấy giờ vậy?']],
    [duy, phuc, ['Anh ơi cho em hỏi về deploy với ạ', 'Ừ em cứ hỏi', 'Sao build bị lỗi esbuild anh nhỉ?', 'Để anh xem log giúp em']],
    [ha, linh, ['Quán bún chả hôm trước ở đâu vậy?', 'Để mình gửi địa chỉ cho', 'Cảm ơn Linh nhiều nha 🥰']],
  ];
  let minutesBack = 10;
  for (const [userA, userB, msgs] of convoPairs) {
    const convo = await ConversationModel.create({ isGroup: false, participants: [userA._id, userB._id] });
    for (let i = 0; i < msgs.length; i++) {
      const sender = i % 2 === 0 ? userA : userB;
      await MessageModel.create({
        conversation: convo._id,
        sender: sender._id,
        kind: 'text',
        content: msgs[i],
        // Tin cuối của người kia để chưa đọc → có số tin chưa đọc
        readBy: i === msgs.length - 1 ? [sender._id] : [userA._id, userB._id],
        createdAt: ago((minutesBack + (msgs.length - i) * 3) * MINUTE),
      });
    }
    await ConversationModel.updateOne({ _id: convo._id }, { $set: { updatedAt: ago(minutesBack * MINUTE) } }, { timestamps: false });
    minutesBack += 45;
  }

  // Nhóm chat
  const group = await ConversationModel.create({
    isGroup: true,
    name: 'Nhóm đồ án tốt nghiệp',
    avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=group1',
    participants: [hoang._id, bao._id, duy._id, phuc._id],
  });
  const groupMsgs: [SeedUser | null, string][] = [
    [null, 'Trần Xuân Hoàng đã tạo nhóm "Nhóm đồ án tốt nghiệp".'],
    [hoang, 'Mọi người nhớ nộp báo cáo trước thứ 6 nhé'],
    [bao, 'Ok, phần của mình xong 80% rồi'],
    [phuc, 'Mình review phần backend cho nhé'],
    [duy, 'Em làm slide xong tối nay ạ 👍'],
  ];
  for (let i = 0; i < groupMsgs.length; i++) {
    const [sender, content] = groupMsgs[i];
    await MessageModel.create({
      conversation: group._id,
      sender: sender?._id,
      kind: sender ? 'text' : 'system',
      content,
      readBy: sender ? [sender._id] : [],
      createdAt: ago((groupMsgs.length - i) * 20 * MINUTE),
    });
  }

  // ===== THÔNG BÁO =====
  console.log('Tạo thông báo...');
  const hoangPosts = createdPosts.filter((p) => String(p.author._id) === String(hoang._id));
  await NotificationModel.insertMany([
    { user: hoang._id, actor: cam._id, type: 'like', content: 'đã thả cảm xúc (love) về bài viết của bạn', targetType: 'post', targetId: String(hoangPosts[0].post._id), createdAt: ago(40 * MINUTE) },
    { user: hoang._id, actor: bao._id, type: 'system', content: 'đã đăng một bài viết lên tường nhà bạn.', targetType: 'post', targetId: String(createdPosts.find((p) => p.post.wallOwner)!.post._id), createdAt: ago(3 * HOUR) },
    { user: hoang._id, actor: linh._id, type: 'friend_request', content: 'đã gửi cho bạn một lời mời kết bạn.', targetType: 'profile', targetId: String(linh._id), createdAt: ago(5 * HOUR) },
    { user: hoang._id, actor: duy._id, type: 'system', content: 'đã gắn thẻ bạn trong một bài viết.', targetType: 'post', targetId: String(createdPosts.find((p) => p.post.taggedUsers?.length)!.post._id), createdAt: ago(9 * HOUR) },
    { user: hoang._id, actor: tung._id, type: 'friend_request', content: 'đã gửi cho bạn một lời mời kết bạn.', targetType: 'profile', targetId: String(tung._id), createdAt: ago(26 * HOUR) },
    { user: hoang._id, actor: phuc._id, type: 'comment', content: 'đã bình luận về bài viết của bạn: "Tuyệt vời 👏..."', targetType: 'post', targetId: String(hoangPosts[1].post._id), createdAt: ago(2 * DAY), isRead: true },
    { user: ha._id, actor: phuc._id, type: 'friend_request', content: 'đã gửi cho bạn một lời mời kết bạn.', targetType: 'profile', targetId: String(phuc._id), createdAt: ago(20 * HOUR) },
  ]);

  const memoryCount = Object.values(contentByUser).reduce((n, u) => n + u.memories.length, 0);
  console.log('\n✅ Seed demo hoàn tất!');
  console.log(`   - ${users.length} người dùng (mật khẩu chung: 123456)`);
  console.log(`   - ${createdPosts.length} bài viết (trong đó ${memoryCount} bài kỷ niệm đúng ngày này các năm trước)`);
  console.log(`   - ${commentCount} bình luận, ${storySeeds.length} story, ${convoPairs.length + 1} hội thoại`);
  console.log(`   - Tài khoản demo: ${hoang.email} / 123456`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { chance, pick, rand, randInt, sample, weighted, daysAgo, DAY } from './seed-random';
import { TOPIC_DATA, TOPICS, GROUP_TOPIC, PAGE_IMAGE_TAG, PAGE_COMMENTS, CITY_IMAGE_TAG, CHECKIN_LINES, CHECKIN_COMMENTS, GENERAL_COMMENTS, WALL_COMMENTS, imageUrl } from './seed-topics';

export { TOPICS };

// Kho nội dung tiếng Việt + các hàm dựng nội dung (bài viết, reel, story...) cho db/seed-bulk.ts.

// ---------- Hồ sơ ----------
export const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
export const MIDDLE = ['Văn', 'Thị', 'Minh', 'Quốc', 'Ngọc', 'Gia', 'Thanh', 'Hữu', 'Đức', 'Anh', 'Thu', 'Bảo'];
export const FIRST = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hiếu', 'Hoa', 'Hùng', 'Khánh', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Nga', 'Phong', 'Phúc', 'Quân', 'Sơn', 'Thảo', 'Tuấn', 'Trang', 'Trung', 'Vy', 'Yến', 'Hạnh', 'Lộc', 'Tâm'];
export const CITIES = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Huế', 'Nha Trang', 'Đà Lạt', 'Vũng Tàu', 'Hội An', 'Sa Pa', 'Phú Quốc'];
export const WORKPLACES = ['FPT Software', 'VNG', 'Viettel', 'Shopee', 'Tiki', 'Freelancer', 'Sinh viên', 'Giáo viên', 'Bác sĩ', 'Kiến trúc sư'];

// ---------- Chủ đề ----------
const hashtagOf = (topic: string) => `#${topic.replace(/\s/g, '')}`;

export const GROUP_NAMES = ['Hội yêu du lịch', 'Dân công nghệ', 'Ẩm thực Việt', 'Nhiếp ảnh phố', 'Chạy bộ mỗi sáng', 'Đọc sách cùng nhau', 'Lập trình React', 'Mê phim hay', 'Thú cưng dễ thương', 'Game thủ Việt', 'Khởi nghiệp trẻ', 'Guitar & Piano', 'Học tiếng Anh', 'Phượt xe máy', 'Nấu ăn tại nhà', 'Cà phê cuối tuần', 'Cộng đồng AI', 'Yoga mỗi ngày', 'Đầu tư tài chính', 'Làm vườn trên sân thượng', 'Bóng đá phủi', 'Cờ vua online', 'Vẽ & thiết kế', 'Làm đẹp tự nhiên', 'Review sách hay', 'Du học sinh', 'Mẹ và bé', 'Xe cổ & mô tô', 'Âm nhạc indie', 'Marketing số'];
export const PAGE_NAMES = ['Tiệm bánh Hạnh Phúc', 'Cà phê Góc Phố', 'Tin công nghệ 24h', 'Nhà sách Trẻ', 'Phòng gym Fit+', 'Studio Ảnh Cưới', 'Quán phở Gia Truyền', 'Thời trang Minimal', 'Học viện Lập trình', 'Du lịch Việt Xanh', 'Cửa hàng Hoa Tươi', 'Podcast Chuyện Đêm', 'Nhạc viện Mini', 'Điện máy Số 1', 'Spa Thư Giãn', 'Nội thất Gỗ Ấm', 'Tiệm Sửa Xe Anh Ba', 'Kênh Review Phim', 'Trường Mầm Non Hoa Mai', 'Thú Y Pet Care'];

// ---------- Mẫu câu ----------
const SHORT_STATUSES = ['Thứ Hai rồi, cố lên cả nhà 💪', 'Mưa quá, ở nhà thôi ☔', 'Vừa xong deadline, thở phào 😮‍💨', 'Cà phê sáng và một ngày mới ☕', 'Đói quá, ai rủ đi ăn không? 🍜', 'Chúc mọi người cuối tuần vui vẻ!', 'Nhớ nhà ghê 🥲', 'Hôm nay là một ngày tuyệt vời ☀️', 'Đang nghe lại playlist cũ 🎧', 'Tập xong buổi chạy 5km 🏃', 'Cuối cùng cũng xong! 🎉', 'Ngủ sớm thôi nào 😴', 'Ai còn thức không?', 'Trời nóng chảy mỡ 🥵', 'Mới đổi kiểu tóc, mọi người thấy sao? 💇'];
const QUOTES = ['"Hành trình vạn dặm bắt đầu từ một bước chân."', '"Điều quan trọng không phải là bạn ngã bao nhiêu lần, mà là bạn đứng dậy bao nhiêu lần."', '"Làm việc bạn yêu thích và bạn sẽ không phải làm việc ngày nào trong đời."', '"Hạnh phúc không phải đích đến, mà là cách ta đi."', '"Mỗi ngày là một trang giấy trắng, hãy viết thật đẹp."'];
const WALL_MESSAGES = ['Chúc mừng sinh nhật bạn nhé! 🎂🎉', 'Lâu quá không gặp, cuối tuần cà phê nhé?', 'Cảm ơn bạn đã giúp mình hôm trước ❤️', 'Chúc mừng bạn nhận việc mới! 🎊', 'Nhớ bạn quá, bao giờ về chơi?'];
const SHARE_MESSAGES = ['Hay quá nên chia sẻ lại!', 'Mọi người đọc thử nhé 👇', 'Đồng ý với quan điểm này.', 'Lưu lại để đọc sau.', 'Thông tin hữu ích cho ai cần.'];
const OLD_VERSIONS = ['Bản nháp đầu tiên của bài viết này.', 'Mới đăng, sẽ bổ sung sau.', 'Viết vội quá, sửa lại cho rõ ý.'];
const GROUP_QUESTIONS = ['Mọi người ơi, có ai biết chỗ nào tốt cho {t} không?', 'Mình mới tham gia nhóm, xin được chỉ giáo về {t} ạ!', 'Tuần này nhóm mình có buổi giao lưu về {t} không nhỉ?', 'Chia sẻ kinh nghiệm {t} của bạn trong 1 câu nào!'];
const PAGE_ANNOUNCEMENTS = ['Khai trương chi nhánh mới! 🎉 Giảm {n}% cho 100 khách đầu tiên.', 'Thông báo lịch hoạt động tuần này, mời mọi người ghé thăm.', 'Sản phẩm mới đã có mặt! Xem chi tiết ở phần bình luận 👇', 'Cảm ơn {n}.000 lượt theo dõi! Tri ân bằng ưu đãi đặc biệt.', 'Câu chuyện đằng sau thương hiệu của chúng tôi.', 'Góc khách hàng chia sẻ: những phản hồi đáng nhớ nhất tháng này.'];
const FEELINGS = ['hạnh phúc 😊', 'hào hứng 🌟', 'thư giãn ☕', 'tuyệt vời 🌄', 'biết ơn 🙏', 'mệt mỏi 😴'];
export const REACTION_TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry'] as const;

// ---------- Media ----------
const GCS = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample';
/** Video mẫu công khai: dùng nhiều video khác nhau để các reel / bài video không giống hệt nhau. */
export const VIDEOS = [`${GCS}/ForBiggerBlazes.mp4`, `${GCS}/ForBiggerEscapes.mp4`, `${GCS}/ForBiggerFun.mp4`, `${GCS}/ForBiggerJoyrides.mp4`, `${GCS}/ForBiggerMeltdowns.mp4`, `${GCS}/SubaruOutbackOnStreetAndDirt.mp4`, `${GCS}/WeAreGoingOnBullrun.mp4`, `${GCS}/WhatCarCanYouGetForAGrand.mp4`, 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'];

// ---------- Story ----------
export const STORY_GRADIENTS = ['from-indigo-500 via-purple-500 to-pink-500', 'from-amber-500 via-rose-500 to-purple-600', 'from-emerald-400 via-teal-500 to-cyan-600', 'from-blue-600 via-indigo-600 to-violet-800', 'from-rose-500 via-red-500 to-orange-500', 'from-slate-900 via-purple-900 to-slate-900'];
export const STORY_EMOJIS = ['❤️', '🔥', '👏', '😮', '😂'] as const;
const STORY_TEXTS = [...SHORT_STATUSES, ...QUOTES, 'Hôm nay ăn gì đây? 🤔', 'Góc làm việc của mình ✨', 'Chill cuối ngày 🌇', 'Cảm ơn mọi người đã động viên ❤️', 'Bắt đầu một tuần mới!'];
/** Nội dung một story dạng chữ. */
export const storyText = () => pick(STORY_TEXTS);

// ---------- Dựng nội dung ----------
// Mỗi hàm trả về { ..., comments }: `comments` là kho bình luận PHÙ HỢP với đúng bài đó (bám nội dung, không nhắc "ảnh" khi bài không có ảnh).

/** Bình luận chỉ dùng khi bài có ảnh. */
const IMAGE_COMMENTS = ['Ảnh đẹp quá!', 'Góc chụp đẹp thật sự!', 'Ảnh này chụp ở đâu vậy bạn?'];
/** Bình luận cho reel. */
const REEL_COMMENTS = ['Video hay quá!', 'Quay đẹp ghê, bạn dựng bằng app nào vậy?', 'Nhạc nền nghe cuốn thật, tên bài gì vậy bạn?', 'Mình xem đi xem lại mấy lần rồi 😄'];

let imageSeq = 0; // đếm toàn cục: mỗi ảnh một khoá riêng nên không bị trùng ảnh

/** `count` ảnh: ảnh đầu theo từ khoá của chính câu chú thích (`first`), các ảnh sau thêm từ khoá khác cùng chủ đề. */
function imagesFor(first: string, others: string[], count: number) {
  const order = [first, ...sample(others.filter((t) => t !== first), count - 1)];
  return order.slice(0, count).map((tag) => imageUrl(tag, ++imageSeq));
}
const imageCount = () => weighted([[1, 60], [2, 25], [3, 10], [4, 5]] as const);

/** Một câu chú thích về chủ đề (kèm từ khoá ảnh khớp với câu đó) + hashtag chủ đề (thường có) và vài hashtag chung. */
function topicText(topic: string) {
  const { lines, lineTags } = TOPIC_DATA[topic];
  const i = Math.floor(rand() * lines.length);
  const tags = chance(0.7) ? [hashtagOf(topic), ...sample(['#cuoctuan', '#chiase', '#vui'], randInt(0, 1))] : [];
  return { text: [lines[i], ...tags].join(' '), imageTag: lineTags[i] };
}

/** Bài về chủ đề: nội dung `text`, có ảnh với xác suất p (ảnh đầu khớp câu chú thích), kèm kho bình luận (thêm bình luận về ảnh nếu có ảnh). */
function topicPost(topic: string, p: number, { text, imageTag }: { text: string; imageTag: string }, extra: Record<string, unknown> = {}) {
  const images = chance(p) ? imagesFor(imageTag, TOPIC_DATA[topic].imageTags, imageCount()) : undefined;
  return { fields: { content: text, ...extra, ...(images && { images }) }, comments: [...TOPIC_DATA[topic].comments, ...(images ? IMAGE_COMMENTS : [])] };
}

/** Chú thích một reel: câu riêng của reel + hashtag chủ đề. */
export function reelPost() {
  const captions = ['Khoảnh khắc hôm nay 🎬', 'Chuyến đi cuối tuần ✈️', 'Làm cùng mình nhé!', 'POV: buổi sáng của mình ☕', 'Thử thách 30 ngày, ngày thứ {n}', 'Góc nhỏ yêu thích của mình 🌿', 'Mẹo nhanh cho người mới bắt đầu', 'Tiếng nhạc này nghe là nghiện 🎶', 'Review nhanh sau 1 tuần dùng', 'Cùng đi dạo phố nào 🚶'];
  return { content: `${pick(captions).replace('{n}', String(randInt(1, 30)))} ${hashtagOf(pick(TOPICS))} #reel`, comments: REEL_COMMENTS };
}

/** Bài trong nhóm: đúng chủ đề của nhóm; ~30% là câu hỏi kiểu cộng đồng (không ảnh), còn lại 75% có ảnh. */
export function groupPost(groupName: string) {
  const topic = GROUP_TOPIC[groupName] ?? pick(TOPICS);
  if (chance(0.3)) return { fields: { content: pick(GROUP_QUESTIONS).replace('{t}', topic) }, comments: TOPIC_DATA[topic].comments };
  return topicPost(topic, 0.75, topicText(topic));
}

/** Bài của trang: thông báo / khuyến mãi; 60% có ảnh đúng ngành của trang, bình luận kiểu khách hàng. */
export function pagePost(pageName: string) {
  const tag = PAGE_IMAGE_TAG[pageName] ?? 'shop';
  const images = chance(0.6) ? imagesFor(tag, [], 1) : undefined;
  return { fields: { content: pick(PAGE_ANNOUNCEMENTS).replace('{n}', String(randInt(5, 50))), ...(images && { images }) }, comments: [...PAGE_COMMENTS, ...(images ? IMAGE_COMMENTS : [])] };
}

/** Ngữ cảnh để dựng một bài thường. */
export interface PostContext {
  authorId: string;
  userIds: string[];
  names: Map<string, string>;
}

/** Các kiểu bài thường và trọng số — nội dung chủ đề (kèm ảnh) chiếm đa số, tổng cộng ~60% bài có ảnh. */
const POST_KINDS = [['standard', 50], ['short', 12], ['photos', 15], ['long', 6], ['checkin', 5], ['tagged', 5], ['video', 3], ['shared', 2], ['wall', 2]] as const;

type Built = { fields: Record<string, unknown> & { content: string }; comments: string[] };

/** Dựng nội dung + phần đính kèm của một bài thường, theo một kiểu ngẫu nhiên có trọng số. */
function normalPostBody({ authorId, userIds, names }: PostContext): Built {
  const others = userIds.filter((id) => id !== authorId);
  const topic = pick(TOPICS);
  switch (weighted(POST_KINDS)) {
    case 'short':
      return { fields: { content: chance(0.25) ? pick(QUOTES) : pick(SHORT_STATUSES) }, comments: GENERAL_COMMENTS };
    case 'long': {
      const main = topicText(topic);
      const more = sample(TOPIC_DATA[topic].lines, randInt(1, 2));
      return topicPost(topic, 0.5, { text: [main.text, ...more, hashtagOf(topic)].join('\n\n'), imageTag: main.imageTag });
    }
    case 'photos': {
      // Luôn có ảnh, ~85% kèm chú thích đúng chủ đề
      const caption = topicText(topic);
      const count = weighted([[1, 40], [2, 25], [3, 15], [4, 12], [5, 5], [6, 3]] as const);
      return { fields: { content: chance(0.85) ? caption.text : '', images: imagesFor(caption.imageTag, TOPIC_DATA[topic].imageTags, count) }, comments: [...TOPIC_DATA[topic].comments, ...IMAGE_COMMENTS] };
    }
    case 'video':
      return { fields: { content: topicText(topic).text, video: pick(VIDEOS) }, comments: TOPIC_DATA[topic].comments };
    case 'checkin': {
      const city = pick(CITIES);
      const images = chance(0.8) ? imagesFor(CITY_IMAGE_TAG[city], [], 1) : undefined;
      return { fields: { content: pick(CHECKIN_LINES).replace('{c}', city), feeling: pick(FEELINGS), location: city, ...(images && { images }) }, comments: [...CHECKIN_COMMENTS, ...(images ? IMAGE_COMMENTS : [])] };
    }
    case 'tagged':
      return topicPost(topic, 0.7, topicText(topic), { taggedUsers: sample(others, randInt(1, 3)) });
    case 'shared': {
      const source = pick(others);
      return { fields: { content: `${pick(SHARE_MESSAGES)}\n\n[Chia sẻ từ @${names.get(source)}]:\n${topicText(topic).text}` }, comments: GENERAL_COMMENTS };
    }
    case 'wall':
      return { fields: { content: pick(WALL_MESSAGES), wallOwner: pick(others) }, comments: WALL_COMMENTS };
    default:
      return topicPost(topic, 0.7, topicText(topic));
  }
}

/** Một bài thường hoàn chỉnh: nội dung theo kiểu ngẫu nhiên + quyền riêng tư, vị trí / cảm xúc rải rác, một số bài đã sửa / ghim / tắt bình luận. */
export function normalPost(ctx: PostContext) {
  const { fields: body, comments } = normalPostBody(ctx);
  const createdAt = daysAgo(365);
  const roll = rand();
  const post: Record<string, unknown> = {
    ...body,
    author: ctx.authorId,
    createdAt,
    privacy: body.wallOwner ? 'public' : roll < 0.7 ? 'public' : roll < 0.95 ? 'friends' : 'only_me',
    feeling: body.feeling ?? (chance(0.08) ? pick(FEELINGS) : undefined),
    location: body.location ?? (chance(0.08) ? pick(CITIES) : undefined),
    pinned: chance(0.007),
    commentsDisabled: chance(0.01),
  };
  if (chance(0.05)) {
    // Bài đã chỉnh sửa: có phiên bản cũ trong lịch sử
    const editedAt = new Date(createdAt.getTime() + randInt(1, 48) * 3_600_000);
    post.editedAt = editedAt;
    post.editHistory = [{ content: pick(OLD_VERSIONS), editedAt }];
  }
  return { post, comments };
}

/** Thời điểm hết hạn của một story: 24 giờ sau lúc tạo. */
export const storyExpiry = (createdAt: Date) => new Date(createdAt.getTime() + DAY);

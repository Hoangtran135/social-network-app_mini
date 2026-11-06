import { z, ZodType } from 'zod';
import { PAGE_CATEGORIES } from './models/Page';
import { Request, Response, NextFunction } from 'express';

// Kiểm tra dữ liệu client gửi lên (req.body) trước khi vào route, dùng thư viện Zod.
// Mỗi "schema" bên dưới là bộ luật cho một API; dùng bằng cách: router.post('/x', validate(tênSchema), handler)

/** Middleware: dữ liệu sai luật → trả lỗi 400; đúng → thay req.body bằng dữ liệu đã làm sạch (trim, giá trị mặc định). */
export function validate(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Dữ liệu không hợp lệ.',
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

// Một vài kiểu dùng lại nhiều lần
const id = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ.');
const text = (max: number) => z.string().trim().max(max);
const url = z.string().max(2000);
const email = z.string().trim().email().max(200);
const newPassword = z.string().min(6).max(200);
const postPrivacy = z.enum(['public', 'friends', 'only_me']);

// ----- Tài khoản -----
export const registerSchema = z.object({
  name: text(100).min(1),
  username: text(30).min(3).regex(/^[a-zA-Z0-9_.]+$/, 'Username chỉ được chứa chữ, số, dấu chấm và gạch dưới.'),
  email,
  password: newPassword,
});
export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
export const verifyEmailSchema = z.object({ email, token: z.string().min(1).max(500) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ email, token: z.string().min(1).max(500), password: newPassword });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword });
export const AVATAR_FRAMES = ['none', 'blue', 'green', 'rose', 'gold', 'rainbow'] as const;
export const SOCIAL_PLATFORMS = ['facebook', 'github', 'linkedin', 'twitter', 'instagram', 'youtube', 'tiktok'] as const;
// Liên kết mạng xã hội: để trống (xoá) hoặc BẮT BUỘC bắt đầu bằng http(s):// — chặn "javascript:" và các giao thức nguy hiểm khác vì liên kết được đưa vào thẻ <a href>
const socialUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === '' || /^https?:\/\/[^\s<>"']+$/i.test(v), 'Liên kết phải bắt đầu bằng http:// hoặc https://');
export const updateProfileSchema = z.object({
  name: text(100).min(1).optional(),
  bio: text(500).optional(),
  avatar: url.optional(),
  coverImage: url.optional(),
  workplace: text(150).optional(),
  education: text(150).optional(),
  location: text(150).optional(),
  website: text(300).optional(),
  avatarFrame: z.enum(AVATAR_FRAMES).optional(),
  socialLinks: z.object(Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, socialUrl.optional()])) as Record<(typeof SOCIAL_PLATFORMS)[number], z.ZodOptional<typeof socialUrl>>).optional(),
});

// ----- Bài viết -----
export const createPostSchema = z.object({
  content: text(10000).default(''),
  images: z.array(url).max(20).optional(),
  video: url.optional(),
  privacy: postPrivacy.default('public'),
  feeling: text(100).optional(),
  location: text(200).optional(),
  wallOwnerId: id.optional(),
  taggedUserIds: z.array(id).max(50).optional(),
});
export const updatePostSchema = z.object({
  content: text(10000).optional(),
  privacy: postPrivacy.optional(),
  feeling: text(100).optional(),
  images: z.array(url).max(20).optional(),
  video: url.optional(),
  location: text(200).optional(),
});
export const reactPostSchema = z.object({ type: z.enum(['like', 'love', 'haha', 'wow', 'sad', 'angry']) });
export const sharePostSchema = z.object({ message: text(2000).optional() });

// ----- Bình luận, story, bạn bè -----
export const createCommentSchema = z.object({
  postId: id,
  content: text(3000).default(''),
  image: url.optional(),
  parentId: id.optional(),
  taggedUserIds: z.array(id).max(50).optional(),
});
export const updateCommentSchema = z.object({ content: text(3000) });
export const STORY_EMOJIS = ['❤️', '🔥', '👏', '😮', '😂'] as const;
export const reactStorySchema = z.object({ emoji: z.enum(STORY_EMOJIS) });
export const createStorySchema = z.object({
  type: z.enum(['image', 'text']),
  mediaUrl: url.optional(),
  textContent: text(500).optional(),
  backgroundGradient: z.string().max(200).optional(),
  privacy: z.enum(['public', 'friends']).default('public'),
});
export const sendFriendRequestSchema = z.object({ targetUserId: id });

// ----- Tin nhắn -----
export const createConversationSchema = z.object({
  participantId: id.optional(),
  participantIds: z.array(id).max(100).optional(),
  name: text(150).optional(),
});
export const setNicknameSchema = z.object({ userId: id, nickname: text(60).optional().default('') });
export const sendMessageSchema = z.object({
  content: text(5000).default(''),
  attachments: z
    .array(z.object({ type: z.enum(['image', 'file']), url, name: z.string().max(300), size: z.string().max(50).optional() }))
    .max(10)
    .optional(),
});
export const sharePostToChatSchema = z.object({ postId: id, message: text(2000).optional() });
export const reactMessageSchema = z.object({ emoji: z.string().min(1).max(8).optional() });

// ----- Reels (video ngắn) -----
export const createReelSchema = z.object({
  video: url.min(1),
  caption: text(300).default(''),
  privacy: z.enum(['public', 'friends']).default('public'),
});

// ----- Trang (fanpage) -----
const pageCategory = z.enum(PAGE_CATEGORIES);
const webUrl = z.string().trim().max(300).refine((v) => v === '' || /^https?:\/\//i.test(v), 'Website phải bắt đầu bằng http:// hoặc https://');
export const createPageSchema = z.object({
  name: text(80).min(2),
  category: pageCategory.default('other'),
  description: text(1000).default(''),
  website: webUrl.optional(),
  address: text(200).optional(),
  avatar: url.optional(),
  cover: url.optional(),
});
export const updatePageSchema = z.object({
  name: text(80).min(2).optional(),
  category: pageCategory.optional(),
  description: text(1000).optional(),
  website: webUrl.optional(),
  address: text(200).optional(),
  avatar: url.optional(),
  cover: url.optional(),
});
export const pageAdminSchema = z.object({ userId: id });
export const createPagePostSchema = z.object({
  content: text(10000).default(''),
  images: z.array(url).max(20).optional(),
  video: url.optional(),
});

// ----- Nhóm giao lưu -----
const groupPrivacy = z.enum(['public', 'private']);
const groupRules = z.array(text(300).min(1)).max(10);
const groupQuestions = z.array(text(150).min(1)).max(3);
export const createGroupSchema = z.object({
  name: text(80).min(2),
  description: text(1000).default(''),
  privacy: groupPrivacy.default('public'),
  rules: groupRules.default([]),
  joinQuestions: groupQuestions.default([]),
  postApproval: z.boolean().default(false),
  avatar: url.optional(),
  cover: url.optional(),
});
// Sửa nhóm: chỉ gửi trường nào cần đổi (không có giá trị mặc định để không ghi đè trường không gửi)
export const updateGroupSchema = z.object({
  name: text(80).min(2).optional(),
  description: text(1000).optional(),
  privacy: groupPrivacy.optional(),
  rules: groupRules.optional(),
  joinQuestions: groupQuestions.optional(),
  postApproval: z.boolean().optional(),
  avatar: url.optional(),
  cover: url.optional(),
});
export const joinGroupSchema = z.object({ answers: z.array(text(300)).max(3).default([]) });
export const setMemberRoleSchema = z.object({ role: z.enum(['admin', 'member']) });
export const transferGroupSchema = z.object({ userId: id });
export const createGroupPostSchema = z.object({
  content: text(10000).default(''),
  images: z.array(url).max(20).optional(),
  video: url.optional(),
  feeling: text(100).optional(),
  location: text(200).optional(),
});
export const reportGroupPostSchema = z.object({ reason: text(300).default('') });
export const resolveReportSchema = z.object({ action: z.enum(['dismiss', 'remove']) });

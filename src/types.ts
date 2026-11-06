// Kiểu dữ liệu dùng chung ở frontend. Phải khớp với JSON mà server trả về (xem server/formatResponse.ts).

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';
export type Privacy = 'public' | 'friends' | 'only_me';
export type AvatarFrame = 'none' | 'blue' | 'green' | 'rose' | 'gold' | 'rainbow';
export type SocialPlatform = 'facebook' | 'github' | 'linkedin' | 'twitter' | 'instagram' | 'youtube' | 'tiktok';

export interface User {
  id: string;
  name: string;
  username: string;
  email?: string; // chỉ có với chính mình (server không trả email của người khác)
  avatar: string;
  coverImage?: string;
  bio?: string;
  workplace?: string;
  education?: string;
  location?: string;
  website?: string;
  avatarFrame?: AvatarFrame; // khung quanh ảnh đại diện
  socialLinks?: Partial<Record<SocialPlatform, string>>; // chỉ gồm các liên kết có giá trị
  joinDate: string;
  friendsCount: number;
  isOnline?: boolean;
  lastActive?: string;
  blockedUserIds?: string[]; // chỉ có với chính mình
  emailVerified?: boolean; // chỉ có với chính mình; false = chưa bấm link xác minh trong email
  role?: 'user' | 'admin'; // chỉ có với chính mình; 'admin' = quản trị hệ thống
}

export interface Post {
  id: string;
  author: User;
  wallOwnerId?: string; // có khi bài được đăng lên tường người khác
  wallOwnerName?: string;
  content: string;
  images?: string[];
  video?: string;
  privacy: Privacy;
  feeling?: string;
  location?: string;
  taggedUsers?: User[];
  createdAt: string;
  updatedAt?: string; // lần sửa nội dung gần nhất
  reactions: { type: ReactionType; userId: string; userName: string }[];
  commentsCount: number;
  sharesCount: number;
  isSaved?: boolean; // người đang xem đã lưu bài này chưa
  pinned?: boolean;
  hashtags?: string[]; // chữ thường
  commentsDisabled?: boolean; // chủ bài đã tắt bình luận
  editHistory?: { content: string; editedAt: string }[]; // các phiên bản nội dung TRƯỚC mỗi lần sửa (editedAt = lúc bị thay thế)
  groupId?: string; // có khi là bài đăng trong nhóm (chỉ xem ở trang nhóm)
  groupName?: string;
  groupStatus?: 'approved' | 'pending'; // pending = đang chờ quản trị viên duyệt
  pageId?: string; // có khi bài được đăng với tư cách một Trang (fanpage)
  pageName?: string;
  pageAvatar?: string;
  kind?: 'reel'; // reel = video ngắn (chỉ hiện ở mục Reels)
  viewsCount?: number; // số lượt xem của reel
}

export interface Comment {
  id: string;
  postId: string;
  author: User;
  content: string;
  image?: string;
  taggedUsers?: User[];
  createdAt: string;
  likes: string[]; // id những người đã THÍCH (chỉ cảm xúc "like")
  reactions?: { type: ReactionType; userId: string }[]; // mọi cảm xúc, gồm cả like
  editedAt?: string; // lần sửa gần nhất
  parentId?: string; // có giá trị = đây là câu trả lời
}

export interface Story {
  id: string;
  user: User;
  type: 'image' | 'text';
  privacy: 'public' | 'friends';
  mediaUrl?: string;
  textContent?: string;
  backgroundGradient?: string;
  createdAt: string;
  expiresAt: string;
  viewers: { userId: string; userName: string; avatar: string; viewedAt: string }[];
  reactions?: { userId: string; userName: string; avatar: string; emoji: string }[]; // cảm xúc nhanh (mỗi người một emoji)
}

export interface MessageAttachment {
  type: 'image' | 'file';
  url: string;
  name: string;
  size?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  kind?: 'text' | 'system';
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  attachments?: MessageAttachment[];
  sharedPostId?: string;
  createdAt: string;
  isRead: boolean; // mọi thành viên khác đã đọc
  deliveredTo?: string[]; // những người đã NHẬN tin (thiết bị đã báo về)
  isRecalled?: boolean;
  reactions?: Record<string, string>; // { userId: emoji }
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  name?: string;
  avatar?: string;
  participants: User[];
  nicknames?: Record<string, string>; // { userId: biệt danh }
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: string;
}

export interface FriendRequest {
  id: string;
  sender: User;
  receiverId: string;
  receiver?: User;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  actor: User; // người gây ra thông báo
  type: 'like' | 'comment' | 'friend_request' | 'friend_accept' | 'system';
  content: string;
  targetId?: string;
  targetType?: 'post' | 'profile' | 'group' | 'page' | 'system';
  isRead: boolean;
  createdAt: string;
}

// ----- Nhóm giao lưu -----
export type GroupRole = 'owner' | 'admin' | 'member';

export interface Group {
  id: string;
  name: string;
  description: string;
  rules: string[];
  privacy: 'public' | 'private';
  avatar?: string;
  cover?: string;
  ownerId: string;
  postApproval: boolean; // bài của thành viên thường phải được duyệt
  joinQuestions: string[]; // câu hỏi khi xin vào nhóm riêng tư
  membersCount: number;
  createdAt: string;
  myRole: GroupRole | null; // vai trò của mình (null nếu chưa là thành viên)
  myStatus: 'active' | 'pending' | null; // pending = đã xin vào, đang chờ duyệt
  // Chỉ có khi mình là quản trị viên: số việc đang chờ xử lý
  pendingMembersCount?: number;
  pendingPostsCount?: number;
  openReportsCount?: number;
}

export interface GroupMember {
  user: User;
  role: GroupRole;
  status: 'active' | 'pending';
  answers?: { question: string; answer: string }[]; // câu trả lời xin vào nhóm (chỉ quản trị viên thấy)
  joinedAt: string;
}

export interface GroupReport {
  id: string;
  reporter: User;
  reason: string;
  createdAt: string;
  post: Post;
}

// ----- Trang (fanpage) -----
export type PageCategory = 'brand' | 'business' | 'community' | 'public_figure' | 'entertainment' | 'education' | 'nonprofit' | 'other';

export interface Page {
  id: string;
  name: string;
  category: PageCategory;
  description: string;
  website?: string;
  address?: string;
  avatar?: string;
  cover?: string;
  ownerId: string;
  followersCount: number;
  createdAt: string;
  myRole: 'owner' | 'admin' | null; // vai trò của mình (null = người xem thường)
  isFollowing: boolean;
  admins?: User[]; // chỉ có khi mình là quản trị viên: chủ trang + các quản trị viên
}

// ----- Tìm kiếm tổng hợp -----
export interface SearchResults {
  query: string;
  people: { user: User; reasons: string[] }[];
  groups: { group: Group; reasons: string[] }[];
  pages: { page: Page; reasons: string[] }[];
  posts: { post: Post; reasons: string[] }[];
}

// ----- Quản trị hệ thống (/admin) -----
export interface AdminPerson {
  id: string;
  name: string;
  username: string;
  avatar?: string;
}

export interface AdminStats {
  users: number;
  online: number;
  banned: number;
  admins: number;
  newToday: number;
  posts: number;
  reels: number;
  comments: number;
  groups: number;
  pages: number;
  pendingReports: number;
}

export interface AdminUser extends AdminPerson {
  email: string;
  role: 'user' | 'admin';
  banned: boolean;
  banReason?: string;
  bannedAt?: string;
  isOnline: boolean;
  joinDate?: string;
}

export interface AdminPost {
  id: string;
  kind: 'post' | 'reel' | 'group' | 'page';
  content: string;
  mediaCount: number;
  author: AdminPerson | null;
  groupName?: string;
  pageName?: string;
  privacy: Privacy;
  groupStatus?: 'approved' | 'pending';
  commentsCount: number;
  reactionsCount: number;
  createdAt: string;
}

export interface AdminComment {
  id: string;
  content: string;
  author: AdminPerson | null;
  postId: string;
  postExcerpt: string;
  isReply: boolean;
  likesCount: number;
  createdAt: string;
}

export interface AdminGroup {
  id: string;
  name: string;
  description: string;
  privacy: 'public' | 'private';
  avatar?: string;
  owner: AdminPerson | null;
  membersCount: number;
  postsCount: number;
  createdAt: string;
}

export interface AdminPage {
  id: string;
  name: string;
  category: PageCategory;
  avatar?: string;
  owner: AdminPerson | null;
  followersCount: number;
  postsCount: number;
  createdAt: string;
}

export type ReportTarget = 'post' | 'comment' | 'user' | 'group' | 'page';
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'violence' | 'nudity' | 'fake' | 'other';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

export interface AdminReport {
  id: string;
  reporter: AdminPerson | null;
  targetType: ReportTarget;
  targetId: string;
  targetName: string;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  resolutionNote?: string;
  handledBy: AdminPerson | null;
  handledAt?: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert';
  createdBy: AdminPerson | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  admin: AdminPerson | null;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

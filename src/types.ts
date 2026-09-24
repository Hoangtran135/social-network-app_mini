// Kiểu dữ liệu dùng chung ở frontend. Phải khớp với JSON mà server trả về (xem server/formatResponse.ts).

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';
export type Privacy = 'public' | 'friends' | 'only_me';

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar: string;
  coverImage?: string;
  bio?: string;
  workplace?: string;
  education?: string;
  location?: string;
  website?: string;
  joinDate: string;
  friendsCount: number;
  isOnline?: boolean;
  lastActive?: string;
  blockedUserIds?: string[]; // chỉ có với chính mình
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
}

export interface Comment {
  id: string;
  postId: string;
  author: User;
  content: string;
  image?: string;
  taggedUsers?: User[];
  createdAt: string;
  likes: string[]; // id những người đã thích
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
  targetType?: 'post' | 'profile' | 'system';
  isRead: boolean;
  createdAt: string;
}

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Post, Comment, Story, Conversation, Message, FriendRequest, NotificationItem, ReactionType, User, Privacy } from '../types';
import { useAuth } from './AuthContext';
import { api, ApiError } from '../utils/api';
import { getSocket } from '../utils/socket';

// "KHO DỮ LIỆU" CHÍNH CỦA FRONTEND: giữ bài viết, bình luận, story, bạn bè, tin nhắn, thông báo trong state
// và cung cấp các hàm thao tác (đăng bài, bình luận, kết bạn, nhắn tin...). Mỗi hàm: gọi API → cập nhật state.
// Ngoài ra lắng nghe Socket.io để cập nhật ngay khi người khác thay đổi dữ liệu (realtime).
// Component nào cần thì gọi: const { posts, createPost } = useSocial();

const POSTS_PAGE = 20;
const NOTIFS_PAGE = 30;

type ToastType = 'success' | 'error' | 'info';

function useSocialState() {
  const { currentUser } = useAuth();
  const myId = currentUser?.id;

  const [posts, setPosts] = useState<Post[]>([]);
  const [memoryPosts, setMemoryPosts] = useState<Post[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false);
  const [comments, setComments] = useState<Record<string, Comment[]>>({}); // { postId: [bình luận] }
  const [stories, setStories] = useState<Story[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]); // lời mời gửi đến mình
  const [sentFriendRequests, setSentFriendRequests] = useState<FriendRequest[]>([]); // lời mời mình đã gửi
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({}); // { conversationId: [tin nhắn] }
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // ---------- Hàm tiện ích dùng chung ----------

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  /** Chạy một thao tác; lỗi thì hiện toast đỏ (ưu tiên câu báo lỗi của server). Trả về kết quả, hoặc undefined nếu lỗi. */
  async function attempt<T>(action: () => Promise<T>, errorText: string): Promise<T | undefined> {
    try {
      return await action();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : errorText, 'error');
    }
  }

  /** Sửa bài viết ở CẢ bảng tin lẫn trang Kỷ niệm (một bài có thể nằm ở cả hai nơi). */
  const updatePosts = (change: (list: Post[]) => Post[]) => {
    setPosts(change);
    setMemoryPosts(change);
  };
  const replacePost = (post: Post) => updatePosts((list) => list.map((p) => (p.id === post.id ? post : p)));
  const changeCommentsCount = (postId: string, delta: number) =>
    updatePosts((list) => list.map((p) => (p.id === postId ? { ...p, commentsCount: Math.max(0, p.commentsCount + delta) } : p)));

  /** Thêm tin nhắn mới hoặc thay tin nhắn cũ (cùng id) trong một hội thoại. */
  const upsertMessage = (conversationId: string, message: Message) =>
    setMessages((prev) => {
      const list = prev[conversationId] || [];
      const exists = list.some((m) => m.id === message.id);
      return { ...prev, [conversationId]: exists ? list.map((m) => (m.id === message.id ? message : m)) : [...list, message] };
    });

  /** Sau khi gửi tin: cập nhật tin nhắn cuối để hội thoại hiện đúng trong danh sách. */
  const setLastMessage = (conversationId: string, message: Message) =>
    setConversations((list) => list.map((c) => (c.id === conversationId ? { ...c, lastMessage: message, updatedAt: message.createdAt } : c)));

  // ---------- Tải dữ liệu ban đầu mỗi khi người đăng nhập thay đổi ----------

  useEffect(() => {
    if (!myId) {
      // Đăng xuất → xoá sạch dữ liệu của người cũ
      [setPosts, setMemoryPosts, setStories, setFriends, setFriendRequests, setSentFriendRequests, setConversations, setNotifications].forEach((set) => set([]));
      setComments({});
      setMessages({});
      return;
    }
    // Mỗi API tải riêng; một cái lỗi thì các cái khác vẫn hiển thị được
    const load = <T,>(path: string, onData: (data: T) => void) => api.get<T>(path).then(onData).catch(() => {});
    load<{ posts: Post[] }>(`/posts?limit=${POSTS_PAGE}`, (d) => {
      setPosts(d.posts);
      setHasMorePosts(d.posts.length === POSTS_PAGE);
    });
    load<{ stories: Story[] }>('/stories', (d) => setStories(d.stories));
    load<{ friends: User[] }>('/friends', (d) => setFriends(d.friends));
    load<{ requests: FriendRequest[] }>('/friends/requests', (d) => setFriendRequests(d.requests));
    load<{ requests: FriendRequest[] }>('/friends/requests/sent', (d) => setSentFriendRequests(d.requests));
    load<{ conversations: Conversation[] }>('/messages/conversations', (d) => setConversations(d.conversations));
    load<{ notifications: NotificationItem[] }>(`/notifications?limit=${NOTIFS_PAGE}`, (d) => {
      setNotifications(d.notifications);
      setHasMoreNotifications(d.notifications.length === NOTIFS_PAGE);
    });
  }, [myId]);

  // Vừa chặn ai đó → ẩn ngay bài viết, bạn bè, chat 1-1 của người đó
  const blockedKey = (currentUser?.blockedUserIds || []).join(',');
  useEffect(() => {
    const blocked = new Set(currentUser?.blockedUserIds || []);
    if (blocked.size === 0) return;
    updatePosts((list) => list.filter((p) => !blocked.has(p.author.id)));
    setFriends((list) => list.filter((f) => !blocked.has(f.id)));
    setConversations((list) => list.filter((c) => c.isGroup || !c.participants.some((p) => blocked.has(p.id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedKey]);

  // ---------- Nhận sự kiện realtime từ server (tên sự kiện khớp với server/routes/*) ----------

  useEffect(() => {
    if (!myId) return;
    const socket = getSocket();

    const handlers: Record<string, Parameters<typeof socket.on>[1]> = {
      'message:new': ({ conversationId, message }: { conversationId: string; message: Message }) => {
        // Chỉ cập nhật tin nhắn nếu hội thoại đó đang được mở (đã tải tin nhắn)
        setMessages((prev) => {
          if (!prev[conversationId]) return prev;
          const list = prev[conversationId];
          const exists = list.some((m) => m.id === message.id);
          return { ...prev, [conversationId]: exists ? list.map((m) => (m.id === message.id ? message : m)) : [...list, message] };
        });
        const fromOther = message.senderId !== myId;
        setConversations((list) =>
          list.map((c) =>
            c.id === conversationId
              ? { ...c, lastMessage: message, updatedAt: message.createdAt, unreadCount: c.unreadCount + (fromOther ? 1 : 0) }
              : c
          )
        );
        if (fromOther && !message.isRecalled) showToast(`${message.senderName}: ${message.content || 'Đã gửi một tệp đính kèm'}`, 'info');
      },
      'notification:new': (notif: NotificationItem) => {
        setNotifications((list) => [notif, ...list]);
        showToast(`${notif.actor.name} ${notif.content}`, 'info');
        if (notif.type === 'friend_accept') {
          setSentFriendRequests((list) => list.filter((r) => r.receiverId !== notif.actor.id));
          setFriends((list) => [notif.actor, ...list.filter((f) => f.id !== notif.actor.id)]);
        }
        // Thông báo không kèm lời mời → tải lại danh sách để có id lời mời (dùng cho nút Chấp nhận / Từ chối)
        if (notif.type === 'friend_request') {
          api.get<{ requests: FriendRequest[] }>('/friends/requests').then((d) => setFriendRequests(d.requests)).catch(() => {});
        }
      },
      'post:new': ({ post }: { post: Post }) => setPosts((list) => (list.some((p) => p.id === post.id) ? list : [post, ...list])),
      // Dữ liệu gửi chung cho nhiều người không biết mình đã lưu bài chưa → giữ isSaved cũ
      'post:update': ({ post }: { post: Post }) =>
        updatePosts((list) => list.map((p) => (p.id === post.id ? { ...post, isSaved: p.isSaved } : p))),
      'post:delete': ({ postId }: { postId: string }) => updatePosts((list) => list.filter((p) => p.id !== postId)),
      'comment:new': ({ postId, comment }: { postId: string; comment: Comment }) => {
        setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] || []).filter((c) => c.id !== comment.id), comment] }));
        changeCommentsCount(postId, 1);
      },
      'comment:delete': ({ postId, commentId }: { postId: string; commentId: string }) => {
        setComments((prev) => ({ ...prev, [postId]: (prev[postId] || []).filter((c) => c.id !== commentId) }));
        changeCommentsCount(postId, -1);
      },
      'story:new': ({ story }: { story: Story }) => setStories((list) => [story, ...list.filter((s) => s.id !== story.id)]),
      'story:delete': ({ storyId }: { storyId: string }) => setStories((list) => list.filter((s) => s.id !== storyId)),
      'friend-request:rejected': ({ requestId }: { requestId: string }) => setSentFriendRequests((list) => list.filter((r) => r.id !== requestId)),
      'friend-request:cancelled': ({ requestId }: { requestId: string }) => setFriendRequests((list) => list.filter((r) => r.id !== requestId)),
      'friend:removed': ({ userId }: { userId: string }) => setFriends((list) => list.filter((f) => f.id !== userId)),
    };

    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
    // Dọn dẹp khi đăng xuất, để không xử lý một sự kiện nhiều lần
    return () => Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  // ---------- Các hàm thao tác cho component gọi ----------

  return {
    toast,
    showToast,

    // ===== Bài viết =====
    posts,
    memoryPosts,
    hasMorePosts,
    isLoadingMorePosts,

    /** Cuộn vô hạn: tải trang bài viết tiếp theo (bỏ qua số bài đã có). */
    loadMorePosts: async () => {
      if (isLoadingMorePosts || !hasMorePosts) return;
      setIsLoadingMorePosts(true);
      const d = await api.get<{ posts: Post[] }>(`/posts?limit=${POSTS_PAGE}&skip=${posts.length}`).catch(() => null);
      if (d) {
        setPosts((list) => [...list, ...d.posts]);
        setHasMorePosts(d.posts.length === POSTS_PAGE);
      }
      setIsLoadingMorePosts(false);
    },

    loadMemoryPosts: () => api.get<{ posts: Post[] }>('/posts/memories').then((d) => setMemoryPosts(d.posts)).catch(() => {}),

    /** Lấy một bài (khi mở từ thông báo mà bài chưa có trong bảng tin). */
    fetchPostById: async (postId: string) => {
      const d = await api.get<{ post: Post }>(`/posts/${postId}`).catch(() => null);
      if (d) setPosts((list) => [d.post, ...list.filter((p) => p.id !== postId)]);
      return d?.post ?? null;
    },

    createPost: (data: { content: string; images?: string[]; video?: string; privacy: Privacy; feeling?: string; wallOwner?: User; taggedUserIds?: string[] }) =>
      attempt(async () => {
        const { wallOwner, ...fields } = data;
        const { post } = await api.post<{ post: Post }>('/posts', { ...fields, wallOwnerId: wallOwner?.id });
        setPosts((list) => [post, ...list]);
        showToast(wallOwner ? `Đã đăng bài lên tường của ${wallOwner.name}!` : 'Đã đăng bài viết thành công!');
      }, 'Không thể đăng bài viết.'),

    updatePost: (postId: string, data: { content: string; privacy: Privacy; feeling?: string; images?: string[] }) =>
      attempt(async () => {
        replacePost((await api.patch<{ post: Post }>(`/posts/${postId}`, data)).post);
        showToast('Đã cập nhật bài viết!');
      }, 'Không thể cập nhật bài viết.'),

    deletePost: (postId: string) =>
      attempt(async () => {
        await api.delete(`/posts/${postId}`);
        updatePosts((list) => list.filter((p) => p.id !== postId));
        showToast('Đã xóa bài viết!', 'info');
      }, 'Không thể xóa bài viết.'),

    /** Server tự quyết định thêm / đổi / bỏ cảm xúc rồi trả bài viết mới. */
    toggleReaction: (postId: string, type: ReactionType) =>
      attempt(async () => replacePost((await api.post<{ post: Post }>(`/posts/${postId}/react`, { type })).post), 'Không thể thả cảm xúc.'),

    toggleSavePost: (postId: string) =>
      attempt(async () => {
        const { post } = await api.post<{ post: Post }>(`/posts/${postId}/save`);
        replacePost(post);
        showToast(post.isSaved ? 'Đã lưu bài viết' : 'Đã bỏ lưu bài viết', 'info');
      }, 'Không thể lưu bài viết.'),

    togglePinPost: (postId: string) =>
      attempt(async () => {
        const { post } = await api.post<{ post: Post }>(`/posts/${postId}/pin`);
        replacePost(post);
        showToast(post.pinned ? 'Đã ghim bài viết' : 'Đã bỏ ghim bài viết', 'info');
      }, 'Không thể ghim bài viết.'),

    sharePost: (postId: string) =>
      attempt(async () => {
        const { post } = await api.post<{ post: Post }>(`/posts/${postId}/share`, {});
        setPosts((list) => [post, ...list.map((p) => (p.id === postId ? { ...p, sharesCount: p.sharesCount + 1 } : p))]);
        showToast('Đã chia sẻ bài viết lên trang cá nhân của bạn!');
      }, 'Không thể chia sẻ bài viết.'),

    // ===== Bình luận =====
    comments,

    /** Tải bình luận của một bài (chỉ tải 1 lần; bình luận mới sau đó đến qua realtime). */
    fetchComments: async (postId: string) => {
      if (comments[postId]) return;
      const d = await api.get<{ comments: Comment[] }>(`/comments?postId=${postId}`).catch(() => null);
      if (d) setComments((prev) => ({ ...prev, [postId]: d.comments }));
    },

    /** parentId có giá trị = trả lời một bình luận khác. */
    addComment: (postId: string, data: { content: string; image?: string; parentId?: string; taggedUserIds?: string[] }) =>
      attempt(async () => {
        const { comment } = await api.post<{ comment: Comment }>('/comments', { postId, ...data });
        setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), comment] }));
        changeCommentsCount(postId, 1);
      }, 'Không thể gửi bình luận.'),

    deleteComment: (postId: string, commentId: string) =>
      attempt(async () => {
        await api.delete(`/comments/${commentId}`);
        setComments((prev) => ({ ...prev, [postId]: prev[postId].filter((c) => c.id !== commentId) }));
        changeCommentsCount(postId, -1);
      }, 'Không thể xóa bình luận.'),

    toggleLikeComment: (postId: string, commentId: string) =>
      attempt(async () => {
        const { comment } = await api.post<{ comment: Comment }>(`/comments/${commentId}/like`);
        setComments((prev) => ({ ...prev, [postId]: prev[postId].map((c) => (c.id === commentId ? comment : c)) }));
      }, 'Không thể thích bình luận.'),

    // ===== Story =====
    stories,

    createStory: (data: { type: 'image' | 'text'; mediaUrl?: string; textContent?: string; backgroundGradient?: string; privacy: 'public' | 'friends' }) =>
      attempt(async () => {
        const { story } = await api.post<{ story: Story }>('/stories', data);
        setStories((list) => [story, ...list]);
        showToast('Đã đăng Story mới!');
      }, 'Không thể đăng Story.'),

    viewStory: (storyId: string) =>
      api.post<{ story: Story }>(`/stories/${storyId}/view`).then((d) => setStories((list) => list.map((s) => (s.id === storyId ? d.story : s)))).catch(() => {}),

    deleteStory: (storyId: string) =>
      attempt(async () => {
        await api.delete(`/stories/${storyId}`);
        setStories((list) => list.filter((s) => s.id !== storyId));
        showToast('Đã xóa Story!', 'info');
      }, 'Không thể xóa Story.'),

    // ===== Bạn bè =====
    friends,
    friendRequests,
    sentFriendRequests,

    getUserFriends: (userId: string) => api.get<{ friends: User[] }>(`/friends/of/${userId}`).then((d) => d.friends).catch(() => [] as User[]),

    sendFriendRequest: (user: User) =>
      attempt(async () => {
        const { request } = await api.post<{ request: FriendRequest }>('/friends/requests', { targetUserId: user.id });
        setSentFriendRequests((list) => [request, ...list]);
        showToast(`Đã gửi lời mời kết bạn tới ${user.name}`);
      }, 'Không thể gửi lời mời kết bạn.'),

    acceptFriendRequest: (requestId: string) =>
      attempt(async () => {
        await api.post(`/friends/requests/${requestId}/accept`);
        const request = friendRequests.find((r) => r.id === requestId);
        setFriendRequests((list) => list.filter((r) => r.id !== requestId));
        if (request) setFriends((list) => [request.sender, ...list]);
        showToast('Đã chấp nhận lời mời kết bạn!');
      }, 'Không thể chấp nhận lời mời.'),

    rejectFriendRequest: (requestId: string) =>
      attempt(async () => {
        await api.post(`/friends/requests/${requestId}/reject`);
        setFriendRequests((list) => list.filter((r) => r.id !== requestId));
      }, 'Không thể từ chối lời mời.'),

    cancelFriendRequest: (requestId: string) =>
      attempt(async () => {
        await api.delete(`/friends/requests/${requestId}`);
        setSentFriendRequests((list) => list.filter((r) => r.id !== requestId));
      }, 'Không thể hủy lời mời.'),

    removeFriend: (friendId: string) =>
      attempt(async () => {
        await api.delete(`/friends/${friendId}`);
        setFriends((list) => list.filter((f) => f.id !== friendId));
        showToast('Đã hủy kết bạn', 'info');
      }, 'Không thể hủy kết bạn.'),

    // ===== Tin nhắn =====
    conversations,
    messages,

    /** Tải tin nhắn của hội thoại (server đồng thời đánh dấu đã đọc → số chưa đọc về 0). */
    loadMessages: async (conversationId: string) => {
      const d = await api.get<{ messages: Message[] }>(`/messages/conversations/${conversationId}/messages`).catch(() => null);
      if (!d) return;
      setMessages((prev) => ({ ...prev, [conversationId]: d.messages }));
      setConversations((list) => list.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)));
    },

    sendMessage: (conversationId: string, content: string, attachments?: Message['attachments']) =>
      attempt(async () => {
        const { message } = await api.post<{ message: Message }>(`/messages/conversations/${conversationId}/messages`, { content, attachments });
        upsertMessage(conversationId, message);
        setLastMessage(conversationId, message);
      }, 'Không thể gửi tin nhắn.'),

    sharePostToChat: (conversationId: string, postId: string) =>
      attempt(async () => {
        const { message } = await api.post<{ message: Message }>(`/messages/conversations/${conversationId}/share-post`, { postId });
        upsertMessage(conversationId, message);
        setLastMessage(conversationId, message);
        showToast('Đã gửi bài viết qua tin nhắn!');
      }, 'Không thể chia sẻ bài viết.'),

    /** Lấy chat 1-1 với một người (có sẵn thì dùng luôn, chưa có thì tạo); trả về id hội thoại. */
    getOrCreateConversation: async (user: User) => {
      const existing = conversations.find((c) => !c.isGroup && c.participants.some((p) => p.id === user.id));
      if (existing) return existing.id;
      const { conversation } = await api.post<{ conversation: Conversation }>('/messages/conversations', { participantId: user.id });
      setConversations((list) => [conversation, ...list]);
      return conversation.id;
    },

    createGroupChat: async (members: User[], name: string) => {
      const { conversation } = await api.post<{ conversation: Conversation }>('/messages/conversations', { participantIds: members.map((m) => m.id), name });
      setConversations((list) => [conversation, ...list]);
      return conversation.id;
    },

    /** Đặt biệt danh (chuỗi rỗng = xoá); server trả thêm tin nhắn hệ thống "A đã đặt biệt danh...". */
    setNickname: (conversationId: string, userId: string, nickname: string) =>
      attempt(async () => {
        const d = await api.patch<{ conversation: Conversation; systemMessage: Message }>(`/messages/conversations/${conversationId}/nickname`, { userId, nickname });
        setConversations((list) => list.map((c) => (c.id === conversationId ? d.conversation : c)));
        upsertMessage(conversationId, d.systemMessage);
      }, 'Không thể cập nhật biệt danh.'),

    /** Thu hồi: server trả về bản tin nhắn đã thu hồi (không xoá hẳn). */
    recallMessage: (conversationId: string, messageId: string) =>
      attempt(async () => {
        const { message } = await api.delete<{ message: Message }>(`/messages/conversations/${conversationId}/messages/${messageId}`);
        upsertMessage(conversationId, message);
      }, 'Không thể thu hồi tin nhắn.'),

    reactToMessage: (conversationId: string, messageId: string, emoji: string) =>
      attempt(async () => {
        const { message } = await api.post<{ message: Message }>(`/messages/conversations/${conversationId}/messages/${messageId}/react`, { emoji });
        upsertMessage(conversationId, message);
      }, 'Không thể thả cảm xúc.'),

    // ===== Thông báo =====
    notifications,
    hasMoreNotifications,

    loadMoreNotifications: async () => {
      const d = await api.get<{ notifications: NotificationItem[] }>(`/notifications?limit=${NOTIFS_PAGE}&skip=${notifications.length}`).catch(() => null);
      if (!d) return;
      setNotifications((list) => [...list, ...d.notifications]);
      setHasMoreNotifications(d.notifications.length === NOTIFS_PAGE);
    },

    /** Cập nhật giao diện ngay (không chờ server) cho mượt, rồi mới gọi API. */
    markNotificationAsRead: (id: string) => {
      setNotifications((list) => list.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      api.patch(`/notifications/${id}/read`).catch(() => {});
    },

    markAllNotificationsAsRead: () => {
      setNotifications((list) => list.map((n) => ({ ...n, isRead: true })));
      api.patch('/notifications/read-all').catch(() => {});
    },
  };
}

const SocialContext = createContext<ReturnType<typeof useSocialState> | null>(null);

export const SocialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SocialContext.Provider value={useSocialState()}>{children}</SocialContext.Provider>
);

// eslint-disable-next-line react-refresh/only-export-components
export const useSocial = () => useContext(SocialContext)!;

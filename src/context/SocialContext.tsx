import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Post, Comment, Story, Conversation, Message, FriendRequest, NotificationItem, ReactionType, User, Privacy } from '../types';
import { useAuth } from './AuthContext';
import { api, ApiError } from '../utils/api';
import { getSocket } from '../utils/socket';
import { notificationPlain } from '../utils/notificationText';

// "KHO DỮ LIỆU" CHÍNH CỦA FRONTEND: giữ bài viết, bình luận, story, bạn bè, tin nhắn, thông báo trong state
// và cung cấp các hàm thao tác (đăng bài, bình luận, kết bạn, nhắn tin...). Mỗi hàm: gọi API → cập nhật state.
// Ngoài ra lắng nghe Socket.io để cập nhật ngay khi người khác thay đổi dữ liệu (realtime).
// Component nào cần thì gọi: const { posts, createPost } = useSocial();

const POSTS_PAGE = 20;
const NOTIFS_PAGE = 30;

type ToastType = 'success' | 'error' | 'info';

function useSocialState() {
  const { currentUser, logout, refreshUser } = useAuth();
  const myId = currentUser?.id;

  const [posts, setPosts] = useState<Post[]>([]);
  const [memoryPosts, setMemoryPosts] = useState<Post[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false);
  const [comments, setComments] = useState<Record<string, Comment[]>>({}); // { postId: [bình luận] }
  const [stories, setStories] = useState<Story[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [following, setFollowing] = useState<User[]>([]); // người mình theo dõi (không cần là bạn bè)
  const [typing, setTyping] = useState<Record<string, string[]>>({}); // { conversationId: [id người đang gõ] }
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [postsStatus, setPostsStatus] = useState<'loading' | 'ready' | 'error'>('loading'); // trạng thái tải bảng tin lần đầu
  const [notificationsStatus, setNotificationsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [friendsStatus, setFriendsStatus] = useState<'loading' | 'ready' | 'error'>('loading'); // bạn bè + lời mời
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]); // lời mời gửi đến mình
  const [sentFriendRequests, setSentFriendRequests] = useState<FriendRequest[]>([]); // lời mời mình đã gửi
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({}); // { conversationId: [tin nhắn] }
  const conversationsRef = useRef(conversations); // bản mới nhất của danh sách hội thoại, để trình nghe socket không đọc phải bản cũ
  conversationsRef.current = conversations;
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType; action?: { label: string; onClick: () => void }; notification?: NotificationItem } | null>(null);
  const [tagPosts, setTagPosts] = useState<Post[]>([]); // bài của trang #hashtag đang mở

  // ---------- Hàm tiện ích dùng chung ----------

  /** action = nút trên toast (vd "Hoàn tác"); notification = toast của một thông báo, bấm vào là mở đúng nội dung. Toast bấm được hiện lâu hơn để kịp bấm. */
  const showToast = (message: string, type: ToastType = 'success', action?: { label: string; onClick: () => void }, notification?: NotificationItem) => {
    setToast({ message, type, action, notification });
    setTimeout(() => setToast(null), action || notification ? 6000 : 3500);
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
    setTagPosts(change);
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

  /** Tải trang bảng tin đầu tiên (cũng dùng cho nút "Thử lại" khi lỗi). */
  const loadFirstPosts = () => {
    setPostsStatus('loading');
    return api
      .get<{ posts: Post[] }>(`/posts?limit=${POSTS_PAGE}`)
      .then((d) => {
        setPosts(d.posts);
        setHasMorePosts(d.posts.length === POSTS_PAGE);
        setPostsStatus('ready');
      })
      .catch(() => setPostsStatus('error'));
  };

  /** Tải trang thông báo đầu tiên (cũng dùng cho nút "Thử lại"). */
  const loadFirstNotifications = () => {
    setNotificationsStatus('loading');
    return api
      .get<{ notifications: NotificationItem[] }>(`/notifications?limit=${NOTIFS_PAGE}`)
      .then((d) => {
        setNotifications(d.notifications);
        setHasMoreNotifications(d.notifications.length === NOTIFS_PAGE);
        setNotificationsStatus('ready');
      })
      .catch(() => setNotificationsStatus('error'));
  };

  /** Tải bạn bè + lời mời nhận được + lời mời đã gửi (cũng dùng cho nút "Thử lại"). */
  const loadFriendsData = () => {
    setFriendsStatus('loading');
    return Promise.all([api.get<{ friends: User[] }>('/friends'), api.get<{ requests: FriendRequest[] }>('/friends/requests'), api.get<{ requests: FriendRequest[] }>('/friends/requests/sent')])
      .then(([f, received, sent]) => {
        setFriends(f.friends);
        setFriendRequests(received.requests);
        setSentFriendRequests(sent.requests);
        setFriendsStatus('ready');
      })
      .catch(() => setFriendsStatus('error'));
  };

  // ---------- Tải dữ liệu ban đầu mỗi khi người đăng nhập thay đổi ----------

  useEffect(() => {
    if (!myId) {
      // Đăng xuất → xoá sạch dữ liệu của người cũ
      [setPosts, setMemoryPosts, setStories, setFriends, setFollowing, setFriendRequests, setSentFriendRequests, setConversations, setNotifications].forEach((set) => set([]));
      setComments({});
      setMessages({});
      setPostsStatus('loading');
      setNotificationsStatus('loading');
      setFriendsStatus('loading');
      return;
    }
    // Mỗi API tải riêng; một cái lỗi thì các cái khác vẫn hiển thị được
    const load = <T,>(path: string, onData: (data: T) => void) => api.get<T>(path).then(onData).catch(() => {});
    loadFirstPosts();
    load<{ users: User[] }>('/users/me/following', (d) => setFollowing(d.users));
    load<{ stories: Story[] }>('/stories', (d) => setStories(d.stories));
    loadFriendsData();
    load<{ conversations: Conversation[] }>('/messages/conversations', (d) => setConversations(d.conversations));
    loadFirstNotifications();
  }, [myId]);

  // Vừa chặn ai đó → ẩn ngay bài viết, bạn bè, chat 1-1 của người đó
  const blockedKey = (currentUser?.blockedUserIds || []).join(',');
  useEffect(() => {
    const blocked = new Set(currentUser?.blockedUserIds || []);
    if (blocked.size === 0) return;
    updatePosts((list) => list.filter((p) => !blocked.has(p.author.id)));
    setFriends((list) => list.filter((f) => !blocked.has(f.id)));
    setFollowing((list) => list.filter((f) => !blocked.has(f.id)));
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
        if (fromOther && message.kind !== 'system') {
          socket.emit('message:delivered', { conversationId, messageId: message.id }); // báo cho người gửi: tin đã về tới máy mình
          setTyping((prev) => ({ ...prev, [conversationId]: (prev[conversationId] || []).filter((u) => u !== message.senderId) })); // họ gửi xong thì thôi "đang gõ"
        }
        // Người chưa từng nhắn (vd người lạ chưa kết bạn) gửi tin đầu tiên → hội thoại chưa có trong danh sách → tải lại danh sách
        if (!conversationsRef.current.some((c) => c.id === conversationId)) {
          api.get<{ conversations: Conversation[] }>('/messages/conversations').then((d) => setConversations(d.conversations)).catch(() => {});
        }
        setConversations((list) =>
          list.map((c) =>
            c.id === conversationId
              ? { ...c, lastMessage: message, updatedAt: message.createdAt, unreadCount: c.unreadCount + (fromOther ? 1 : 0) }
              : c
          )
        );
        if (fromOther && !message.isRecalled) showToast(`${message.senderName}: ${message.content || 'Đã gửi một tệp đính kèm'}`, 'info');
      },
      // Người khác bắt đầu / ngừng gõ trong hội thoại (tự tắt sau 5 giây nếu không có tín hiệu mới)
      typing: ({ conversationId, userId, isTyping }: { conversationId: string; userId: string; isTyping: boolean }) => {
        const key = `${conversationId}:${userId}`;
        clearTimeout(typingTimers.current[key]);
        const remove = () => setTyping((prev) => ({ ...prev, [conversationId]: (prev[conversationId] || []).filter((u) => u !== userId) }));
        setTyping((prev) => ({ ...prev, [conversationId]: [...(prev[conversationId] || []).filter((u) => u !== userId), ...(isTyping ? [userId] : [])] }));
        if (isTyping) typingTimers.current[key] = setTimeout(remove, 5000);
      },
      // Ai đó online / offline → cập nhật trạng thái ở danh sách bạn bè, đang theo dõi và các hội thoại
      'presence:update': ({ userId, isOnline, lastActive }: { userId: string; isOnline: boolean; lastActive?: string }) => {
        const patch = (u: User) => (u.id === userId ? { ...u, isOnline, lastActive } : u);
        setFriends((list) => list.map(patch));
        setFollowing((list) => list.map(patch));
        setConversations((list) => list.map((c) => ({ ...c, participants: c.participants.map(patch) })));
      },
      // Người nhận báo đã nhận tin của mình
      'message:delivered': ({ conversationId, messageId, userId }: { conversationId: string; messageId: string; userId: string }) =>
        setMessages((prev) =>
          prev[conversationId] ? { ...prev, [conversationId]: prev[conversationId].map((m) => (m.id === messageId ? { ...m, deliveredTo: [...new Set([...(m.deliveredTo || []), userId])] } : m)) } : prev
        ),
      'notification:new': (notif: NotificationItem) => {
        setNotifications((list) => [notif, ...list]);
        showToast(notificationPlain(notif), 'info', undefined, notif);
        if (notif.type === 'friend_accept') {
          setSentFriendRequests((list) => list.filter((r) => r.receiverId !== notif.actor.id));
          setFriends((list) => [notif.actor, ...list.filter((f) => f.id !== notif.actor.id)]);
          setFollowing((list) => [notif.actor, ...list.filter((f) => f.id !== notif.actor.id)]); // kết bạn = tự động theo dõi nhau
        }
        // Thông báo không kèm lời mời → tải lại danh sách để có id lời mời (dùng cho nút Chấp nhận / Từ chối)
        if (notif.type === 'friend_request') {
          api.get<{ requests: FriendRequest[] }>('/friends/requests').then((d) => setFriendRequests(d.requests)).catch(() => {});
        }
      },
      // Bài mới thì thêm lên đầu; bài đã có (vd bản "chờ duyệt" vừa được duyệt) thì thay bằng bản mới, giữ trạng thái "đã lưu" của mình
      'post:new': ({ post }: { post: Post }) => setPosts((list) => (list.some((p) => p.id === post.id) ? list.map((p) => (p.id === post.id ? { ...post, isSaved: p.isSaved } : p)) : [post, ...list])),
      // Dữ liệu gửi chung cho nhiều người không biết mình đã lưu bài chưa → giữ isSaved cũ
      'post:update': ({ post }: { post: Post }) =>
        updatePosts((list) => list.map((p) => (p.id === post.id ? { ...post, isSaved: p.isSaved } : p))),
      'post:delete': ({ postId }: { postId: string }) => updatePosts((list) => list.filter((p) => p.id !== postId)),
      'comment:new': ({ postId, comment }: { postId: string; comment: Comment }) => {
        setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] || []).filter((c) => c.id !== comment.id), comment] }));
        changeCommentsCount(postId, 1);
      },
      // Bình luận được sửa → thay nội dung mới (chỉ khi mình đang có danh sách bình luận của bài đó)
      'comment:update': ({ postId, comment }: { postId: string; comment: Comment }) =>
        setComments((prev) => (prev[postId] ? { ...prev, [postId]: prev[postId].map((c) => (c.id === comment.id ? comment : c)) } : prev)),
      'comment:delete': ({ postId, commentId }: { postId: string; commentId: string }) => {
        setComments((prev) => ({ ...prev, [postId]: (prev[postId] || []).filter((c) => c.id !== commentId) }));
        changeCommentsCount(postId, -1);
      },
      'story:new': ({ story }: { story: Story }) => setStories((list) => [story, ...list.filter((s) => s.id !== story.id)]),
      'story:delete': ({ storyId }: { storyId: string }) => setStories((list) => list.filter((s) => s.id !== storyId)),
      'friend-request:rejected': ({ requestId }: { requestId: string }) => setSentFriendRequests((list) => list.filter((r) => r.id !== requestId)),
      'friend-request:cancelled': ({ requestId }: { requestId: string }) => setFriendRequests((list) => list.filter((r) => r.id !== requestId)),
      // Người kia đổi biệt danh / màu chủ đề → cập nhật ngay, giữ nguyên tin cuối và số chưa đọc của mình
      'conversation:update': ({ conversation }: { conversation: Conversation }) =>
        setConversations((list) => list.map((c) => (c.id === conversation.id ? { ...c, nicknames: conversation.nicknames, themeColor: conversation.themeColor, name: conversation.name, avatar: conversation.avatar } : c))),
      'friend:removed': ({ userId }: { userId: string }) => setFriends((list) => list.filter((f) => f.id !== userId)),
      // Quản trị hệ thống khoá tài khoản này → đăng xuất ngay (trang đăng nhập sẽ hiện lý do khi đăng nhập lại)
      'account:banned': () => logout(),
      // Vừa được cấp / thu hồi quyền quản trị → tải lại thông tin để menu và trang /admin khớp ngay
      'account:role': () => void refreshUser(),
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
    dismissToast: () => setToast(null),

    // ===== Bài viết =====
    posts,
    memoryPosts,
    tagPosts,
    postsStatus,
    reloadPosts: loadFirstPosts,
    hasMorePosts,
    isLoadingMorePosts,

    /** Cuộn vô hạn: tải trang bài viết tiếp theo, bỏ qua số bài bảng tin đã có (không đếm bài nhóm / reel cùng nằm trong danh sách vì server không tính chúng vào bảng tin). */
    loadMorePosts: async () => {
      if (isLoadingMorePosts || !hasMorePosts) return;
      setIsLoadingMorePosts(true);
      const feedCount = posts.filter((p) => !p.groupId && !p.kind).length;
      const d = await api.get<{ posts: Post[] }>(`/posts?limit=${POSTS_PAGE}&skip=${feedCount}`).catch(() => null);
      if (d) {
        setPosts((list) => [...list, ...d.posts.filter((p) => !list.some((x) => x.id === p.id))]);
        setHasMorePosts(d.posts.length === POSTS_PAGE);
      }
      setIsLoadingMorePosts(false);
    },

    /** Tải các bài có #hashtag (mới nhất trước) cho trang /hashtag/:tag. */
    loadTagPosts: (tag: string) =>
      api.get<{ posts: Post[] }>(`/posts?tag=${encodeURIComponent(tag)}&limit=50`).then((d) => setTagPosts(d.posts)).catch(() => setTagPosts([])),

    loadMemoryPosts: () => api.get<{ posts: Post[] }>('/posts/memories').then((d) => setMemoryPosts(d.posts)).catch(() => {}),

    /** Lấy một bài (khi mở từ thông báo mà bài chưa có trong bảng tin). */
    fetchPostById: async (postId: string) => {
      const d = await api.get<{ post: Post }>(`/posts/${postId}`).catch(() => null);
      if (d) setPosts((list) => [d.post, ...list.filter((p) => p.id !== postId)]);
      return d?.post ?? null;
    },

    createPost: (data: { content: string; images?: string[]; video?: string; privacy: Privacy; feeling?: string; location?: string; wallOwner?: User; taggedUserIds?: string[] }) =>
      attempt(async () => {
        const { wallOwner, ...fields } = data;
        const { post } = await api.post<{ post: Post }>('/posts', { ...fields, wallOwnerId: wallOwner?.id });
        setPosts((list) => [post, ...list]);
        showToast(wallOwner ? `Đã đăng bài lên tường của ${wallOwner.name}!` : 'Đã đăng bài viết thành công!');
      }, 'Không thể đăng bài viết.'),

    updatePost: (postId: string, data: { content: string; privacy: Privacy; feeling?: string; location?: string; images?: string[] }) =>
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

    /** message = lời bình của người chia sẻ (tuỳ chọn). */
    sharePost: (postId: string, message?: string) =>
      attempt(async () => {
        const { post } = await api.post<{ post: Post }>(`/posts/${postId}/share`, message ? { message } : {});
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

    /** Thả / đổi / bỏ cảm xúc bình luận (cùng loại với cảm xúc hiện tại thì bỏ). */
    reactToComment: (postId: string, commentId: string, type: ReactionType) =>
      attempt(async () => {
        const { comment } = await api.post<{ comment: Comment }>(`/comments/${commentId}/react`, { type });
        setComments((prev) => ({ ...prev, [postId]: prev[postId].map((c) => (c.id === commentId ? comment : c)) }));
      }, 'Không thể thả cảm xúc.'),

    /** Sửa nội dung bình luận của mình. Trả về true nếu thành công. */
    editComment: (postId: string, commentId: string, content: string) =>
      attempt(async () => {
        const { comment } = await api.patch<{ comment: Comment }>(`/comments/${commentId}`, { content });
        setComments((prev) => ({ ...prev, [postId]: prev[postId].map((c) => (c.id === commentId ? comment : c)) }));
        return true;
      }, 'Không thể sửa bình luận.'),

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

    /** Thả cảm xúc nhanh lên story của người khác (cùng emoji thì bỏ, khác emoji thì đổi). */
    reactToStory: (storyId: string, emoji: string) =>
      attempt(async () => {
        const { story } = await api.post<{ story: Story }>(`/stories/${storyId}/react`, { emoji });
        setStories((list) => list.map((s) => (s.id === storyId ? story : s)));
        return story.reactions?.some((r) => r.userId === myId) ?? false; // true = vừa thả, false = vừa bỏ
      }, 'Không thể thả cảm xúc.'),

    deleteStory: (storyId: string) =>
      attempt(async () => {
        await api.delete(`/stories/${storyId}`);
        setStories((list) => list.filter((s) => s.id !== storyId));
        showToast('Đã xóa Story!', 'info');
      }, 'Không thể xóa Story.'),

    // ===== Theo dõi =====
    following,

    /** Theo dõi một người; trả về số người theo dõi mới của họ (undefined nếu lỗi). */
    followUser: (user: User) =>
      attempt(async () => {
        const d = await api.post<{ followersCount: number }>(`/users/${user.id}/follow`);
        setFollowing((list) => [user, ...list.filter((f) => f.id !== user.id)]);
        showToast(`Đã theo dõi ${user.name}`);
        return d.followersCount;
      }, 'Không thể theo dõi.'),

    unfollowUser: (user: User) =>
      attempt(async () => {
        const d = await api.delete<{ followersCount: number }>(`/users/${user.id}/follow`);
        setFollowing((list) => list.filter((f) => f.id !== user.id));
        showToast(`Đã bỏ theo dõi ${user.name}`, 'info');
        return d.followersCount;
      }, 'Không thể bỏ theo dõi.'),

    // ===== Bạn bè =====
    friendsStatus,
    reloadFriends: loadFriendsData,
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
        if (request) {
          setFriends((list) => [request.sender, ...list]);
          setFollowing((list) => [request.sender, ...list.filter((f) => f.id !== request.sender.id)]); // kết bạn = tự động theo dõi nhau
        }
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
    typingIn: typing,

    /** Báo cho người khác trong hội thoại biết mình đang gõ / ngừng gõ. */
    sendTyping: (conversationId: string, isTyping: boolean) => void getSocket().emit('typing', { conversationId, isTyping }),

    /** "Xóa với tôi": ẩn tin nhắn phía mình, người khác vẫn thấy. */
    deleteMessageForMe: (conversationId: string, messageId: string) =>
      attempt(async () => {
        await api.post(`/messages/conversations/${conversationId}/messages/${messageId}/delete-for-me`);
        const rest = (messages[conversationId] || []).filter((m) => m.id !== messageId);
        setMessages((prev) => ({ ...prev, [conversationId]: rest }));
        setConversations((list) => list.map((c) => (c.id === conversationId && c.lastMessage?.id === messageId ? { ...c, lastMessage: rest.at(-1) } : c)));
      }, 'Không thể xóa tin nhắn.'),

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

    // ===== Trang (fanpage) =====

    /** Tải bài viết của một trang (công khai) rồi gộp vào danh sách bài. */
    loadPagePosts: async (pageId: string) => {
      const d = await api.get<{ posts: Post[] }>(`/pages/${pageId}/posts?limit=50`).catch(() => null);
      if (!d) return false;
      setPosts((list) => [...d.posts, ...list.filter((p) => !d.posts.some((n) => n.id === p.id))]);
      return true;
    },

    /** Đăng bài với tư cách trang (chủ trang / quản trị viên). */
    createPagePost: (pageId: string, data: { content: string; images?: string[]; video?: string }) =>
      attempt(async () => {
        const { post } = await api.post<{ post: Post }>(`/pages/${pageId}/posts`, data);
        setPosts((list) => [post, ...list.filter((p) => p.id !== post.id)]);
        showToast('Đã đăng bài lên trang!');
        return post;
      }, 'Không thể đăng bài lên trang.'),

    /** Quản trị viên xoá một bài của trang. */
    deletePagePost: (pageId: string, postId: string) =>
      attempt(async () => {
        await api.delete(`/pages/${pageId}/posts/${postId}`);
        updatePosts((list) => list.filter((p) => p.id !== postId));
        showToast('Đã xoá bài viết khỏi trang.', 'info');
      }, 'Không thể xoá bài viết khỏi trang.'),

    // ===== Reels (video ngắn) =====

    /** Tải một trang reel (đã xếp theo độ phù hợp), gộp vào danh sách bài; trả về danh sách reel của trang đó (hoặc null nếu lỗi). */
    loadReels: async (skip = 0, limit = 8) => {
      const d = await api.get<{ reels: Post[] }>(`/reels?limit=${limit}&skip=${skip}`).catch(() => null);
      if (!d) return null;
      setPosts((list) => [...d.reels.filter((r) => !list.some((p) => p.id === r.id)), ...list.map((p) => d.reels.find((r) => r.id === p.id) ?? p)]);
      return d.reels;
    },

    /** Lấy một reel theo id (mở thẳng từ kết quả tìm kiếm). */
    fetchReel: async (reelId: string) => {
      const d = await api.get<{ reel: Post }>(`/reels/${reelId}`).catch(() => null);
      if (d) setPosts((list) => [d.reel, ...list.filter((p) => p.id !== reelId)]);
      return d?.reel ?? null;
    },

    /** Đăng reel mới (bắt buộc có video). */
    createReel: (data: { video: string; caption: string; privacy: 'public' | 'friends' }) =>
      attempt(async () => {
        const { reel } = await api.post<{ reel: Post }>('/reels', data);
        setPosts((list) => [reel, ...list.filter((p) => p.id !== reel.id)]);
        showToast('Đã đăng Reel!');
        return reel;
      }, 'Không thể đăng Reel.'),

    /** Ghi nhận một lượt xem reel (lỗi thì bỏ qua, không làm phiền người xem). */
    viewReel: (reelId: string) =>
      api.post<{ viewsCount: number }>(`/reels/${reelId}/view`).then((d) => updatePosts((list) => list.map((p) => (p.id === reelId ? { ...p, viewsCount: d.viewsCount } : p)))).catch(() => {}),

    // ===== Bài viết trong nhóm (hiện ở trang nhóm; không lên bảng tin chung) =====

    /** Tải bài của nhóm (đã duyệt, hoặc ?status=pending) rồi gộp vào danh sách bài. */
    loadGroupPosts: async (groupId: string, status: 'approved' | 'pending' = 'approved') => {
      const d = await api.get<{ posts: Post[] }>(`/groups/${groupId}/posts?status=${status}&limit=50`).catch(() => null);
      if (!d) return false;
      setPosts((list) => [...d.posts, ...list.filter((p) => !d.posts.some((n) => n.id === p.id))]);
      return true;
    },

    /** Đăng bài vào nhóm. Nhóm bật duyệt bài thì bài ở trạng thái chờ duyệt. */
    createGroupPost: (groupId: string, data: { content: string; images?: string[]; video?: string; feeling?: string; location?: string }) =>
      attempt(async () => {
        const { post } = await api.post<{ post: Post }>(`/groups/${groupId}/posts`, data);
        setPosts((list) => [post, ...list.filter((p) => p.id !== post.id)]);
        showToast(post.groupStatus === 'pending' ? 'Bài viết đã được gửi và đang chờ quản trị viên duyệt.' : 'Đã đăng bài vào nhóm!');
        return post;
      }, 'Không thể đăng bài vào nhóm.'),

    /** Quản trị viên xoá bài của người khác khỏi nhóm. */
    deleteGroupPost: (groupId: string, postId: string) =>
      attempt(async () => {
        await api.delete(`/groups/${groupId}/posts/${postId}`);
        updatePosts((list) => list.filter((p) => p.id !== postId));
        showToast('Đã xoá bài viết khỏi nhóm.', 'info');
      }, 'Không thể xoá bài viết khỏi nhóm.'),

    /** Quản trị viên duyệt / từ chối bài chờ duyệt. */
    moderateGroupPost: (groupId: string, postId: string, action: 'approve' | 'reject') =>
      attempt(async () => {
        const res = await api.post<{ post?: Post }>(`/groups/${groupId}/posts/${postId}/${action}`);
        if (action === 'approve' && res.post) replacePost(res.post);
        else updatePosts((list) => list.filter((p) => p.id !== postId));
        showToast(action === 'approve' ? 'Đã duyệt bài viết.' : 'Đã từ chối bài viết.', action === 'approve' ? 'success' : 'info');
        return true;
      }, 'Không thể xử lý bài viết.'),

    /** Báo cáo một bài trong nhóm cho quản trị viên. */
    reportGroupPost: (groupId: string, postId: string, reason: string) =>
      attempt(async () => {
        await api.post(`/groups/${groupId}/posts/${postId}/report`, { reason });
        showToast('Đã gửi báo cáo cho quản trị viên nhóm. Cảm ơn bạn!');
        return true;
      }, 'Không thể gửi báo cáo.'),

    /** Chủ bài tắt / bật bình luận. */
    toggleComments: (postId: string) =>
      attempt(async () => {
        const { post } = await api.post<{ post: Post }>(`/posts/${postId}/toggle-comments`);
        replacePost(post);
        showToast(post.commentsDisabled ? 'Đã tắt bình luận cho bài viết' : 'Đã bật lại bình luận', 'info');
      }, 'Không thể thay đổi cài đặt bình luận.'),

    /** Ẩn bài khỏi bảng tin của mình; toast có nút "Hoàn tác" đưa bài trở lại đúng vị trí cũ. */
    hidePost: (postId: string) =>
      attempt(async () => {
        const index = posts.findIndex((p) => p.id === postId);
        const hidden = posts[index];
        await api.post(`/posts/${postId}/hide`);
        updatePosts((list) => list.filter((p) => p.id !== postId));
        showToast('Đã ẩn bài viết. Bạn sẽ ít thấy những bài như vậy hơn.', 'info', {
          label: 'Hoàn tác',
          onClick: async () => {
            await api.delete(`/posts/${postId}/hide`).catch(() => {});
            if (hidden) setPosts((list) => [...list.slice(0, index), hidden, ...list.slice(index)]);
            setToast(null);
          },
        });
      }, 'Không thể ẩn bài viết.'),

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

    /** Đổi màu chủ đề của cuộc trò chuyện (mọi thành viên cùng thấy). */
    setChatTheme: (conversationId: string, color: string) =>
      attempt(async () => {
        const d = await api.patch<{ conversation: Conversation; systemMessage: Message }>(`/messages/conversations/${conversationId}/theme`, { color });
        setConversations((list) => list.map((c) => (c.id === conversationId ? { ...c, themeColor: d.conversation.themeColor } : c)));
        upsertMessage(conversationId, d.systemMessage);
      }, 'Không thể đổi màu chủ đề.'),

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
    notificationsStatus,
    reloadNotifications: loadFirstNotifications,
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

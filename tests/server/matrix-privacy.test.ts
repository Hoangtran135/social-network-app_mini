import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, createPost, TestUser } from './helpers';

// MA TRẬN QUYỀN RIÊNG TƯ: mọi tổ hợp (quyền riêng tư của nội dung) × (quan hệ giữa người xem và tác giả) × (thao tác).
// Luật: tác giả luôn thấy; bị chặn (bất kỳ chiều nào) thì không thấy gì; "bạn bè" chỉ bạn thấy; "chỉ mình tôi" chỉ tác giả thấy; "công khai" ai cũng thấy.

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const PRIVACIES = ['public', 'friends', 'only_me'] as const;
const RELATIONS = ['author', 'friend', 'stranger', 'blocked-by-author', 'blocked-author'] as const;
type Privacy = (typeof PRIVACIES)[number];
type Relation = (typeof RELATIONS)[number];

const canSee = (rel: Relation, privacy: Privacy) => {
  if (rel === 'author') return true;
  if (rel === 'friend') return privacy !== 'only_me';
  if (rel === 'stranger') return privacy === 'public';
  return false; // bị chặn: ẩn tất cả, kể cả công khai
};

const viewers = {} as Record<Relation, TestUser>;
const posts = {} as Record<Privacy, { id: string; commentId: string }>;
const stories = {} as Record<'public' | 'friends', string>;

beforeAll(async () => {
  const author = await signUp(app, 'Author');
  viewers.author = author;
  viewers.friend = await signUp(app, 'Friend');
  viewers.stranger = await signUp(app, 'Stranger');
  viewers['blocked-by-author'] = await signUp(app, 'BlockedByAuthor');
  viewers['blocked-author'] = await signUp(app, 'BlockedAuthor');
  await befriend(app, author, viewers.friend);
  for (const privacy of PRIVACIES) {
    const post = await createPost(app, author, { privacy, content: `bài ${privacy}` });
    const comment = await as(app, author).post('/api/comments').send({ postId: post.id, content: 'bình luận gốc' });
    posts[privacy] = { id: post.id, commentId: comment.body.comment.id };
  }
  for (const privacy of ['public', 'friends'] as const) {
    stories[privacy] = (await as(app, author).post('/api/stories').send({ type: 'text', textContent: privacy, privacy })).body.story.id;
  }
  await as(app, author).post(`/api/users/${viewers['blocked-by-author'].id}/block`); // tác giả chặn người xem
  await as(app, viewers['blocked-author']).post(`/api/users/${author.id}/block`); // người xem chặn tác giả
});

type Op = { name: string; run: (viewer: TestUser, p: { id: string; commentId: string }) => Promise<number>; yes: number; no: number };
const OPS: Op[] = [
  { name: 'có trong bảng tin', run: async (v, p) => ((await as(app, v).get('/api/posts?limit=100')).body.posts.some((x: { id: string }) => x.id === p.id) ? 200 : 404), yes: 200, no: 404 },
  { name: 'xem chi tiết', run: async (v, p) => (await as(app, v).get(`/api/posts/${p.id}`)).status, yes: 200, no: 404 },
  { name: 'thả cảm xúc', run: async (v, p) => (await as(app, v).post(`/api/posts/${p.id}/react`).send({ type: 'like' })).status, yes: 200, no: 404 },
  { name: 'lưu bài', run: async (v, p) => (await as(app, v).post(`/api/posts/${p.id}/save`)).status, yes: 200, no: 404 },
  { name: 'chia sẻ', run: async (v, p) => (await as(app, v).post(`/api/posts/${p.id}/share`).send({})).status, yes: 200, no: 404 },
  { name: 'viết bình luận', run: async (v, p) => (await as(app, v).post('/api/comments').send({ postId: p.id, content: 'xin chào' })).status, yes: 200, no: 404 },
  { name: 'xem danh sách bình luận', run: async (v, p) => (await as(app, v).get(`/api/comments?postId=${p.id}`)).status, yes: 200, no: 403 },
  { name: 'thích bình luận', run: async (v, p) => (await as(app, v).post(`/api/comments/${p.commentId}/like`)).status, yes: 200, no: 403 },
];

describe('Ma trận quyền riêng tư của BÀI VIẾT (3 quyền × 5 quan hệ × 8 thao tác = 120)', () => {
  for (const privacy of PRIVACIES) {
    for (const rel of RELATIONS) {
      for (const op of OPS) {
        const allowed = canSee(rel, privacy);
        it(`bài "${privacy}" | ${rel} | ${op.name} → ${allowed ? 'được' : 'bị từ chối'}`, async () => {
          expect(await op.run(viewers[rel], posts[privacy])).toBe(allowed ? op.yes : op.no);
        });
      }
    }
  }
});

describe('Ma trận quyền riêng tư của STORY (2 quyền × 5 quan hệ × 2 thao tác = 20)', () => {
  for (const privacy of ['public', 'friends'] as const) {
    for (const rel of RELATIONS) {
      const allowed = canSee(rel, privacy);
      it(`story "${privacy}" | ${rel} | có trong danh sách → ${allowed}`, async () => {
        const list = (await as(app, viewers[rel]).get('/api/stories')).body.stories as { id: string }[];
        expect(list.some((s) => s.id === stories[privacy])).toBe(allowed);
      });
      it(`story "${privacy}" | ${rel} | đánh dấu đã xem → ${allowed ? 200 : 404}`, async () => {
        expect((await as(app, viewers[rel]).post(`/api/stories/${stories[privacy]}/view`)).status).toBe(allowed ? 200 : 404);
      });
    }
  }
});

describe('Ma trận đăng lên TƯỜNG (quan hệ giữa người đăng và chủ tường)', () => {
  const cases: [Relation, number][] = [
    ['author', 200], // tự đăng lên tường mình = bài thường
    ['friend', 200],
    ['stranger', 403],
    ['blocked-by-author', 403],
    ['blocked-author', 403],
  ];
  it.each(cases)('chủ tường có quan hệ "%s" với người đăng → %i', async (rel, status) => {
    const poster = viewers[rel];
    const wallOwner = viewers.author;
    // "author" đăng lên tường chính mình: dùng id của chính họ
    const target = rel === 'author' ? poster : wallOwner;
    const res = await as(app, poster).post('/api/posts').send({ content: 'chúc mừng', wallOwnerId: target.id });
    expect(res.status).toBe(status);
  });
});

describe('Ma trận quyền truy cập HỘI THOẠI (3 vai trò × 5 thao tác = 15)', () => {
  let a: TestUser, b: TestUser, outsider: TestUser;
  let conv: string;
  beforeAll(async () => {
    a = await signUp(app, 'ConvA');
    b = await signUp(app, 'ConvB');
    outsider = await signUp(app, 'ConvOut');
    conv = (await as(app, a).post('/api/messages/conversations').send({ participantId: b.id })).body.conversation.id;
  });
  const roles = ['sender', 'other-member', 'outsider'] as const;
  const ops = ['đọc tin nhắn', 'gửi tin', 'đặt biệt danh', 'thả cảm xúc', 'thu hồi tin của người gửi'] as const;
  const expected: Record<(typeof roles)[number], number[]> = {
    sender: [200, 200, 200, 200, 200],
    'other-member': [200, 200, 200, 200, 403], // không thu hồi được tin của người khác
    outsider: [403, 403, 403, 403, 403],
  };
  for (const role of roles) {
    ops.forEach((op, i) => {
      it(`${role} | ${op} → ${expected[role][i]}`, async () => {
        const user = role === 'sender' ? a : role === 'other-member' ? b : outsider;
        const firstMessage = (await as(app, a).post(`/api/messages/conversations/${conv}/messages`).send({ content: 'tin của a' })).body.message.id;
        const base = `/api/messages/conversations/${conv}`;
        const res = [
          () => as(app, user).get(`${base}/messages`),
          () => as(app, user).post(`${base}/messages`).send({ content: 'x' }),
          () => as(app, user).patch(`${base}/nickname`).send({ userId: b.id, nickname: 'biệt danh' }),
          () => as(app, user).post(`${base}/messages/${firstMessage}/react`).send({ emoji: '👍' }),
          () => as(app, user).delete(`${base}/messages/${firstMessage}`),
        ][i]();
        expect((await res).status).toBe(expected[role][i]);
      });
    });
  }
});

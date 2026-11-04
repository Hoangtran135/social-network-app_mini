import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, createPost, bogusId, TestUser } from './helpers';

// Test tin nhắn: tạo chat 1-1 / nhóm, gửi, đọc + đánh dấu đã đọc, thu hồi, cảm xúc, biệt danh, chia sẻ bài, quyền thành viên.
// Lưu ý: chat với người CHƯA kết bạn vẫn được phép (giao diện hiện hộp thoại khi người lạ nhắn tới).

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const openChat = async (from: TestUser, to: TestUser) => (await as(app, from).post('/api/messages/conversations').send({ participantId: to.id })).body.conversation.id as string;
const send = (user: TestUser, convId: string, data: Record<string, unknown> = { content: 'xin chào' }) => as(app, user).post(`/api/messages/conversations/${convId}/messages`).send(data);
const history = async (user: TestUser, convId: string) => (await as(app, user).get(`/api/messages/conversations/${convId}/messages`)).body.messages as { id: string; content: string; isRead: boolean; senderId: string; isRecalled: boolean; reactions?: Record<string, string> }[];

describe('Tạo hội thoại 1-1', () => {
  it('tạo chat với người khác (cả người lạ chưa kết bạn)', async () => {
    const a = await signUp(app);
    const stranger = await signUp(app);
    const res = await as(app, a).post('/api/messages/conversations').send({ participantId: stranger.id });
    expect(res.status).toBe(200);
    expect(res.body.conversation.isGroup).toBe(false);
    expect(res.body.conversation.participants.map((p: { id: string }) => p.id).sort()).toEqual([a.id, stranger.id].sort());
  });

  it('tạo lại cùng một cặp (kể cả đảo chiều) → dùng lại hội thoại cũ, không tạo trùng', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const id1 = await openChat(a, b);
    const id2 = await openChat(a, b);
    const id3 = await openChat(b, a);
    expect(id2).toBe(id1);
    expect(id3).toBe(id1);
    expect((await as(app, a).get('/api/messages/conversations')).body.conversations).toHaveLength(1);
  });

  it('không thể chat với chính mình → 400', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post('/api/messages/conversations').send({ participantId: a.id })).status).toBe(400);
  });

  it('chat với người không tồn tại → 404; id sai định dạng → 400', async () => {
    const a = await signUp(app);
    expect((await as(app, a).post('/api/messages/conversations').send({ participantId: bogusId })).status).toBe(404);
    expect((await as(app, a).post('/api/messages/conversations').send({ participantId: 'abc' })).status).toBe(400);
  });

  it('không tạo được chat với người đã chặn mình / mình đã chặn', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await as(app, b).post(`/api/users/${a.id}/block`);
    expect((await as(app, a).post('/api/messages/conversations').send({ participantId: b.id })).status).toBe(403);
    expect((await as(app, b).post('/api/messages/conversations').send({ participantId: a.id })).status).toBe(403);
  });
});

describe('Nhóm chat', () => {
  it('tạo nhóm từ 3 người có tên → thành công, có tin nhắn hệ thống', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    const res = await as(app, a).post('/api/messages/conversations').send({ participantIds: [b.id, c.id], name: 'Nhóm đồ án' });
    expect(res.status).toBe(200);
    expect(res.body.conversation).toMatchObject({ isGroup: true, name: 'Nhóm đồ án' });
    expect(res.body.conversation.participants).toHaveLength(3);
    const msgs = await history(b, res.body.conversation.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toContain('Nhóm đồ án');
  });

  it('nhóm không tên → 400', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    expect((await as(app, a).post('/api/messages/conversations').send({ participantIds: [b.id, c.id] })).status).toBe(400);
  });

  it('nhóm có thành viên không tồn tại → 404', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    expect((await as(app, a).post('/api/messages/conversations').send({ participantIds: [b.id, bogusId], name: 'X' })).status).toBe(404);
  });

  it('thành viên trùng id / chèn lại chính mình không tạo người trùng', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    const res = await as(app, a).post('/api/messages/conversations').send({ participantIds: [b.id, b.id, c.id, a.id], name: 'G' });
    expect(res.body.conversation.participants).toHaveLength(3);
  });

  it('mọi thành viên nhận được tin nhắn nhóm', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    const conv = (await as(app, a).post('/api/messages/conversations').send({ participantIds: [b.id, c.id], name: 'G' })).body.conversation.id;
    await send(a, conv, { content: 'chào cả nhóm' });
    for (const u of [b, c]) expect((await history(u, conv)).map((m) => m.content)).toContain('chào cả nhóm');
  });
});

describe('Gửi & đọc tin nhắn', () => {
  it('gửi → cả hai thấy theo thứ tự thời gian', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    await send(a, conv, { content: 'một' });
    await send(b, conv, { content: 'hai' });
    await send(a, conv, { content: 'ba' });
    expect((await history(a, conv)).map((m) => m.content)).toEqual(['một', 'hai', 'ba']);
    expect((await history(b, conv)).map((m) => m.content)).toEqual(['một', 'hai', 'ba']);
  });

  it('tin nhắn có tiếng Việt / emoji / xuống dòng giữ nguyên', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    const content = 'Chào bạn 😊\nHẹn gặp lại!';
    expect((await send(a, conv, { content })).body.message.content).toBe(content);
  });

  it('tin kèm tệp đính kèm', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    const res = await send(a, conv, { content: '', attachments: [{ type: 'image', url: '/uploads/1.png', name: '1.png', size: '10 KB' }] });
    expect(res.status).toBe(200);
    expect(res.body.message.attachments).toHaveLength(1);
  });

  it.each([
    ['quá 5000 ký tự', { content: 'x'.repeat(5001) }],
    ['quá 10 tệp đính kèm', { content: 'x', attachments: Array.from({ length: 11 }, (_, i) => ({ type: 'file', url: `/u/${i}`, name: `${i}` })) }],
    ['loại tệp không hợp lệ', { content: 'x', attachments: [{ type: 'virus', url: '/u/1', name: 'a' }] }],
  ])('từ chối: %s → 400', async (_l, body) => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    expect((await send(a, conv, body)).status).toBe(400);
  });

  it('người ngoài hội thoại: không đọc, không gửi, không thấy → 403', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const outsider = await signUp(app);
    const conv = await openChat(a, b);
    await send(a, conv);
    expect((await as(app, outsider).get(`/api/messages/conversations/${conv}/messages`)).status).toBe(403);
    expect((await send(outsider, conv)).status).toBe(403);
    expect((await as(app, outsider).get('/api/messages/conversations')).body.conversations).toEqual([]);
  });

  it('hội thoại không tồn tại → 404; id sai → 400', async () => {
    const a = await signUp(app);
    expect((await as(app, a).get(`/api/messages/conversations/${bogusId}/messages`)).status).toBe(404);
    expect((await as(app, a).get('/api/messages/conversations/abc/messages')).status).toBe(400);
  });

  it('chưa đăng nhập → 401', async () => {
    expect((await request(app).get('/api/messages/conversations')).status).toBe(401);
  });
});

describe('Đã đọc & số tin chưa đọc', () => {
  it('người nhận thấy unreadCount tăng; mở hội thoại thì về 0; người gửi thấy isRead = true', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    await send(a, conv, { content: '1' });
    await send(a, conv, { content: '2' });

    const before = (await as(app, b).get('/api/messages/conversations')).body.conversations[0];
    expect(before.unreadCount).toBe(2);
    expect((await as(app, a).get('/api/messages/conversations')).body.conversations[0].unreadCount).toBe(0); // tin của chính mình không tính
    expect((await history(a, conv)).every((m) => !m.isRead)).toBe(true);

    await history(b, conv); // b mở hội thoại
    expect((await as(app, b).get('/api/messages/conversations')).body.conversations[0].unreadCount).toBe(0);
    expect((await history(a, conv)).every((m) => m.isRead)).toBe(true);
  });

  it('danh sách hội thoại có tin nhắn cuối và xếp hội thoại mới hoạt động lên đầu', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    const c1 = await openChat(a, b);
    const c2 = await openChat(a, c);
    await send(a, c1, { content: 'tin cũ' });
    await new Promise((r) => setTimeout(r, 15));
    await send(a, c2, { content: 'tin mới nhất' });
    const list = (await as(app, a).get('/api/messages/conversations')).body.conversations;
    expect(list.map((c: { id: string }) => c.id)).toEqual([c2, c1]);
    expect(list[0].lastMessage.content).toBe('tin mới nhất');
  });

  it('người lạ nhắn tới: hội thoại xuất hiện trong danh sách của người nhận với unreadCount = 1', async () => {
    const stranger = await signUp(app);
    const me = await signUp(app);
    const conv = await openChat(stranger, me);
    await send(stranger, conv, { content: 'Xin chào, mình là người lạ' });
    const list = (await as(app, me).get('/api/messages/conversations')).body.conversations;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: conv, unreadCount: 1 });
    expect(list[0].lastMessage.content).toBe('Xin chào, mình là người lạ');
  });
});

describe('Thu hồi & cảm xúc', () => {
  it('thu hồi tin của mình → nội dung bị xoá, đánh dấu isRecalled', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    const msg = (await send(a, conv, { content: 'nhắn nhầm' })).body.message;
    const res = await as(app, a).delete(`/api/messages/conversations/${conv}/messages/${msg.id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatchObject({ isRecalled: true, content: '' });
    const seenByB = (await history(b, conv))[0];
    expect(seenByB).toMatchObject({ isRecalled: true, content: '' });
  });

  it('không thu hồi được tin của người khác → 403', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    const msg = (await send(a, conv)).body.message;
    expect((await as(app, b).delete(`/api/messages/conversations/${conv}/messages/${msg.id}`)).status).toBe(403);
    expect((await history(a, conv))[0].isRecalled).toBe(false);
  });

  it('thu hồi tin không tồn tại → 404; tin của hội thoại khác → 404', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const c = await signUp(app);
    const conv1 = await openChat(a, b);
    const conv2 = await openChat(a, c);
    const msg = (await send(a, conv1)).body.message;
    expect((await as(app, a).delete(`/api/messages/conversations/${conv1}/messages/${bogusId}`)).status).toBe(404);
    expect((await as(app, a).delete(`/api/messages/conversations/${conv2}/messages/${msg.id}`)).status).toBe(404);
  });

  it('thả cảm xúc: thả → đổi → bấm lại cùng emoji thì bỏ; mỗi người 1 cảm xúc', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    const msg = (await send(a, conv)).body.message;
    const url = `/api/messages/conversations/${conv}/messages/${msg.id}/react`;
    expect((await as(app, b).post(url).send({ emoji: '👍' })).body.message.reactions).toEqual({ [b.id]: '👍' });
    expect((await as(app, b).post(url).send({ emoji: '❤️' })).body.message.reactions).toEqual({ [b.id]: '❤️' });
    expect((await as(app, a).post(url).send({ emoji: '😂' })).body.message.reactions).toEqual({ [b.id]: '❤️', [a.id]: '😂' });
    expect((await as(app, b).post(url).send({ emoji: '❤️' })).body.message.reactions).toEqual({ [a.id]: '😂' });
  });

  it('emoji quá dài → 400', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    const msg = (await send(a, conv)).body.message;
    expect((await as(app, a).post(`/api/messages/conversations/${conv}/messages/${msg.id}/react`).send({ emoji: 'x'.repeat(9) })).status).toBe(400);
  });

  it('thu hồi xoá luôn cảm xúc đã có trên tin đó', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    const msg = (await send(a, conv)).body.message;
    await as(app, b).post(`/api/messages/conversations/${conv}/messages/${msg.id}/react`).send({ emoji: '👍' });
    const res = await as(app, a).delete(`/api/messages/conversations/${conv}/messages/${msg.id}`);
    expect(res.body.message.reactions).toBeUndefined();
  });
});

describe('Biệt danh', () => {
  it('đặt biệt danh → có trong hội thoại + tin nhắn hệ thống; để trống = xoá', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    const set = await as(app, a).patch(`/api/messages/conversations/${conv}/nickname`).send({ userId: b.id, nickname: 'Bạn thân' });
    expect(set.status).toBe(200);
    expect(set.body.conversation.nicknames).toEqual({ [b.id]: 'Bạn thân' });
    expect(set.body.systemMessage.kind).toBe('system');
    const cleared = await as(app, a).patch(`/api/messages/conversations/${conv}/nickname`).send({ userId: b.id, nickname: '' });
    expect(cleared.body.conversation.nicknames).toEqual({});
  });

  it('người ngoài hội thoại không đặt được; biệt danh quá 60 ký tự → 400', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const outsider = await signUp(app);
    const conv = await openChat(a, b);
    expect((await as(app, outsider).patch(`/api/messages/conversations/${conv}/nickname`).send({ userId: b.id, nickname: 'x' })).status).toBe(403);
    expect((await as(app, a).patch(`/api/messages/conversations/${conv}/nickname`).send({ userId: b.id, nickname: 'x'.repeat(61) })).status).toBe(400);
  });
});

describe('Chia sẻ bài viết vào chat', () => {
  it('gửi bài vào chat → tin nhắn có sharedPostId', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const conv = await openChat(a, b);
    const res = await as(app, a).post(`/api/messages/conversations/${conv}/share-post`).send({ postId: post.id });
    expect(res.status).toBe(200);
    expect(res.body.message.sharedPostId).toBe(post.id);
  });

  it('bài không tồn tại → 404; postId sai định dạng → 400', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const conv = await openChat(a, b);
    expect((await as(app, a).post(`/api/messages/conversations/${conv}/share-post`).send({ postId: bogusId })).status).toBe(404);
    expect((await as(app, a).post(`/api/messages/conversations/${conv}/share-post`).send({ postId: 'abc' })).status).toBe(400);
  });
});

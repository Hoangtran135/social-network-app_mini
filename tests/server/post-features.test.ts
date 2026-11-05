import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { extractHashtags, normalizeTag, MAX_HASHTAGS } from '../../server/hashtags';
import { buildApp, connectTestDb, disconnectTestDb, signUp, as, befriend, createPost, bogusId, TestUser } from './helpers';

// Tính năng bài viết: hashtag, lịch sử chỉnh sửa, check-in vị trí, tắt bình luận, ẩn bài, chia sẻ kèm lời bình.

describe('extractHashtags', () => {
  const cases: [string, string, string[]][] = [
    ['một tag', 'Hôm nay vui #vui', ['vui']],
    ['nhiều tag', '#a #b #c', ['a', 'b', 'c']],
    ['tag ở đầu chuỗi', '#dauchuoi nội dung', ['dauchuoi']],
    ['tag ở cuối chuỗi', 'nội dung #cuoi', ['cuoi']],
    ['sau xuống dòng', 'dòng 1\n#dong2', ['dong2']],
    ['sau dấu câu', 'Xem này (#mot), #hai! #ba?', ['mot', 'hai', 'ba']],
    ['chữ hoa → chữ thường', '#HaNoi #HANOI #hanoi', ['hanoi']],
    ['tiếng Việt có dấu', '#HàNội #Đà_Nẵng', ['hànội', 'đà_nẵng']],
    ['có số và gạch dưới', '#web3 #tag_1 #2024', ['web3', 'tag_1', '2024']],
    ['tiếng Nhật / Trung', '#日本語 #中文', ['日本語', '中文']],
    ['emoji ngay sau tag', '#vui😀', ['vui']],
    ['dừng ở dấu chấm', '#tag.ket', ['tag']],
    ['dừng ở dấu gạch ngang', '#abc-def', ['abc']],
    ['không có tag', 'không có gì ở đây', []],
    ['chuỗi rỗng', '', []],
    ['chỉ có #', '# # #', []],
    ['"#" dính liền chữ phía trước (abc#def)', 'abc#def', []],
    ['địa chỉ có #', 'https://a.com/#top', []],
    ['số + # (mã 1#2)', 'mã 1#2', []],
    ['&# (thực thể HTML)', 'a &#123; b', []],
    ['tag trùng chỉ tính một lần', '#x #X #x', ['x']],
    ['## (hai dấu thăng)', '##tag', []],
    ['#tag ngay sau mention', '@an #tag', ['tag']],
    ['tag dài đúng 50 ký tự', `#${'a'.repeat(50)}`, ['a'.repeat(50)]],
  ];
  it.each(cases)('%s', (_l, text, expected) => expect(extractHashtags(text)).toEqual(expected));

  it('tag dài hơn 50 ký tự chỉ lấy 50 ký tự đầu', () => expect(extractHashtags(`#${'b'.repeat(60)}`)).toEqual(['b'.repeat(50)]));
  it('tối đa 30 tag mỗi bài', () => expect(extractHashtags(Array.from({ length: 50 }, (_, i) => `#t${i}`).join(' '))).toHaveLength(MAX_HASHTAGS));
  it('undefined → mảng rỗng', () => expect(extractHashtags(undefined)).toEqual([]));
});

describe('normalizeTag', () => {
  it.each([
    ['vui', 'vui'], ['#vui', 'vui'], ['  #Vui  ', 'vui'], ['HàNội', 'hànội'], ['a_1', 'a_1'], [['x'], 'x'],
    ['', ''], ['#', ''], ['a b', ''], ['a-b', ''], ['a.b', ''], ['<script>', ''], ['$ne', ''], ['x'.repeat(51), ''], [undefined, ''], [null, ''], [{}, ''],
  ])('%j → "%s"', (input, expected) => expect(normalizeTag(input)).toBe(expected));
});

let app: Express;
beforeAll(async () => {
  await connectTestDb();
  app = buildApp();
});
afterAll(disconnectTestDb);

const ids = async (viewer: TestUser, query: string) => ((await as(app, viewer).get(`/api/posts${query}`)).body.posts as { id: string }[]).map((p) => p.id);

describe('Hashtag', () => {
  it('đăng bài → hashtag được lưu (chữ thường) và trả về', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a, { content: 'Chuyến đi #DuLịch #ĐàLạt rất vui' });
    expect(post.hashtags).toEqual(['dulịch', 'đàlạt']);
  });

  it('bài không có hashtag → không có trường hashtags', async () => {
    const a = await signUp(app);
    expect((await createPost(app, a, { content: 'không tag' })).hashtags).toBeUndefined();
  });

  it('lọc bảng tin theo tag: chỉ trả bài có tag đó; chấp nhận #, hoa/thường', async () => {
    const a = await signUp(app);
    const withTag = await createPost(app, a, { content: 'có #giaitri tại đây' });
    const other = await createPost(app, a, { content: 'tag khác #hoctap' });
    const none = await createPost(app, a, { content: 'không tag' });
    for (const q of ['giaitri', '%23giaitri', 'GIAITRI', '%23GiaiTri']) {
      const list = await ids(a, `?tag=${q}`);
      expect(list, q).toContain(withTag.id);
      expect(list, q).not.toContain(other.id);
      expect(list, q).not.toContain(none.id);
    }
  });

  it('tag không tồn tại / không hợp lệ → danh sách rỗng (KHÔNG trả toàn bộ bảng tin)', async () => {
    const a = await signUp(app);
    await createPost(app, a, { content: 'bài #abc' });
    for (const q of ['khongco123', '', '%23', 'a%20b', 'a-b', '%3Cscript%3E', '%24ne', 'x'.repeat(60)]) {
      const res = await as(app, a).get(`/api/posts?tag=${q}`);
      expect(res.status, q).toBe(200);
      expect(res.body.posts, q).toEqual([]);
    }
  });

  it('chống NoSQL injection ở ?tag[$ne]=x → không lộ bài', async () => {
    const a = await signUp(app);
    await createPost(app, a, { content: 'bài #abc' });
    const res = await as(app, a).get('/api/posts?tag[$ne]=zzz');
    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
  });

  it('trang theo tag tuân theo quyền riêng tư: bài bạn bè / chỉ mình tôi / người bị chặn không lộ', async () => {
    const author = await signUp(app);
    const friend = await signUp(app);
    const stranger = await signUp(app);
    await befriend(app, author, friend);
    const pub = await createPost(app, author, { content: '#bimat công khai', privacy: 'public' });
    const fr = await createPost(app, author, { content: '#bimat bạn bè', privacy: 'friends' });
    const me = await createPost(app, author, { content: '#bimat riêng tư', privacy: 'only_me' });
    expect(await ids(stranger, '?tag=bimat')).toEqual([pub.id]);
    expect((await ids(friend, '?tag=bimat')).sort()).toEqual([pub.id, fr.id].sort());
    expect((await ids(author, '?tag=bimat')).sort()).toEqual([pub.id, fr.id, me.id].sort());
    await as(app, stranger).post(`/api/users/${author.id}/block`);
    expect(await ids(stranger, '?tag=bimat')).toEqual([]);
  });

  it('sắp mới nhất trước và phân trang theo tag', async () => {
    const a = await signUp(app);
    const created: string[] = [];
    for (let i = 0; i < 4; i++) created.push((await createPost(app, a, { content: `bài ${i} #phantrang` })).id);
    expect(await ids(a, '?tag=phantrang')).toEqual([...created].reverse());
    expect(await ids(a, '?tag=phantrang&limit=2')).toEqual([created[3], created[2]]);
    expect(await ids(a, '?tag=phantrang&limit=2&skip=2')).toEqual([created[1], created[0]]);
  });

  it('sửa nội dung → tính lại hashtag (tag cũ biến mất, tag mới xuất hiện)', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a, { content: 'cũ #tagcu' });
    const res = await as(app, a).patch(`/api/posts/${post.id}`).send({ content: 'mới #tagmoi' });
    expect(res.body.post.hashtags).toEqual(['tagmoi']);
    expect(await ids(a, '?tag=tagcu')).not.toContain(post.id);
    expect(await ids(a, '?tag=tagmoi')).toContain(post.id);
  });

  it('chia sẻ bài → bài chia sẻ cũng có hashtag (từ lời bình và nội dung gốc)', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const original = await createPost(app, a, { content: 'gốc #goc' });
    const shared = await as(app, b).post(`/api/posts/${original.id}/share`).send({ message: 'hay #loibinh' });
    expect(shared.body.post.hashtags).toEqual(expect.arrayContaining(['loibinh', 'goc']));
  });
});

describe('Chia sẻ kèm lời bình', () => {
  it('lời bình được ghép phía trên phần trích dẫn', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const original = await createPost(app, a, { content: 'Nội dung gốc' });
    const res = await as(app, b).post(`/api/posts/${original.id}/share`).send({ message: 'Mình rất thích bài này' });
    const content: string = res.body.post.content;
    expect(content.startsWith('Mình rất thích bài này\n\n[Chia sẻ từ @')).toBe(true);
    expect(content).toContain('Nội dung gốc');
  });

  it('lời bình dài hơn 2000 ký tự → 400', async () => {
    const a = await signUp(app);
    const original = await createPost(app, a);
    expect((await as(app, a).post(`/api/posts/${original.id}/share`).send({ message: 'x'.repeat(2001) })).status).toBe(400);
  });
});

describe('Lịch sử chỉnh sửa', () => {
  const edit = (u: TestUser, id: string, body: Record<string, unknown>) => as(app, u).patch(`/api/posts/${id}`).send(body);

  it('bài chưa sửa → không có lịch sử, không có updatedAt', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    expect(post.editHistory).toBeUndefined();
    expect(post.updatedAt).toBeUndefined();
  });

  it('mỗi lần đổi nội dung thêm một phiên bản cũ, theo thứ tự thời gian', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a, { content: 'v1' });
    await edit(a, post.id, { content: 'v2' });
    const res = await edit(a, post.id, { content: 'v3' });
    expect(res.body.post.content).toBe('v3');
    expect(res.body.post.editHistory.map((h: { content: string }) => h.content)).toEqual(['v1', 'v2']);
    expect(res.body.post.editHistory.every((h: { editedAt: string }) => !!h.editedAt)).toBe(true);
    expect(res.body.post.updatedAt).toBeTruthy();
  });

  it('lưu lại đúng nội dung cũ (không đổi) → KHÔNG thêm phiên bản', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a, { content: 'giữ nguyên' });
    const res = await edit(a, post.id, { content: 'giữ nguyên', privacy: 'friends' });
    expect(res.body.post.editHistory).toBeUndefined();
    expect(res.body.post.privacy).toBe('friends');
  });

  it('chỉ đổi quyền riêng tư / cảm xúc → không thêm lịch sử nội dung', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a, { content: 'abc' });
    const res = await edit(a, post.id, { feeling: 'vui' });
    expect(res.body.post.editHistory).toBeUndefined();
  });

  it('chỉ giữ 20 phiên bản gần nhất', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a, { content: 'v0' });
    let last: { editHistory: { content: string }[] } = { editHistory: [] };
    for (let i = 1; i <= 23; i++) last = (await edit(a, post.id, { content: `v${i}` })).body.post;
    expect(last.editHistory).toHaveLength(20);
    expect(last.editHistory[0].content).toBe('v3');
    expect(last.editHistory[19].content).toBe('v22');
  });

  it('người khác xem được lịch sử của bài họ xem được', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a, { content: 'trước' });
    await edit(a, post.id, { content: 'sau' });
    const seen = (await as(app, b).get(`/api/posts/${post.id}`)).body.post;
    expect(seen.editHistory[0].content).toBe('trước');
  });

  it('người khác không sửa được → 403 và không ghi lịch sử', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a, { content: 'gốc' });
    expect((await edit(b, post.id, { content: 'hack' })).status).toBe(403);
    expect((await as(app, a).get(`/api/posts/${post.id}`)).body.post.editHistory).toBeUndefined();
  });
});

describe('Check-in vị trí', () => {
  it('đăng bài kèm vị trí; sửa vị trí; xoá vị trí', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a, { content: 'ăn phở', location: 'Hà Nội' });
    expect(post.location).toBe('Hà Nội');
    expect((await as(app, a).patch(`/api/posts/${post.id}`).send({ location: 'Đà Nẵng' })).body.post.location).toBe('Đà Nẵng');
    expect((await as(app, a).patch(`/api/posts/${post.id}`).send({ location: '' })).body.post.location).toBe('');
  });

  it('vị trí quá 200 ký tự → 400 (cả khi sửa)', async () => {
    const a = await signUp(app);
    const post = await createPost(app, a);
    expect((await as(app, a).patch(`/api/posts/${post.id}`).send({ location: 'x'.repeat(201) })).status).toBe(400);
  });

  it('vị trí được cắt khoảng trắng', async () => {
    const a = await signUp(app);
    expect((await createPost(app, a, { location: '  Huế  ' })).location).toBe('Huế');
  });
});

describe('Tắt / bật bình luận', () => {
  const toggle = (u: TestUser, id: string) => as(app, u).post(`/api/posts/${id}/toggle-comments`);
  const comment = (u: TestUser, postId: string) => as(app, u).post('/api/comments').send({ postId, content: 'xin chào' });

  it('mặc định bình luận được bật', async () => {
    const a = await signUp(app);
    expect((await createPost(app, a)).commentsDisabled).toBe(false);
  });

  it('chủ bài tắt → mọi người (kể cả chủ bài) không bình luận được → 403; bật lại thì được', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    expect((await toggle(a, post.id)).body.post.commentsDisabled).toBe(true);
    expect((await comment(b, post.id)).status).toBe(403);
    expect((await comment(a, post.id)).status).toBe(403);
    expect((await toggle(a, post.id)).body.post.commentsDisabled).toBe(false);
    expect((await comment(b, post.id)).status).toBe(200);
  });

  it('bình luận có sẵn vẫn xem và thích được sau khi tắt; đếm không đổi', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const c = (await comment(b, post.id)).body.comment;
    await toggle(a, post.id);
    expect((await as(app, b).get(`/api/comments?postId=${post.id}`)).body.comments).toHaveLength(1);
    expect((await as(app, b).post(`/api/comments/${c.id}/like`)).status).toBe(200);
    expect((await as(app, a).get(`/api/posts/${post.id}`)).body.post.commentsCount).toBe(1);
  });

  it('xoá bình luận cũ vẫn được khi đã tắt', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    const c = (await comment(b, post.id)).body.comment;
    await toggle(a, post.id);
    expect((await as(app, b).delete(`/api/comments/${c.id}`)).status).toBe(200);
  });

  it('người khác không tắt được → 403; bài không tồn tại → 404; id sai → 400', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    expect((await toggle(b, post.id)).status).toBe(403);
    expect((await toggle(a, bogusId)).status).toBe(404);
    expect((await toggle(a, 'abc')).status).toBe(400);
    expect((await as(app, a).get(`/api/posts/${post.id}`)).body.post.commentsDisabled).toBe(false);
  });

  it('trạng thái tắt hiện ở bảng tin của người khác', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const post = await createPost(app, a);
    await toggle(a, post.id);
    const feed = (await as(app, b).get('/api/posts')).body.posts.find((p: { id: string }) => p.id === post.id);
    expect(feed.commentsDisabled).toBe(true);
  });
});

describe('Ẩn bài / không quan tâm', () => {
  const hide = (u: TestUser, id: string) => as(app, u).post(`/api/posts/${id}/hide`);

  it('ẩn → bài biến mất khỏi bảng tin CỦA MÌNH, người khác vẫn thấy', async () => {
    const author = await signUp(app);
    const me = await signUp(app);
    const other = await signUp(app);
    const post = await createPost(app, author);
    expect((await hide(me, post.id)).status).toBe(200);
    expect(await ids(me, '')).not.toContain(post.id);
    expect(await ids(other, '')).toContain(post.id);
    expect(await ids(author, '')).toContain(post.id);
  });

  it('ẩn nhiều lần không lỗi; vẫn mở được bằng đường dẫn trực tiếp', async () => {
    const author = await signUp(app);
    const me = await signUp(app);
    const post = await createPost(app, author);
    await hide(me, post.id);
    expect((await hide(me, post.id)).status).toBe(200);
    expect((await as(app, me).get(`/api/posts/${post.id}`)).status).toBe(200);
  });

  it('bài ẩn cũng biến mất khỏi trang hashtag của mình', async () => {
    const author = await signUp(app);
    const me = await signUp(app);
    const post = await createPost(app, author, { content: '#anbai nè' });
    expect(await ids(me, '?tag=anbai')).toContain(post.id);
    await hide(me, post.id);
    expect(await ids(me, '?tag=anbai')).not.toContain(post.id);
  });

  it('hoàn tác (hiện lại) → bài quay lại bảng tin; hoàn tác khi chưa ẩn không lỗi', async () => {
    const author = await signUp(app);
    const me = await signUp(app);
    const post = await createPost(app, author);
    await hide(me, post.id);
    expect((await as(app, me).delete(`/api/posts/${post.id}/hide`)).status).toBe(200);
    expect(await ids(me, '')).toContain(post.id);
    expect((await as(app, me).delete(`/api/posts/${post.id}/hide`)).status).toBe(200);
  });

  it('không ẩn được bài mình không xem được → 404; bài không tồn tại → 404; id sai → 400', async () => {
    const author = await signUp(app);
    const stranger = await signUp(app);
    const secret = await createPost(app, author, { privacy: 'only_me' });
    expect((await hide(stranger, secret.id)).status).toBe(404);
    expect((await hide(stranger, bogusId)).status).toBe(404);
    expect((await hide(stranger, 'abc')).status).toBe(400);
    expect((await as(app, stranger).delete(`/api/posts/${bogusId}/hide`)).status).toBe(404);
  });

  it('phân trang vẫn đúng khi đã ẩn bớt bài', async () => {
    const author = await signUp(app);
    const me = await signUp(app);
    const created: string[] = [];
    for (let i = 0; i < 5; i++) created.push((await createPost(app, author, { content: `p${i} #pt` })).id);
    await hide(me, created[4]);
    await hide(me, created[2]);
    expect(await ids(me, '?tag=pt')).toEqual([created[3], created[1], created[0]]);
  });

  it('người ẩn không bị ảnh hưởng quyền hạn khác (vẫn thả cảm xúc / bình luận được)', async () => {
    const author = await signUp(app);
    const me = await signUp(app);
    const post = await createPost(app, author);
    await hide(me, post.id);
    expect((await as(app, me).post(`/api/posts/${post.id}/react`).send({ type: 'like' })).status).toBe(200);
  });
});

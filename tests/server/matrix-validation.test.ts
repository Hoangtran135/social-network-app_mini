import { describe, it, expect } from 'vitest';
import {
  registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, updateProfileSchema,
  createPostSchema, updatePostSchema, reactPostSchema, sharePostSchema, createCommentSchema, createStorySchema,
  sendFriendRequestSchema, createConversationSchema, setNicknameSchema, sendMessageSchema, sharePostToChatSchema, reactMessageSchema,
} from '../../server/validation';

// MA TRẬN KIỂM TRA DỮ LIỆU: thử các giá trị BIÊN (đúng ngưỡng, vượt 1 đơn vị) của mọi trường trong mọi schema.
// Hàm thuần, không cần database nên chạy rất nhanh.

const ok = (schema: { safeParse: (d: unknown) => { success: boolean } }, data: unknown) => schema.safeParse(data).success;
const ID = '64b0f0f0f0f0f0f0f0f0f0f0';
const validRegister = { name: 'An', username: 'an_01', email: 'an@test.vn', password: '123456' };

describe('registerSchema.name (1–100 ký tự sau khi cắt khoảng trắng)', () => {
  const cases: [string, string, boolean][] = [
    ['rỗng', '', false],
    ['1 khoảng trắng', ' ', false],
    ['nhiều khoảng trắng', '          ', false],
    ['tab + xuống dòng', '\t\n', false],
    ['1 ký tự', 'A', true],
    ['2 ký tự', 'An', true],
    ['50 ký tự', 'a'.repeat(50), true],
    ['99 ký tự', 'a'.repeat(99), true],
    ['100 ký tự', 'a'.repeat(100), true],
    ['101 ký tự', 'a'.repeat(101), false],
    ['150 ký tự', 'a'.repeat(150), false],
    ['100 ký tự + khoảng trắng 2 đầu (được cắt)', ` ${'a'.repeat(100)} `, true],
    ['101 ký tự + khoảng trắng 2 đầu', ` ${'a'.repeat(101)} `, false],
    ['tiếng Việt có dấu', 'Nguyễn Thị Ánh Tuyết', true],
    ['emoji', 'An 🌸', true],
    ['CJK', '山田太郎', true],
    ['chữ Ả Rập', 'محمد', true],
  ];
  it.each(cases)('%s → %s', (_l, name, valid) => expect(ok(registerSchema, { ...validRegister, name })).toBe(valid));
});

describe('registerSchema.username (3–30 ký tự, chỉ chữ/số/_/.)', () => {
  for (let len = 0; len <= 35; len++) {
    const valid = len >= 3 && len <= 30;
    it(`độ dài ${len} → ${valid}`, () => expect(ok(registerSchema, { ...validRegister, username: 'a'.repeat(len) })).toBe(valid));
  }
  const printable = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i));
  for (const ch of [...printable, ' ', 'é', 'ư', 'đ', 'ñ', '😀', '中', '​', '\n', '\t']) {
    const valid = /^[a-zA-Z0-9_.]$/.test(ch);
    it(`ký tự ${JSON.stringify(ch)} trong username → ${valid}`, () => expect(ok(registerSchema, { ...validRegister, username: `ab${ch}` })).toBe(valid));
  }
});

describe('Email (registerSchema / loginSchema / forgotPasswordSchema đều dùng chung luật)', () => {
  const valid = ['a@b.vn', 'user.name@example.com', 'user+tag@example.co.uk', 'u_1@sub.domain.org', 'USER@EXAMPLE.COM', 'a-b@c-d.io', 'x@y.museum', "o'brien@x.ie", '1234@5678.vn', ' a@b.vn ', 'a.b.c@d.e.fg'];
  const invalid = ['', ' ', 'plain', '@x.com', 'a@', 'a@b', 'a@.com', 'a b@c.vn', 'a@b..vn', '..a@b.vn', 'a..b@c.vn', 'a@b.c', 'a@-b.com', 'a@b_c.com', 'a@@b.com', 'a@b.123', 'a@b.com.', 'ａ@b.vn', '<script>@b.vn', 'a@b.vn\nb@c.vn', 'x'.repeat(201) + '@b.vn'];
  for (const email of valid) it(`hợp lệ: ${JSON.stringify(email)}`, () => {
    expect(ok(registerSchema, { ...validRegister, email })).toBe(true);
    expect(ok(loginSchema, { email, password: 'x' })).toBe(true);
    expect(ok(forgotPasswordSchema, { email })).toBe(true);
  });
  for (const email of invalid) it(`không hợp lệ: ${JSON.stringify(email.length > 40 ? email.slice(0, 30) + '…' : email)}`, () => {
    expect(ok(registerSchema, { ...validRegister, email })).toBe(false);
    expect(ok(loginSchema, { email, password: 'x' })).toBe(false);
    expect(ok(forgotPasswordSchema, { email })).toBe(false);
  });
});

describe('Mật khẩu (6–200 ký tự)', () => {
  const lengths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 50, 100, 199, 200, 201, 202, 500];
  for (const len of lengths) {
    const valid = len >= 6 && len <= 200;
    it(`registerSchema: ${len} ký tự → ${valid}`, () => expect(ok(registerSchema, { ...validRegister, password: 'p'.repeat(len) })).toBe(valid));
    it(`changePasswordSchema.newPassword: ${len} ký tự → ${valid}`, () => expect(ok(changePasswordSchema, { currentPassword: 'x', newPassword: 'p'.repeat(len) })).toBe(valid));
    it(`resetPasswordSchema.password: ${len} ký tự → ${valid}`, () => expect(ok(resetPasswordSchema, { email: 'a@b.vn', token: 't', password: 'p'.repeat(len) })).toBe(valid));
  }
  it('mật khẩu KHÔNG bị cắt khoảng trắng (6 dấu cách là hợp lệ)', () => expect(ok(registerSchema, { ...validRegister, password: '      ' })).toBe(true));
  it('mật khẩu hiện tại: 1–200 ký tự', () => {
    expect(ok(changePasswordSchema, { currentPassword: '', newPassword: '123456' })).toBe(false);
    expect(ok(changePasswordSchema, { currentPassword: 'x'.repeat(200), newPassword: '123456' })).toBe(true);
    expect(ok(changePasswordSchema, { currentPassword: 'x'.repeat(201), newPassword: '123456' })).toBe(false);
  });
  it('loginSchema.password: 1–200 ký tự', () => {
    expect(ok(loginSchema, { email: 'a@b.vn', password: '' })).toBe(false);
    expect(ok(loginSchema, { email: 'a@b.vn', password: 'x'.repeat(200) })).toBe(true);
    expect(ok(loginSchema, { email: 'a@b.vn', password: 'x'.repeat(201) })).toBe(false);
  });
  it('resetPasswordSchema.token: 1–500 ký tự', () => {
    expect(ok(resetPasswordSchema, { email: 'a@b.vn', token: '', password: '123456' })).toBe(false);
    expect(ok(resetPasswordSchema, { email: 'a@b.vn', token: 't'.repeat(500), password: '123456' })).toBe(true);
    expect(ok(resetPasswordSchema, { email: 'a@b.vn', token: 't'.repeat(501), password: '123456' })).toBe(false);
  });
});

describe('Thiếu trường / sai kiểu dữ liệu ở mọi schema', () => {
  const wrongTypes: [string, unknown][] = [['null', null], ['undefined', undefined], ['số', 5], ['chuỗi', 'x'], ['mảng', []], ['boolean', true], ['object rỗng', {}]];
  const schemas = { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, createCommentSchema, createStorySchema, sendFriendRequestSchema, setNicknameSchema, sharePostToChatSchema };
  for (const [schemaName, schema] of Object.entries(schemas)) {
    for (const [label, value] of wrongTypes) it(`${schemaName} nhận ${label} → từ chối`, () => expect(ok(schema, value)).toBe(false));
  }
  const lenient = { createPostSchema, updatePostSchema, sharePostSchema, createConversationSchema, sendMessageSchema, reactMessageSchema, updateProfileSchema };
  for (const [schemaName, schema] of Object.entries(lenient)) {
    for (const [label, value] of wrongTypes.filter(([l]) => l !== 'object rỗng')) it(`${schemaName} (mọi trường tuỳ chọn) nhận ${label} → từ chối`, () => expect(ok(schema, value)).toBe(false));
    it(`${schemaName} nhận object rỗng → hợp lệ (mọi trường tuỳ chọn / có mặc định)`, () => expect(ok(schema, {})).toBe(true));
  }
});

describe('Định dạng id (24 ký tự hex)', () => {
  const validIds = [ID, ID.toUpperCase(), 'aAbBcCdDeEfF001122334455', '000000000000000000000000', 'ffffffffffffffffffffffff', '0123456789abcdef01234567'];
  const invalidIds = ['', ' ', ID.slice(0, 23), ID + '0', 'g' + ID.slice(1), ID.replace('f', 'z'), ` ${ID}`, `${ID} `, `${ID}\n`, '12345', 'null', 'undefined', '$ne', '../etc/passwd', '64b0f0f0-f0f0-f0f0-f0f0', 'x'.repeat(24), '😀'.repeat(12)];
  for (const id of validIds) it(`id hợp lệ ${id} (3 schema)`, () => {
    expect(ok(sendFriendRequestSchema, { targetUserId: id })).toBe(true);
    expect(ok(createCommentSchema, { postId: id, content: 'x' })).toBe(true);
    expect(ok(sharePostToChatSchema, { postId: id })).toBe(true);
  });
  for (const id of invalidIds) it(`id không hợp lệ ${JSON.stringify(id)} (3 schema)`, () => {
    expect(ok(sendFriendRequestSchema, { targetUserId: id })).toBe(false);
    expect(ok(createCommentSchema, { postId: id, content: 'x' })).toBe(false);
    expect(ok(sharePostToChatSchema, { postId: id })).toBe(false);
  });
  for (const id of invalidIds.slice(0, 8)) it(`id sai ở taggedUserIds / participantIds / wallOwnerId / parentId: ${JSON.stringify(id)}`, () => {
    expect(ok(createPostSchema, { taggedUserIds: [id] })).toBe(false);
    expect(ok(createPostSchema, { wallOwnerId: id })).toBe(false);
    expect(ok(createCommentSchema, { postId: ID, parentId: id })).toBe(false);
    expect(ok(createCommentSchema, { postId: ID, taggedUserIds: [id] })).toBe(false);
    expect(ok(createConversationSchema, { participantIds: [id] })).toBe(false);
    expect(ok(createConversationSchema, { participantId: id })).toBe(false);
    expect(ok(setNicknameSchema, { userId: id })).toBe(false);
  });
});

describe('createPostSchema', () => {
  for (const [len, valid] of [[0, true], [1, true], [100, true], [9999, true], [10000, true], [10001, false], [20000, false]] as const) {
    it(`content ${len} ký tự → ${valid}`, () => expect(ok(createPostSchema, { content: 'a'.repeat(len) })).toBe(valid));
  }
  for (let n = 0; n <= 22; n++) {
    const valid = n <= 20;
    it(`${n} ảnh → ${valid}`, () => expect(ok(createPostSchema, { images: Array.from({ length: n }, (_, i) => `/u/${i}.png`) })).toBe(valid));
  }
  for (const [p, valid] of [['public', true], ['friends', true], ['only_me', true], ['', false], ['PUBLIC', false], ['Public', false], ['private', false], ['everyone', false], ['friends ', false], [null, false], [1, false], [['public'], false], [{}, false]] as const) {
    it(`privacy ${JSON.stringify(p)} → ${valid}`, () => expect(ok(createPostSchema, { privacy: p })).toBe(valid));
  }
  for (const [len, valid] of [[0, true], [100, true], [101, false]] as const) it(`feeling ${len} ký tự → ${valid}`, () => expect(ok(createPostSchema, { feeling: 'f'.repeat(len) })).toBe(valid));
  for (const [len, valid] of [[0, true], [200, true], [201, false]] as const) it(`location ${len} ký tự → ${valid}`, () => expect(ok(createPostSchema, { location: 'l'.repeat(len) })).toBe(valid));
  for (const [len, valid] of [[0, true], [2000, true], [2001, false]] as const) {
    it(`video url ${len} ký tự → ${valid}`, () => expect(ok(createPostSchema, { video: 'v'.repeat(len) })).toBe(valid));
    it(`mỗi ảnh url ${len} ký tự → ${valid}`, () => expect(ok(createPostSchema, { images: ['i'.repeat(len)] })).toBe(valid));
  }
  for (const [n, valid] of [[0, true], [1, true], [49, true], [50, true], [51, false], [100, false]] as const) {
    it(`gắn thẻ ${n} người → ${valid}`, () => expect(ok(createPostSchema, { taggedUserIds: Array(n).fill(ID) })).toBe(valid));
  }
  it('mặc định: content "" và privacy "public"', () => expect(createPostSchema.parse({})).toMatchObject({ content: '', privacy: 'public' }));
  it('cắt khoảng trắng content', () => expect(createPostSchema.parse({ content: '  hi  ' }).content).toBe('hi'));
  it('trường lạ bị loại bỏ (không lọt tới database)', () => {
    const parsed = createPostSchema.parse({ content: 'x', author: ID, commentsCount: 9, __proto__: { x: 1 } }) as Record<string, unknown>;
    expect(parsed.author).toBeUndefined();
    expect(parsed.commentsCount).toBeUndefined();
  });
});

describe('updatePostSchema / reactPostSchema / sharePostSchema', () => {
  for (const [len, valid] of [[0, true], [10000, true], [10001, false]] as const) it(`updatePost content ${len} → ${valid}`, () => expect(ok(updatePostSchema, { content: 'a'.repeat(len) })).toBe(valid));
  for (let n = 19; n <= 22; n++) it(`updatePost ${n} ảnh → ${n <= 20}`, () => expect(ok(updatePostSchema, { images: Array(n).fill('/u.png') })).toBe(n <= 20));
  for (const p of ['public', 'friends', 'only_me']) it(`updatePost privacy ${p} → hợp lệ`, () => expect(ok(updatePostSchema, { privacy: p })).toBe(true));
  for (const p of ['', 'x', 'PUBLIC']) it(`updatePost privacy ${JSON.stringify(p)} → không hợp lệ`, () => expect(ok(updatePostSchema, { privacy: p })).toBe(false));
  for (const t of ['like', 'love', 'haha', 'wow', 'sad', 'angry']) it(`reactPost type ${t} → hợp lệ`, () => expect(ok(reactPostSchema, { type: t })).toBe(true));
  for (const t of ['', 'Like', 'LIKE', 'dislike', 'meh', 'thích', '👍', null, 1, undefined, ['like']]) it(`reactPost type ${JSON.stringify(t)} → không hợp lệ`, () => expect(ok(reactPostSchema, { type: t })).toBe(false));
  for (const [len, valid] of [[0, true], [2000, true], [2001, false]] as const) it(`sharePost message ${len} → ${valid}`, () => expect(ok(sharePostSchema, { message: 'm'.repeat(len) })).toBe(valid));
});

describe('createCommentSchema', () => {
  for (const [len, valid] of [[0, true], [1, true], [2999, true], [3000, true], [3001, false]] as const) it(`content ${len} ký tự → ${valid}`, () => expect(ok(createCommentSchema, { postId: ID, content: 'c'.repeat(len) })).toBe(valid));
  for (const [n, valid] of [[0, true], [50, true], [51, false]] as const) it(`gắn thẻ ${n} người → ${valid}`, () => expect(ok(createCommentSchema, { postId: ID, taggedUserIds: Array(n).fill(ID) })).toBe(valid));
  for (const [len, valid] of [[2000, true], [2001, false]] as const) it(`image url ${len} → ${valid}`, () => expect(ok(createCommentSchema, { postId: ID, image: 'i'.repeat(len) })).toBe(valid));
  it('thiếu postId → không hợp lệ', () => expect(ok(createCommentSchema, { content: 'x' })).toBe(false));
});

describe('createStorySchema', () => {
  for (const [t, valid] of [['image', true], ['text', true], ['video', false], ['', false], ['TEXT', false], [null, false], [1, false]] as const) it(`type ${JSON.stringify(t)} → ${valid}`, () => expect(ok(createStorySchema, { type: t })).toBe(valid));
  for (const [p, valid] of [['public', true], ['friends', true], ['only_me', false], ['', false], ['private', false]] as const) it(`privacy ${JSON.stringify(p)} → ${valid}`, () => expect(ok(createStorySchema, { type: 'text', privacy: p })).toBe(valid));
  for (const [len, valid] of [[0, true], [500, true], [501, false]] as const) it(`textContent ${len} ký tự → ${valid}`, () => expect(ok(createStorySchema, { type: 'text', textContent: 't'.repeat(len) })).toBe(valid));
  for (const [len, valid] of [[200, true], [201, false]] as const) it(`backgroundGradient ${len} ký tự → ${valid}`, () => expect(ok(createStorySchema, { type: 'text', backgroundGradient: 'g'.repeat(len) })).toBe(valid));
  it('privacy mặc định là public', () => expect(createStorySchema.parse({ type: 'text' }).privacy).toBe('public'));
});

describe('Tin nhắn', () => {
  const file = { type: 'file', url: '/u/1', name: 'a.pdf' };
  for (const [len, valid] of [[0, true], [5000, true], [5001, false]] as const) it(`sendMessage content ${len} → ${valid}`, () => expect(ok(sendMessageSchema, { content: 'm'.repeat(len) })).toBe(valid));
  for (let n = 0; n <= 12; n++) it(`sendMessage ${n} tệp đính kèm → ${n <= 10}`, () => expect(ok(sendMessageSchema, { attachments: Array(n).fill(file) })).toBe(n <= 10));
  for (const t of ['image', 'file']) it(`attachment type ${t} → hợp lệ`, () => expect(ok(sendMessageSchema, { attachments: [{ ...file, type: t }] })).toBe(true));
  for (const t of ['video', 'audio', '', 'IMAGE', null]) it(`attachment type ${JSON.stringify(t)} → không hợp lệ`, () => expect(ok(sendMessageSchema, { attachments: [{ ...file, type: t }] })).toBe(false));
  for (const [len, valid] of [[300, true], [301, false]] as const) it(`attachment name ${len} → ${valid}`, () => expect(ok(sendMessageSchema, { attachments: [{ ...file, name: 'n'.repeat(len) }] })).toBe(valid));
  for (const [len, valid] of [[50, true], [51, false]] as const) it(`attachment size ${len} ký tự → ${valid}`, () => expect(ok(sendMessageSchema, { attachments: [{ ...file, size: 's'.repeat(len) }] })).toBe(valid));
  for (const [len, valid] of [[1, true], [8, true], [9, false], [0, false]] as const) it(`reactMessage emoji ${len} ký tự → ${valid}`, () => expect(ok(reactMessageSchema, { emoji: 'e'.repeat(len) })).toBe(valid));
  for (const [len, valid] of [[0, true], [60, true], [61, false]] as const) it(`nickname ${len} ký tự → ${valid}`, () => expect(ok(setNicknameSchema, { userId: ID, nickname: 'n'.repeat(len) })).toBe(valid));
  for (const [len, valid] of [[0, true], [150, true], [151, false]] as const) it(`tên nhóm ${len} ký tự → ${valid}`, () => expect(ok(createConversationSchema, { name: 'g'.repeat(len) })).toBe(valid));
  for (const [n, valid] of [[0, true], [100, true], [101, false]] as const) it(`participantIds ${n} người → ${valid}`, () => expect(ok(createConversationSchema, { participantIds: Array(n).fill(ID) })).toBe(valid));
  for (const [len, valid] of [[0, true], [2000, true], [2001, false]] as const) it(`sharePostToChat message ${len} → ${valid}`, () => expect(ok(sharePostToChatSchema, { postId: ID, message: 'm'.repeat(len) })).toBe(valid));
  it('nickname mặc định là chuỗi rỗng (= xoá biệt danh)', () => expect(setNicknameSchema.parse({ userId: ID }).nickname).toBe(''));
});

describe('updateProfileSchema', () => {
  const limits: [string, number][] = [['name', 100], ['bio', 500], ['workplace', 150], ['education', 150], ['location', 150], ['website', 300], ['avatar', 2000], ['coverImage', 2000]];
  for (const [field, max] of limits) {
    for (const [len, valid] of [[max - 1, true], [max, true], [max + 1, false]] as const) it(`${field} ${len} ký tự → ${valid}`, () => expect(ok(updateProfileSchema, { [field]: 'x'.repeat(len) })).toBe(valid));
  }
  it('name không được rỗng nhưng các trường khác được xoá trống', () => {
    expect(ok(updateProfileSchema, { name: '' })).toBe(false);
    for (const field of ['bio', 'workplace', 'education', 'location', 'website', 'avatar', 'coverImage']) expect(ok(updateProfileSchema, { [field]: '' }), field).toBe(true);
  });
  for (const field of ['username', 'email', 'passwordHash', 'blockedUsers', 'isOnline', 'resetTokenHash', '_id', 'id', 'joinDate']) {
    it(`trường nhạy cảm "${field}" bị loại bỏ khỏi dữ liệu đã làm sạch`, () => {
      const parsed = updateProfileSchema.parse({ name: 'An', [field]: 'hack' }) as Record<string, unknown>;
      expect(parsed[field]).toBeUndefined();
    });
  }
});

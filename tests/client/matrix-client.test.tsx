// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import { timeAgo, fileSize, feelingText } from '../../src/utils/format';
import { detectMention, insertMention } from '../../src/utils/mention';
import { toggleId } from '../../src/components/FriendPicker';
import { CountBadge } from '../../src/components/ui';
import { api, ApiError, getToken, setToken } from '../../src/utils/api';
import { pageParams } from '../../server/pagination';
import { canViewContent } from '../../server/privacyRules';

// MA TRẬN PHÍA GIAO DIỆN: kiểm tra mọi giá trị trong từng khoảng của các hàm định dạng / hook / component nhỏ.

describe('timeAgo — mọi mốc thời gian', () => {
  const NOW = new Date('2025-06-15T12:00:00Z').getTime();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());
  const ago = (seconds: number) => timeAgo(new Date(NOW - seconds * 1000).toISOString());

  for (let s = 0; s < 10; s++) it(`${s} giây → "Vừa xong"`, () => expect(ago(s)).toBe('Vừa xong'));
  for (let s = 10; s < 60; s++) it(`${s} giây → "${s} giây trước"`, () => expect(ago(s)).toBe(`${s} giây trước`));
  for (let m = 1; m < 60; m++) {
    it(`${m} phút đầu mốc → "${m} phút trước"`, () => expect(ago(m * 60)).toBe(`${m} phút trước`));
    it(`${m} phút + 59 giây → vẫn "${m} phút trước"`, () => expect(ago(m * 60 + 59)).toBe(`${m} phút trước`));
  }
  for (let h = 1; h < 24; h++) it(`${h} giờ → "${h} giờ trước"`, () => expect(ago(h * 3600)).toBe(`${h} giờ trước`));
  for (let d = 1; d < 7; d++) it(`${d} ngày → "${d} ngày trước"`, () => expect(ago(d * 86400)).toBe(`${d} ngày trước`));
  for (let w = 1; w <= 4; w++) it(`${w} tuần → "${w} tuần trước"`, () => expect(ago(w * 7 * 86400)).toBe(`${w} tuần trước`));
  for (let mo = 1; mo <= 11; mo++) it(`${mo} tháng (≈${Math.round(mo * 30.44)} ngày) → "${mo} tháng trước"`, () => expect(ago(Math.ceil(mo * 30.44) * 86400)).toBe(`${mo} tháng trước`));
  for (let y = 1; y <= 10; y++) it(`${y} năm → "${y} năm trước"`, () => expect(ago(y * 365 * 86400)).toBe(`${y} năm trước`));
  it('thời gian không bao giờ giảm khi lùi xa hơn (đơn điệu): đơn vị chỉ đi lên', () => {
    const order = ['giây', 'phút', 'giờ', 'ngày', 'tuần', 'tháng', 'năm'];
    let last = -1;
    for (let s = 10; s < 5 * 365 * 86400; s = Math.ceil(s * 1.3)) {
      const unit = order.findIndex((u) => ago(s).includes(` ${u} `));
      expect(unit).toBeGreaterThanOrEqual(last);
      last = unit;
    }
  });
});

describe('fileSize', () => {
  for (const b of [0, 1, 2, 10, 100, 512, 1000, 1023]) it(`${b} byte → "${b} B"`, () => expect(fileSize(b)).toBe(`${b} B`));
  for (const kb of [1, 2, 5, 10, 100, 512, 1000, 1023]) it(`${kb} KB → "${kb}.0 KB"`, () => expect(fileSize(kb * 1024)).toBe(`${kb}.0 KB`));
  for (const mb of [1, 2, 5, 10, 20, 50, 100, 1000]) it(`${mb} MB → "${mb}.0 MB"`, () => expect(fileSize(mb * 1024 * 1024)).toBe(`${mb}.0 MB`));
  for (const [bytes, text] of [[1536, '1.5 KB'], [2560, '2.5 KB'], [1572864, '1.5 MB'], [10485760 + 524288, '10.5 MB']] as const) it(`${bytes} byte → "${text}"`, () => expect(fileSize(bytes)).toBe(text));
});

describe('feelingText', () => {
  const feelings = ['hạnh phúc 😊', 'hào hứng 🌟', 'thư giãn ☕', 'tuyệt vời 🌄', 'yêu đời ❤️', 'buồn 😢', 'mệt', ''];
  for (const f of feelings) it(`cảm xúc ${JSON.stringify(f)} → thêm tiền tố`, () => expect(feelingText(f)).toBe(`đang cảm thấy ${f}`));
  const activities = ['đang ăn 🍕', 'đang du lịch ✈️', 'đang code 💻', 'đang ', 'đang'.concat(' x')];
  for (const f of activities) it(`hoạt động ${JSON.stringify(f)} → giữ nguyên`, () => expect(feelingText(f)).toBe(f));
});

describe('detectMention — mọi tiền tố × mọi tên', () => {
  const names = ['a', 'Nam', 'nguyen', 'Nguyễn', 'Đặng', 'Ánh', 'Trần123', 'x9', 'Lê', 'Phạm', 'Ngô', 'Hoàng', 'ABC', 'xyz', 'Việt', 'Ưng', 'Ôn', 'Ân', 'Uyên', ''];
  const spaceBefore = ['', 'hi ', 'a\n', '  ', 'xin chào ', 'x '];
  for (const prefix of spaceBefore) {
    for (const name of names) {
      it(`${JSON.stringify(prefix)}+"@${name}" → nhận dạng thẻ`, () => {
        const text = `${prefix}@${name}`;
        expect(detectMention(text, text.length)).toEqual({ atIndex: prefix.length, query: name });
      });
    }
  }
  for (const before of ['a', '1', '.', 'Z', 'ễ']) {
    for (const name of ['', 'Nam', 'x']) it(`"${before}@${name}" (@ dính liền chữ) → KHÔNG phải thẻ`, () => expect(detectMention(`${before}@${name}`, before.length + 1 + name.length)).toBeNull());
  }
  for (const stop of [' ', '\n', ',', '.', '!', '?']) it(`gõ "${JSON.stringify(stop)}" ngay sau tên → dừng gắn thẻ`, () => expect(detectMention(`@Nam${stop}`, 5)).toBeNull());
  for (const name of names.filter(Boolean)) {
    it(`insertMention thay "@${name.slice(0, 2)}" bằng tên đầy đủ`, () => {
      const typed = `chào @${name.slice(0, 2)}`;
      const r = insertMention(typed, 5, typed.length, `${name} Văn`);
      expect(r.text).toBe(`chào @${name} Văn `);
      expect(r.cursor).toBe(r.text.length);
    });
  }
});

describe('toggleId — bật/tắt', () => {
  const sequences: [string[], string, string[]][] = [
    [[], 'a', ['a']], [['a'], 'a', []], [['a', 'b'], 'a', ['b']], [['a', 'b'], 'b', ['a']], [['a', 'b'], 'c', ['a', 'b', 'c']],
    [['a', 'b', 'c'], 'b', ['a', 'c']], [[''], '', []], [[], '', ['']], [['x'], 'X', ['x', 'X']],
  ];
  sequences.forEach(([input, id, expected], i) => it(`#${i + 1}: ${JSON.stringify(input)} ⊕ ${JSON.stringify(id)} → ${JSON.stringify(expected)}`, () => expect(toggleId(input, id)).toEqual(expected)));
  for (let n = 0; n <= 20; n++) {
    it(`bật ${n} id rồi tắt đủ ${n} id → rỗng (không rò rỉ, không trùng)`, () => {
      let ids: string[] = [];
      for (let i = 0; i < n; i++) ids = toggleId(ids, `id${i}`);
      expect(ids).toHaveLength(n);
      expect(new Set(ids).size).toBe(n);
      for (let i = 0; i < n; i++) ids = toggleId(ids, `id${i}`);
      expect(ids).toEqual([]);
    });
  }
});

describe('CountBadge 0…120 và các giá trị lạ', () => {
  for (let n = -2; n <= 120; n++) {
    const expected = n <= 0 ? '' : n > 99 ? '99+' : String(n);
    it(`${n} → ${expected === '' ? '(ẩn)' : `"${expected}"`}`, () => expect(render(<CountBadge count={n} />).container.textContent).toBe(expected));
  }
  for (const n of [1000, 99999, Number.MAX_SAFE_INTEGER]) it(`${n} → "99+"`, () => expect(render(<CountBadge count={n} />).container.textContent).toBe('99+'));
});

describe('API client — mã trạng thái HTTP', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setToken('tk');
  });
  const respond = (status: number) => fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => (status < 300 ? { ok: 1 } : { error: `lỗi ${status}` }) });
  for (const status of [200, 201, 202, 204, 206, 299]) {
    it(`${status} → thành công, giữ token`, async () => {
      respond(status);
      await expect(api.get('/x')).resolves.toBeDefined();
      expect(getToken()).toBe('tk');
    });
  }
  const errorStatuses = [400, 401, 402, 403, 404, 405, 406, 408, 409, 410, 413, 415, 418, 422, 423, 429, 431, 451, 500, 501, 502, 503, 504, 507, 599];
  for (const status of errorStatuses) {
    it(`${status} → ApiError(${status}) với câu báo lỗi của server; token ${status === 401 ? 'bị xoá' : 'được giữ'}`, async () => {
      respond(status);
      const err = await api.post('/x', {}).catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toMatchObject({ status, message: `lỗi ${status}` });
      expect(getToken()).toBe(status === 401 ? null : 'tk');
    });
  }
  for (const method of ['get', 'post', 'patch', 'delete'] as const) {
    for (const path of ['/a', '/a/b', '/a?x=1&y=2', '/a/%E1%BA%A3']) {
      it(`${method.toUpperCase()} ${path} → URL /api${path}`, async () => {
        respond(200);
        await (method === 'get' || method === 'delete' ? api[method](path) : api[method](path, { a: 1 }));
        expect(fetchMock.mock.calls[0][0]).toBe(`/api${path}`);
        expect(fetchMock.mock.calls[0][1].method).toBe(method.toUpperCase());
      });
    }
  }
});

describe('pageParams — lưới giá trị (đồng bộ với server)', () => {
  const limits: [unknown, number][] = [
    [undefined, 30], ['', 30], ['1', 1], ['2', 2], ['29', 29], ['30', 30], ['31', 31], ['99', 99], ['100', 100], ['101', 100], ['5000', 100], ['0', 30], ['-1', 30], ['-100', 30],
    ['abc', 30], ['1.5', 1], ['99.9', 99], ['1e2', 100], ['1e9', 100], ['Infinity', 100], ['-Infinity', 30], ['NaN', 30], [' 5 ', 5], ['0x10', 16], [null, 30], [[], 30], [['5'], 5], [{}, 30], [true, 1], [false, 30],
  ];
  for (const [value, expected] of limits) it(`limit=${JSON.stringify(value)} → ${expected}`, () => expect(pageParams({ limit: value }, 30).limit).toBe(expected));
  const skips: [unknown, number][] = [
    [undefined, 0], ['', 0], ['0', 0], ['1', 1], ['10', 10], ['1000000', 1000000], ['-1', 0], ['-100', 0], ['abc', 0], ['2.9', 2], ['1e3', 1000], ['NaN', 0], [null, 0], [[], 0], [true, 1], [' 7 ', 7],
  ];
  for (const [value, expected] of skips) it(`skip=${JSON.stringify(value)} → ${expected}`, () => expect(pageParams({ skip: value }, 30).skip).toBe(expected));
  for (const def of [1, 10, 30, 60, 100]) it(`mặc định ${def} được dùng khi không có limit`, () => expect(pageParams({}, def).limit).toBe(def));
});

describe('canViewContent — bảng chân trị đầy đủ (3 quyền × tác giả? × bạn? × chặn?)', () => {
  const privacies = ['public', 'friends', 'only_me', undefined] as const;
  for (const privacy of privacies) {
    for (const isAuthor of [true, false]) {
      for (const isFriend of [true, false]) {
        for (const isBlocked of [true, false]) {
          const expected = isAuthor ? true : isBlocked ? false : privacy === 'only_me' ? false : privacy === 'friends' ? isFriend : true;
          it(`quyền=${privacy ?? 'mặc định'} | tác giả=${isAuthor} | bạn=${isFriend} | chặn=${isBlocked} → ${expected}`, () => {
            const authorId = isAuthor ? 'me' : 'other';
            const friends = new Set(isFriend ? ['other'] : []);
            const blocked = new Set(isBlocked ? [authorId] : []);
            expect(canViewContent(authorId, 'me', privacy, friends, blocked)).toBe(expected);
          });
        }
      }
    }
  }
});

describe('ChatWindows — tin nhắn tới có mở hộp thoại không? (2×3×2×2×2 = 48 tổ hợp)', () => {
  const handlers = vi.hoisted(() => new Set<(p: unknown) => void>());
  const auth = vi.hoisted(() => ({ me: { id: 'me' } }));
  vi.mock('../../src/utils/socket', () => ({ getSocket: () => ({ on: (_e: string, fn: (p: unknown) => void) => handlers.add(fn), off: (_e: string, fn: (p: unknown) => void) => handlers.delete(fn) }) }));
  vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ currentUser: auth.me }) }));

  let Provider: typeof import('../../src/context/ChatWindowsContext').ChatWindowsProvider;
  let useWindows: typeof import('../../src/context/ChatWindowsContext').useChatWindows;
  beforeEach(async () => {
    handlers.clear();
    ({ ChatWindowsProvider: Provider, useChatWindows: useWindows } = await import('../../src/context/ChatWindowsContext'));
  });

  for (const sender of ['me', 'stranger'] as const) {
    for (const kind of ['text', 'system', 'text-recalled'] as const) {
      for (const desktop of [true, false]) {
        for (const alreadyOpen of [false, true]) {
          const opens = sender !== 'me' && kind === 'text' && desktop && !alreadyOpen;
          it(`gửi bởi ${sender} | ${kind} | ${desktop ? 'desktop' : 'mobile'} | ${alreadyOpen ? 'đã mở' : 'chưa mở'} → ${opens ? 'MỞ' : 'không mở'}`, () => {
            vi.stubGlobal('matchMedia', (q: string) => ({ matches: desktop && q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} }));
            const { result } = renderHook(() => useWindows(), { wrapper: ({ children }) => <Provider>{children}</Provider> });
            if (alreadyOpen) act(() => result.current.openChat('c1'));
            const before = JSON.stringify(result.current.windows);
            act(() => handlers.forEach((fn) => fn({ conversationId: 'c1', message: { senderId: sender, kind: kind === 'system' ? 'system' : 'text', isRecalled: kind === 'text-recalled' } })));
            if (opens) expect(result.current.windows).toEqual([{ conversationId: 'c1', minimized: false }]);
            else expect(JSON.stringify(result.current.windows)).toBe(before);
          });
        }
      }
    }
  }
});

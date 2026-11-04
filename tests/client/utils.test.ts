import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { timeAgo, feelingText, fileSize } from '../../src/utils/format';
import { detectMention, insertMention } from '../../src/utils/mention';
import { toggleId } from '../../src/components/FriendPicker';

// Test các hàm tiện ích thuần của frontend: định dạng thời gian / dung lượng / cảm xúc, gắn thẻ @tên, bật tắt id.

describe('timeAgo', () => {
  const NOW = new Date('2025-06-15T12:00:00Z').getTime();
  const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    [0, 'Vừa xong'],
    [9, 'Vừa xong'],
    [10, '10 giây trước'],
    [59, '59 giây trước'],
    [60, '1 phút trước'],
    [300, '5 phút trước'],
    [3599, '59 phút trước'],
    [3600, '1 giờ trước'],
    [3 * 3600, '3 giờ trước'],
    [86400, '1 ngày trước'],
    [2 * 86400, '2 ngày trước'],
    [7 * 86400, '1 tuần trước'],
    [14 * 86400, '2 tuần trước'],
    [29 * 86400, '4 tuần trước'],
    [30 * 86400, '1 tháng trước'],
    [364 * 86400, '11 tháng trước'],
    [365 * 86400, '1 năm trước'],
    [60 * 86400, '1 tháng trước'],
    [200 * 86400, '6 tháng trước'],
    [400 * 86400, '1 năm trước'],
    [3 * 365 * 86400, '3 năm trước'],
  ])('%i giây trước → "%s"', (seconds, expected) => {
    expect(timeAgo(ago(seconds))).toBe(expected);
  });

  it('thời điểm ở tương lai (lệch đồng hồ) → "Vừa xong", không ra số âm', () => {
    expect(timeAgo(new Date(NOW + 60_000).toISOString())).toBe('Vừa xong');
  });
  it('rỗng / undefined → chuỗi rỗng', () => {
    expect(timeAgo(undefined)).toBe('');
    expect(timeAgo('')).toBe('');
  });
  it('chuỗi ngày không hợp lệ → trả lại nguyên chuỗi, không "NaN"', () => {
    expect(timeAgo('không phải ngày')).toBe('không phải ngày');
  });
});

describe('feelingText', () => {
  it('thêm "đang cảm thấy" cho cảm xúc', () => expect(feelingText('hạnh phúc 😊')).toBe('đang cảm thấy hạnh phúc 😊'));
  it('giữ nguyên hoạt động bắt đầu bằng "đang "', () => expect(feelingText('đang du lịch ✈️')).toBe('đang du lịch ✈️'));
  it('không nhân đôi tiền tố', () => expect(feelingText('đang ăn 🍕')).not.toContain('đang cảm thấy'));
});

describe('fileSize', () => {
  it.each([
    [0, '0 B'],
    [1, '1 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024 - 1, '1024.0 KB'],
    [1024 * 1024, '1.0 MB'],
    [20 * 1024 * 1024, '20.0 MB'],
  ])('%i byte → "%s"', (bytes, expected) => expect(fileSize(bytes)).toBe(expected));
});

describe('detectMention', () => {
  it('đang gõ "@Ng" ở cuối → trả vị trí @ và chữ đang gõ', () => {
    expect(detectMention('xin chào @Ng', 12)).toEqual({ atIndex: 9, query: 'Ng' });
  });
  it('chỉ có "@" → query rỗng (hiện tất cả bạn bè)', () => {
    expect(detectMention('@', 1)).toEqual({ atIndex: 0, query: '' });
    expect(detectMention('hi @', 4)).toEqual({ atIndex: 3, query: '' });
  });
  it('"@" ở đầu văn bản và sau xuống dòng', () => {
    expect(detectMention('@abc', 4)).toEqual({ atIndex: 0, query: 'abc' });
    expect(detectMention('dòng 1\n@xyz', 11)).toEqual({ atIndex: 7, query: 'xyz' });
  });
  it('nhận chữ tiếng Việt có dấu và số', () => {
    expect(detectMention('@Nguyễn', 7)?.query).toBe('Nguyễn');
    expect(detectMention('@abc123', 7)?.query).toBe('abc123');
  });
  it('địa chỉ email (a@b) KHÔNG phải gắn thẻ', () => {
    expect(detectMention('liên hệ a@b.vn', 14)).toBeNull();
    expect(detectMention('a@b', 3)).toBeNull();
  });
  it('đã gõ khoảng trắng sau tên → thôi gắn thẻ', () => {
    expect(detectMention('@Nam ', 5)).toBeNull();
  });
  it('không có @ → null; con trỏ nằm TRƯỚC @ → null', () => {
    expect(detectMention('không có gì', 5)).toBeNull();
    expect(detectMention('abc @Nam', 3)).toBeNull();
  });
  it('con trỏ ở giữa: chỉ xét phần trước con trỏ', () => {
    expect(detectMention('@Nam đi chơi', 4)).toEqual({ atIndex: 0, query: 'Nam' });
  });
});

describe('insertMention', () => {
  it('thay "@Ng" bằng "@Tên đầy đủ " và đặt con trỏ ngay sau', () => {
    const text = 'chào @Ng';
    const r = insertMention(text, 5, 8, 'Nguyễn Văn An');
    expect(r.text).toBe('chào @Nguyễn Văn An ');
    expect(r.cursor).toBe(r.text.length);
  });
  it('giữ nguyên phần chữ phía sau con trỏ', () => {
    const r = insertMention('chào @Ng ơi', 5, 8, 'Lan');
    expect(r.text.startsWith('chào @Lan ')).toBe(true);
    expect(r.text.endsWith('ơi')).toBe(true);
    expect(r.cursor).toBe('chào @Lan '.length);
  });
});

describe('toggleId', () => {
  it('thêm id chưa có', () => expect(toggleId(['a'], 'b')).toEqual(['a', 'b']));
  it('bỏ id đã có', () => expect(toggleId(['a', 'b'], 'a')).toEqual(['b']));
  it('không làm thay đổi mảng gốc', () => {
    const original = ['a'];
    toggleId(original, 'b');
    expect(original).toEqual(['a']);
  });
  it('bật rồi tắt lại về trạng thái cũ', () => expect(toggleId(toggleId([], 'x'), 'x')).toEqual([]));
});

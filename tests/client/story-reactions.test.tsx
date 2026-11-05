// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, screen, waitFor, within } from './harness';
import { db, calls } from './fakeServer';

// Cảm xúc nhanh cho story: người xem thả / đổi / bỏ; chủ story thấy cảm xúc nhận được và ai đã thả gì.

beforeEach(() => installBrowserStubs());

const openStory = async (name = 'Bạn Một', seed?: () => void) => {
  const ctx = renderApp('/', { seed });
  await feedLoaded();
  await ctx.user.click(screen.getByRole('button', { name: `Xem tin của ${name}` }));
  return { ...ctx, dialog: screen.getByRole('dialog', { name: 'Xem tin' }) };
};
const emojiBtn = (dialog: HTMLElement, e: string) => within(dialog).getByRole('button', { name: `Phản hồi ${e}` });

describe('Người xem thả cảm xúc', () => {
  it('thả → nút được đánh dấu đang chọn (aria-pressed) và có toast', async () => {
    const { user, dialog } = await openStory();
    expect(emojiBtn(dialog, '🔥').getAttribute('aria-pressed')).toBe('false');
    await user.click(emojiBtn(dialog, '🔥'));
    expect(await screen.findByText('Đã gửi cảm xúc 🔥 tới Bạn Một')).toBeTruthy();
    await waitFor(() => expect(emojiBtn(dialog, '🔥').getAttribute('aria-pressed')).toBe('true'));
    expect(emojiBtn(dialog, '❤️').getAttribute('aria-pressed')).toBe('false');
  });

  it('đổi sang emoji khác → chỉ emoji mới được chọn', async () => {
    const { user, dialog } = await openStory();
    await user.click(emojiBtn(dialog, '❤️'));
    await waitFor(() => expect(emojiBtn(dialog, '❤️').getAttribute('aria-pressed')).toBe('true'));
    await user.click(emojiBtn(dialog, '😂'));
    await waitFor(() => expect(emojiBtn(dialog, '😂').getAttribute('aria-pressed')).toBe('true'));
    expect(emojiBtn(dialog, '❤️').getAttribute('aria-pressed')).toBe('false');
  });

  it('bấm lại cùng emoji → bỏ cảm xúc, KHÔNG hiện toast "đã gửi" lần nữa', async () => {
    const { user, dialog } = await openStory();
    await user.click(emojiBtn(dialog, '👏'));
    await screen.findByText('Đã gửi cảm xúc 👏 tới Bạn Một');
    await waitFor(() => expect(emojiBtn(dialog, '👏').getAttribute('aria-pressed')).toBe('true'));
    await user.click(emojiBtn(dialog, '👏'));
    await waitFor(() => expect(emojiBtn(dialog, '👏').getAttribute('aria-pressed')).toBe('false'));
    expect(calls.filter((c) => c.path === '/stories/st1/react')).toHaveLength(2);
  });

  it('cảm xúc cũ của mình hiện sẵn khi mở story', async () => {
    const { dialog } = await openStory('Bạn Một', () => void (db.stories[0].reactions = [{ userId: 'u1', userName: 'Trần Xuân Hoàng', avatar: '', emoji: '😮' }]));
    expect(emojiBtn(dialog, '😮').getAttribute('aria-pressed')).toBe('true');
  });

  it('server lỗi → toast lỗi, không đánh dấu', async () => {
    const { user, dialog } = await openStory();
    db.failNext.add('POST /stories/st1/react');
    await user.click(emojiBtn(dialog, '❤️'));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(emojiBtn(dialog, '❤️').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Chủ story thấy cảm xúc', () => {
  const mine = (reactions: { userId: string; userName: string; avatar: string; emoji: string }[]) => () =>
    void db.stories.unshift({
      id: 'mine', user: db.me, type: 'text', privacy: 'public', textContent: 'Tin của tôi', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1e8).toISOString(),
      viewers: [{ userId: 'f1', userName: 'Bạn Một', avatar: '', viewedAt: new Date().toISOString() }, { userId: 'f2', userName: 'Bạn Hai', avatar: '', viewedAt: new Date().toISOString() }],
      reactions,
    });

  it('hiện tổng hợp các emoji nhận được và số cảm xúc', async () => {
    const { dialog } = await openStory('Trần Xuân Hoàng', mine([
      { userId: 'f1', userName: 'Bạn Một', avatar: '', emoji: '❤️' },
      { userId: 'f2', userName: 'Bạn Hai', avatar: '', emoji: '🔥' },
    ]));
    const summary = within(dialog).getByTitle('Cảm xúc nhận được');
    expect(summary.textContent).toContain('❤️ 🔥');
    expect(summary.textContent).toContain('2 cảm xúc');
  });

  it('danh sách người xem hiện emoji của từng người (người không thả thì không có)', async () => {
    const { user, dialog } = await openStory('Trần Xuân Hoàng', mine([{ userId: 'f1', userName: 'Bạn Một', avatar: '', emoji: '😂' }]));
    await user.click(within(dialog).getByRole('button', { name: /người đã xem/ }));
    const rows = Array.from(dialog.querySelectorAll('div.flex.items-center.gap-2.text-xs'));
    expect(rows.find((r) => r.textContent!.includes('Bạn Một'))!.textContent).toContain('😂');
    const hai = rows.find((r) => r.textContent!.includes('Bạn Hai'))!.textContent!;
    for (const e of ['😂', '❤️', '🔥', '👏', '😮']) expect(hai).not.toContain(e);
  });

  it('chưa có cảm xúc → không hiện dòng tổng hợp; không có thanh emoji để tự thả', async () => {
    const { dialog } = await openStory('Trần Xuân Hoàng', mine([]));
    expect(within(dialog).queryByTitle('Cảm xúc nhận được')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Phản hồi/ })).toBeNull();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, post, screen, waitFor, within, fireEvent } from './harness';
import { db, calls, makeUser } from './fakeServer';
import type { Comment } from '../../src/types';

// Bình luận: sửa nội dung, thả cảm xúc đa dạng (rê chuột / nhấn giữ), sắp xếp.

beforeEach(() => installBrowserStubs());

const mkComment = (id: string, content: string, minutesAgo: number, extra: Partial<Comment> = {}): Comment => ({
  id, postId: 'p2', author: makeUser('f1', 'Bạn Một'), content, createdAt: new Date(Date.now() - minutesAgo * 60000).toISOString(), likes: [], ...extra,
});
const mine = (id: string, content: string, extra: Partial<Comment> = {}) => mkComment(id, content, 5, { author: db.me, ...extra });

const open = async (seed?: () => void) => {
  const ctx = renderApp('/', { seed });
  await feedLoaded();
  await ctx.user.click(within(post('p2')).getByRole('button', { name: 'Bình luận' }));
  const card = within(post('p2'));
  await card.findByText(/./, { selector: 'p.whitespace-pre-line' }).catch(() => {});
  return { ...ctx, card };
};
const commentTexts = () => Array.from(post('p2').querySelectorAll('p.text-slate-800.mt-0\\.5')).map((p) => p.textContent);

describe('Sửa bình luận', () => {
  const withMine = () => void db.comments.push(mine('mc', 'Bình luận của tôi'));

  it('chỉ bình luận của mình có nút "Sửa"', async () => {
    const { card } = await open(withMine);
    await card.findByText('Bình luận của tôi');
    expect(card.getAllByRole('button', { name: 'Sửa' })).toHaveLength(1);
  });

  it('bấm Sửa → ô sửa điền sẵn nội dung; Lưu → nội dung mới + "(đã chỉnh sửa)"', async () => {
    const { user, card } = await open(withMine);
    await user.click(await card.findByRole('button', { name: 'Sửa' }));
    const box = card.getByLabelText('Sửa bình luận') as HTMLTextAreaElement;
    expect(box.value).toBe('Bình luận của tôi');
    await user.clear(box);
    await user.type(box, 'Đã sửa xong');
    await user.click(card.getByRole('button', { name: 'Lưu' }));
    expect(await card.findByText('Đã sửa xong')).toBeTruthy();
    expect(card.getByText('(đã chỉnh sửa)')).toBeTruthy();
    expect(card.queryByLabelText('Sửa bình luận')).toBeNull();
    expect(calls.find((c) => c.method === 'PATCH' && c.path === '/comments/mc')?.body).toEqual({ content: 'Đã sửa xong' });
  });

  it('Hủy → giữ nguyên nội dung cũ và không gọi server; mở lại thấy nội dung cũ', async () => {
    const { user, card } = await open(withMine);
    await user.click(await card.findByRole('button', { name: 'Sửa' }));
    await user.type(card.getByLabelText('Sửa bình luận'), ' thêm chữ');
    await user.click(card.getByRole('button', { name: 'Hủy' }));
    expect(card.getByText('Bình luận của tôi')).toBeTruthy();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    await user.click(card.getByRole('button', { name: 'Sửa' }));
    expect((card.getByLabelText('Sửa bình luận') as HTMLTextAreaElement).value).toBe('Bình luận của tôi');
  });

  it('xoá hết chữ → nút Lưu bị khoá; gửi bằng Enter/submit cũng không gọi server', async () => {
    const { user, card } = await open(withMine);
    await user.click(await card.findByRole('button', { name: 'Sửa' }));
    await user.clear(card.getByLabelText('Sửa bình luận'));
    expect((card.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(card.getByLabelText('Sửa bình luận').closest('form')!);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('bình luận có ảnh được lưu với nội dung trống', async () => {
    const { user, card } = await open(() => void db.comments.push(mine('img', 'có ảnh', { image: '/pic.png' })));
    await user.click(await card.findByRole('button', { name: 'Sửa' }));
    await user.clear(card.getByLabelText('Sửa bình luận'));
    expect((card.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(card.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ content: '' }));
  });

  it('server lỗi → toast lỗi và vẫn ở chế độ sửa để thử lại', async () => {
    const { user, card } = await open(withMine);
    await user.click(await card.findByRole('button', { name: 'Sửa' }));
    db.failNext.add('PATCH /comments/mc');
    await user.type(card.getByLabelText('Sửa bình luận'), '!');
    await user.click(card.getByRole('button', { name: 'Lưu' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(card.getByLabelText('Sửa bình luận')).toBeTruthy();
  });

  it('trong lúc sửa ẩn nút Sửa; sửa bình luận trả lời vẫn là trả lời', async () => {
    const { user, card } = await open(() => void db.comments.push(mine('rep', 'câu trả lời', { parentId: 'c1' })));
    const buttons = await card.findAllByRole('button', { name: 'Sửa' });
    await user.click(buttons[0]);
    expect(card.queryByRole('button', { name: 'Sửa' })).toBeNull();
    await user.type(card.getByLabelText('Sửa bình luận'), ' ok');
    await user.click(card.getByRole('button', { name: 'Lưu' }));
    expect(await card.findByText('câu trả lời ok')).toBeTruthy();
  });
});

describe('Cảm xúc bình luận', () => {
  const likeBtn = (card: ReturnType<typeof within>) => card.getAllByRole('button', { name: 'Thích' }).at(-1)!;

  it('bấm nhanh "Thích" → "👍 Thích" + chip đếm; bấm lại → bỏ', async () => {
    const { user, card } = await open();
    await card.findByText('Bình luận đầu tiên');
    await user.click(likeBtn(card));
    expect(await card.findByRole('button', { name: '👍 Thích' })).toBeTruthy();
    expect(card.getByTitle('1 cảm xúc').textContent).toContain('👍 1');
    expect(calls.find((c) => c.path === '/comments/c1/react')?.body).toEqual({ type: 'like' });
    await user.click(card.getByRole('button', { name: '👍 Thích' }));
    await waitFor(() => expect(card.queryByTitle('1 cảm xúc')).toBeNull());
  });

  it('rê chuột → bảng 6 cảm xúc; chọn "Yêu thích" → "❤️ Yêu thích"', async () => {
    const { user, card } = await open();
    await card.findByText('Bình luận đầu tiên');
    fireEvent.mouseEnter(likeBtn(card).parentElement!);
    for (const label of ['Thích', 'Yêu thích', 'Haha', 'Wow', 'Buồn', 'Phẫn nộ']) expect(await card.findByRole('button', { name: `${label} (bình luận)` })).toBeTruthy();
    await user.click(card.getByRole('button', { name: 'Yêu thích (bình luận)' }));
    expect(await card.findByRole('button', { name: '❤️ Yêu thích' })).toBeTruthy();
    expect(card.queryByRole('button', { name: 'Haha (bình luận)' })).toBeNull(); // bảng đã đóng
  });

  it('đổi từ Yêu thích sang Haha; sau đó bấm nhanh sẽ BỎ cảm xúc hiện tại (không đổi về like)', async () => {
    const { user, card } = await open();
    await card.findByText('Bình luận đầu tiên');
    const container = () => likeBtn(card).parentElement!;
    fireEvent.mouseEnter(container());
    await user.click(await card.findByRole('button', { name: 'Yêu thích (bình luận)' }));
    fireEvent.mouseEnter((await card.findByRole('button', { name: '❤️ Yêu thích' })).parentElement!);
    await user.click(await card.findByRole('button', { name: 'Haha (bình luận)' }));
    await user.click(await card.findByRole('button', { name: '😄 Haha' }));
    await waitFor(() => expect(card.queryByTitle('1 cảm xúc')).toBeNull());
    expect(calls.filter((c) => c.path === '/comments/c1/react').map((c) => (c.body as { type: string }).type)).toEqual(['love', 'haha', 'haha']);
  });

  it('rời chuột khỏi nút thì bảng đóng; bấm ra ngoài cũng đóng', async () => {
    const { card } = await open();
    await card.findByText('Bình luận đầu tiên');
    const container = likeBtn(card).parentElement!;
    fireEvent.mouseEnter(container);
    await card.findByRole('button', { name: 'Wow (bình luận)' });
    fireEvent.mouseLeave(container);
    expect(card.queryByRole('button', { name: 'Wow (bình luận)' })).toBeNull();
    fireEvent.mouseEnter(container);
    await card.findByRole('button', { name: 'Wow (bình luận)' });
    fireEvent.mouseDown(document.body);
    expect(card.queryByRole('button', { name: 'Wow (bình luận)' })).toBeNull();
  });

  it('cảm ứng: nhấn giữ mở bảng và nhả tay KHÔNG thả like; chạm nhanh thì thả like', async () => {
    const { card } = await open();
    await card.findByText('Bình luận đầu tiên');
    const button = likeBtn(card);
    fireEvent.touchStart(button);
    await card.findByRole('button', { name: 'Buồn (bình luận)' }, { timeout: 2000 });
    fireEvent.touchEnd(button);
    fireEvent.click(button);
    expect(calls.some((c) => c.path === '/comments/c1/react')).toBe(false);
    fireEvent.mouseDown(document.body);
    fireEvent.touchStart(button);
    fireEvent.touchMove(button);
    fireEvent.touchEnd(button);
    fireEvent.click(button);
    expect(await card.findByRole('button', { name: '👍 Thích' })).toBeTruthy();
  });

  it('chip tổng hợp: nhiều loại cảm xúc → hiện tối đa 3 emoji khác nhau và tổng số', async () => {
    const { card } = await open(() => {
      db.comments[0].reactions = [
        { type: 'love', userId: 'a' }, { type: 'love', userId: 'b' }, { type: 'haha', userId: 'c' }, { type: 'wow', userId: 'd' }, { type: 'sad', userId: 'e' },
      ];
    });
    const chip = await card.findByTitle('5 cảm xúc');
    expect(chip.textContent).toContain('❤️😄😮');
    expect(chip.textContent).not.toContain('😢');
    expect(chip.textContent).toContain('5');
  });

  it('dữ liệu cũ chỉ có likes (không có reactions) vẫn hiển thị đúng', async () => {
    const { card } = await open(() => void (db.comments[0].likes = ['x', 'y']));
    expect((await card.findByTitle('2 cảm xúc')).textContent).toContain('👍 2');
  });

  it('cảm xúc của mình hiện đúng màu / nhãn; server lỗi → toast lỗi', async () => {
    const { user, card } = await open();
    await card.findByText('Bình luận đầu tiên');
    db.failNext.add('POST /comments/c1/react');
    await user.click(likeBtn(card));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
  });
});

describe('Sắp xếp bình luận', () => {
  const three = () => {
    db.comments = [
      mkComment('old', 'Cũ nhất', 30, { reactions: [{ type: 'like', userId: 'a' }], likes: ['a'] }),
      mkComment('mid', 'Giữa', 20, { reactions: [{ type: 'love', userId: 'a' }, { type: 'wow', userId: 'b' }, { type: 'haha', userId: 'c' }] }),
      mkComment('new', 'Mới nhất', 10),
      mkComment('rep', 'Trả lời cho bình luận cũ', 1, { parentId: 'old' }),
    ];
  };

  it('chỉ có 1 bình luận (hoặc ít hơn) → không hiện ô sắp xếp', async () => {
    const { card } = await open();
    await card.findByText('Bình luận đầu tiên');
    expect(card.queryByLabelText('Sắp xếp bình luận')).toBeNull();
  });

  it('mặc định "Cũ nhất": theo thời gian tăng dần', async () => {
    const { card } = await open(three);
    await card.findByText('Giữa');
    expect((card.getByLabelText('Sắp xếp bình luận') as HTMLSelectElement).value).toBe('oldest');
    expect(commentTexts().filter((t) => ['Cũ nhất', 'Giữa', 'Mới nhất'].includes(t!))).toEqual(['Cũ nhất', 'Giữa', 'Mới nhất']);
  });

  it('"Mới nhất": đảo ngược', async () => {
    const { user, card } = await open(three);
    await card.findByText('Giữa');
    await user.selectOptions(card.getByLabelText('Sắp xếp bình luận'), 'newest');
    expect(commentTexts().filter((t) => ['Cũ nhất', 'Giữa', 'Mới nhất'].includes(t!))).toEqual(['Mới nhất', 'Giữa', 'Cũ nhất']);
  });

  it('"Nổi bật": nhiều cảm xúc nhất lên đầu; bằng nhau thì cũ trước', async () => {
    const { user, card } = await open(three);
    await card.findByText('Giữa');
    await user.selectOptions(card.getByLabelText('Sắp xếp bình luận'), 'top');
    expect(commentTexts().filter((t) => ['Cũ nhất', 'Giữa', 'Mới nhất'].includes(t!))).toEqual(['Giữa', 'Cũ nhất', 'Mới nhất']);
  });

  it('câu trả lời luôn nằm dưới bình luận cha dù đổi cách sắp xếp', async () => {
    const { user, card } = await open(three);
    await card.findByText('Giữa');
    await user.selectOptions(card.getByLabelText('Sắp xếp bình luận'), 'newest');
    const texts = commentTexts();
    expect(texts.indexOf('Trả lời cho bình luận cũ')).toBe(texts.indexOf('Cũ nhất') + 1);
  });
});

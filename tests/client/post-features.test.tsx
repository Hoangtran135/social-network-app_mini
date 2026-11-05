// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { installBrowserStubs, renderApp, feedLoaded, post, screen, waitFor, within, fireEvent } from './harness';
import { db, calls, apiModule } from './fakeServer';
import { splitHashtags, parseTagQuery } from '../../src/utils/hashtag';

// Tính năng bài viết: hashtag + trang theo tag, check-in vị trí, chia sẻ kèm lời bình, lịch sử chỉnh sửa, tắt bình luận, ẩn bài.

beforeEach(() => installBrowserStubs());
type Ctx = ReturnType<typeof renderApp>;
const menu = (user: Ctx['user'], id: string) => user.click(within(post(id)).getByRole('button', { name: 'Tuỳ chọn bài viết' }));
const openForm = async (user: Ctx['user']) => {
  await feedLoaded();
  await user.click(screen.getByText('Trần Xuân Hoàng ơi, bạn đang nghĩ gì thế?'));
  return screen.getByRole('dialog', { name: 'Đăng bài' });
};

describe('splitHashtags / parseTagQuery', () => {
  const cases: [string, unknown[]][] = [
    ['xin chào', [{ type: 'text', text: 'xin chào' }]],
    ['#a', [{ type: 'tag', label: '#a', tag: 'a' }]],
    ['vui #Vui thế', [{ type: 'text', text: 'vui ' }, { type: 'tag', label: '#Vui', tag: 'vui' }, { type: 'text', text: ' thế' }]],
    ['#một #hai', [{ type: 'tag', label: '#một', tag: 'một' }, { type: 'text', text: ' ' }, { type: 'tag', label: '#hai', tag: 'hai' }]],
    ['dòng 1\n#dong2!', [{ type: 'text', text: 'dòng 1\n' }, { type: 'tag', label: '#dong2', tag: 'dong2' }, { type: 'text', text: '!' }]],
    ['abc#def', [{ type: 'text', text: 'abc#def' }]],
    ['a.com/#top', [{ type: 'text', text: 'a.com/#top' }]],
    ['##x', [{ type: 'text', text: '##x' }]],
    ['(#ngoặc)', [{ type: 'text', text: '(' }, { type: 'tag', label: '#ngoặc', tag: 'ngoặc' }, { type: 'text', text: ')' }]],
    ['', []],
    ['#', [{ type: 'text', text: '#' }]],
  ];
  it.each(cases)('%j', (text, expected) => expect(splitHashtags(text)).toEqual(expected));

  it('ghép lại các đoạn luôn ra đúng nội dung gốc', () => {
    const text = 'Chuyến đi #ĐàLạt rất #vui, giá 100#k, xem a.com/#x\n#cuối';
    const joined = splitHashtags(text).map((p) => (p.type === 'tag' ? p.label : p.text)).join('');
    expect(joined).toBe(text);
  });

  it.each([['#vui', 'vui'], [' #Vui ', 'vui'], ['#HàNội', 'hànội'], ['vui', ''], ['#', ''], ['# vui', ''], ['#a b', ''], ['#a-b', ''], ['', ''], ['#' + 'x'.repeat(51), '']])('parseTagQuery(%j) → "%s"', (q, expected) => expect(parseTagQuery(q)).toBe(expected));
});

describe('Hashtag trong bài viết', () => {
  const withTags = () => {
    db.posts[0].content = 'Cuối tuần #vui #DuLịch nhé';
    db.posts[0].hashtags = ['vui', 'dulịch'];
    db.posts[1].content = 'Bài khác cũng #vui';
    db.posts[1].hashtags = ['vui'];
  };

  it('hashtag trong nội dung thành liên kết, phần còn lại giữ nguyên', async () => {
    renderApp('/', { seed: withTags });
    await screen.findByText(/Cuối tuần/);
    const card = within(post('p1'));
    expect(card.getByRole('link', { name: '#vui' }).getAttribute('href')).toBe('/hashtag/vui');
    expect(card.getByRole('link', { name: '#DuLịch' }).getAttribute('href')).toBe(`/hashtag/${encodeURIComponent('dulịch')}`);
    expect(post('p1').textContent).toContain('Cuối tuần #vui #DuLịch nhé');
  });

  it('bấm hashtag → trang /hashtag/vui chỉ có các bài có tag đó', async () => {
    const { user, location } = renderApp('/', { seed: withTags });
    await screen.findByText(/Cuối tuần/);
    await user.click(within(post('p1')).getByRole('link', { name: '#vui' }));
    await waitFor(() => expect(location()).toBe('/hashtag/vui'));
    expect(await screen.findByRole('heading', { name: '#vui', level: 1 })).toBeTruthy();
    expect(await screen.findByText('2 bài viết')).toBeTruthy();
    expect(screen.queryByText('Bài của người lạ')).toBeNull();
    expect(calls.some((c) => c.path === '/posts?tag=vui&limit=50')).toBe(true);
  });

  it('trang hashtag: tag không có bài → màn hình trống', async () => {
    renderApp('/hashtag/khongco');
    expect(await screen.findByText('Chưa có bài viết nào')).toBeTruthy();
    expect(screen.getByText(/Chưa có ai đăng bài với #khongco/)).toBeTruthy();
  });

  it('trang hashtag: khung xương khi đang tải, rồi hiện bài', async () => {
    const original = apiModule.api.get;
    let release!: () => void;
    apiModule.api.get = (p: string) => (p.startsWith('/posts?tag=') ? new Promise((r) => (release = () => r(original(p)))) : original(p));
    renderApp('/hashtag/vui', { seed: withTags });
    expect(await screen.findByRole('status', { name: 'Đang tải bài viết' })).toBeTruthy();
    expect(screen.getByText('Đang tải...')).toBeTruthy();
    release();
    expect(await screen.findByText(/Cuối tuần/)).toBeTruthy();
    apiModule.api.get = original;
  });

  it('trang hashtag: lỗi tải → coi như không có bài, không sập', async () => {
    renderApp('/hashtag/vui', { seed: () => void db.failNext.add('GET /posts') });
    expect(await screen.findByText('Chưa có bài viết nào')).toBeTruthy();
  });

  it('trang hashtag: thả cảm xúc vẫn cập nhật bài ngay trên trang', async () => {
    const { user } = renderApp('/hashtag/vui', { seed: withTags });
    await screen.findByText(/Cuối tuần/);
    await user.click(within(post('p1')).getByRole('button', { name: 'Thích' }));
    expect(await within(post('p1')).findByText('👍 Thích')).toBeTruthy();
  });

  it('trang hashtag: nút quay về bảng tin; đổi tag tải lại', async () => {
    const { user, location } = renderApp('/hashtag/vui', { seed: withTags });
    await screen.findByText(/Cuối tuần/);
    await user.click(screen.getByRole('link', { name: 'Về bảng tin' }));
    expect(location()).toBe('/');
  });

  it('gõ #tag vào ô tìm kiếm → gợi ý "Xem bài viết có #tag" dẫn tới trang hashtag', async () => {
    const { user, location } = renderApp('/');
    await feedLoaded();
    await user.type(screen.getByRole('searchbox'), '#Vui');
    await user.click(await screen.findByRole('link', { name: /Xem bài viết có #vui/ }));
    await waitFor(() => expect(location()).toBe('/hashtag/vui'));
  });

  it('gõ chữ thường (không có #) thì không có gợi ý hashtag', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.type(screen.getByRole('searchbox'), 'vui');
    await screen.findByText(/Mọi người|Không tìm thấy/);
    expect(screen.queryByText(/Xem bài viết có #/)).toBeNull();
  });

  it('đăng bài có hashtag → hiện thành liên kết ngay', async () => {
    const { user } = renderApp('/');
    const dialog = await openForm(user);
    await user.type(within(dialog).getByRole('textbox'), 'Bài mới #hocreact');
    await user.click(within(dialog).getByRole('button', { name: 'Đăng bài viết' }));
    expect(await screen.findByRole('link', { name: '#hocreact' })).toBeTruthy();
  });
});

describe('Check-in vị trí', () => {
  it('mở ô vị trí, nhập, hiện "tại ..." trong hộp thoại và gửi lên server', async () => {
    const { user } = renderApp('/');
    const dialog = await openForm(user);
    await user.click(within(dialog).getByTitle('Check-in'));
    await user.type(within(dialog).getByLabelText('Vị trí'), 'Hồ Gươm');
    expect(within(dialog).getByText(/tại Hồ Gươm/)).toBeTruthy();
    await user.type(within(dialog).getByRole('textbox', { name: '' }), 'Dạo phố');
    await user.click(within(dialog).getByRole('button', { name: 'Đăng bài viết' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/posts')?.body).toMatchObject({ location: 'Hồ Gươm' }));
    expect(await screen.findByText(/📍 Hồ Gươm/)).toBeTruthy();
  });

  it('không nhập vị trí → không gửi trường location', async () => {
    const { user } = renderApp('/');
    const dialog = await openForm(user);
    await user.type(within(dialog).getByRole('textbox'), 'Không vị trí');
    await user.click(within(dialog).getByRole('button', { name: 'Đăng bài viết' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/posts')).toBe(true));
    expect((calls.find((c) => c.method === 'POST' && c.path === '/posts')?.body as { location?: string }).location).toBeUndefined();
  });

  it('mở / đóng ô vị trí lặp lại', async () => {
    const { user } = renderApp('/');
    const dialog = await openForm(user);
    await user.click(within(dialog).getByTitle('Check-in'));
    expect(within(dialog).getByLabelText('Vị trí')).toBeTruthy();
    await user.click(within(dialog).getByTitle('Check-in'));
    expect(within(dialog).queryByLabelText('Vị trí')).toBeNull();
  });

  it('sửa bài: điền sẵn vị trí cũ, xoá vị trí → gửi chuỗi rỗng', async () => {
    const { user } = renderApp('/', { seed: () => void (db.posts[1].location = 'Đà Lạt') });
    await feedLoaded();
    await menu(user, 'p2');
    await user.click(within(post('p2')).getByText('Chỉnh sửa bài viết'));
    const dialog = screen.getByRole('dialog', { name: 'Đăng bài' });
    await user.click(within(dialog).getByTitle('Check-in'));
    const input = within(dialog).getByLabelText('Vị trí') as HTMLInputElement;
    expect(input.value).toBe('Đà Lạt');
    await user.clear(input);
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.path === '/posts/p2')?.body).toMatchObject({ location: '' }));
  });
});

describe('Chia sẻ kèm lời bình', () => {
  const openShare = async (user: Ctx['user']) => {
    await feedLoaded();
    await user.click(within(post('p1')).getByRole('button', { name: 'Chia sẻ' }));
    await user.click(within(post('p1')).getByText('Chia sẻ lên trang cá nhân'));
    return screen.getByRole('dialog', { name: 'Chia sẻ bài viết' });
  };

  it('hiện bản xem trước bài gốc; chia sẻ kèm lời bình → gửi message lên server', async () => {
    const { user } = renderApp('/');
    const dialog = await openShare(user);
    expect(within(dialog).getByText('Bài của bạn một')).toBeTruthy();
    await user.type(within(dialog).getByPlaceholderText(/Hãy nói gì đó/), 'Mình rất thích');
    await user.click(within(dialog).getByRole('button', { name: 'Chia sẻ ngay' }));
    expect(await screen.findByText('Đã chia sẻ bài viết lên trang cá nhân của bạn!')).toBeTruthy();
    expect(calls.find((c) => c.path === '/posts/p1/share')?.body).toEqual({ message: 'Mình rất thích' });
    expect(await screen.findByText(/Mình rất thích/)).toBeTruthy();
  });

  it('không nhập lời bình (hoặc chỉ khoảng trắng) → chia sẻ không có message', async () => {
    const { user } = renderApp('/');
    const dialog = await openShare(user);
    await user.type(within(dialog).getByPlaceholderText(/Hãy nói gì đó/), '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Chia sẻ ngay' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/posts/p1/share')?.body).toEqual({}));
  });

  it('đóng bằng nút X / Esc / bấm nền → không chia sẻ', async () => {
    const { user } = renderApp('/');
    let dialog = await openShare(user);
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog', { name: 'Chia sẻ bài viết' })).toBeNull();
    dialog = await (async () => {
      await user.click(within(post('p1')).getByRole('button', { name: 'Chia sẻ' }));
      await user.click(within(post('p1')).getByText('Chia sẻ lên trang cá nhân'));
      return screen.getByRole('dialog', { name: 'Chia sẻ bài viết' });
    })();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Chia sẻ bài viết' })).toBeNull();
    await user.click(within(post('p1')).getByRole('button', { name: 'Chia sẻ' }));
    await user.click(within(post('p1')).getByText('Chia sẻ lên trang cá nhân'));
    fireEvent.click(screen.getByRole('dialog', { name: 'Chia sẻ bài viết' }).parentElement!);
    expect(screen.queryByRole('dialog', { name: 'Chia sẻ bài viết' })).toBeNull();
    expect(calls.some((c) => c.path === '/posts/p1/share')).toBe(false);
    void dialog;
  });
});

describe('Lịch sử chỉnh sửa', () => {
  const edited = () => {
    Object.assign(db.posts[1], { content: 'Bản 3', updatedAt: new Date().toISOString(), editHistory: [{ content: 'Bản 1', editedAt: new Date(Date.now() - 7200000).toISOString() }, { content: 'Bản 2', editedAt: new Date(Date.now() - 3600000).toISOString() }] });
  };

  it('nhãn "(đã chỉnh sửa)" là nút mở lịch sử: phiên bản hiện tại + các bản cũ (mới → cũ)', async () => {
    const { user } = renderApp('/', { seed: edited });
    await feedLoaded();
    await user.click(within(post('p2')).getByRole('button', { name: '(đã chỉnh sửa)' }));
    const dialog = screen.getByRole('dialog', { name: 'Lịch sử chỉnh sửa' });
    expect(within(dialog).getByText(/Phiên bản hiện tại/)).toBeTruthy();
    const old = within(dialog).getAllByText(/Phiên bản cũ/);
    expect(old).toHaveLength(2);
    expect(within(dialog).getByText('Bản 3')).toBeTruthy();
    const text = dialog.textContent!;
    expect(text.indexOf('Bản 2')).toBeLessThan(text.indexOf('Bản 1'));
  });

  it('chỉ đổi quyền riêng tư (không có phiên bản cũ) → giải thích', async () => {
    const { user } = renderApp('/', { seed: () => void (db.posts[1].updatedAt = new Date().toISOString()) });
    await feedLoaded();
    await user.click(within(post('p2')).getByRole('button', { name: '(đã chỉnh sửa)' }));
    expect(screen.getByText(/không có phiên bản nội dung cũ/)).toBeTruthy();
  });

  it('đóng bằng X, Esc, bấm nền', async () => {
    const { user } = renderApp('/', { seed: edited });
    await feedLoaded();
    const open = () => user.click(within(post('p2')).getByRole('button', { name: '(đã chỉnh sửa)' }));
    await open();
    await user.click(within(screen.getByRole('dialog', { name: 'Lịch sử chỉnh sửa' })).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog', { name: 'Lịch sử chỉnh sửa' })).toBeNull();
    await open();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Lịch sử chỉnh sửa' })).toBeNull();
    await open();
    fireEvent.click(screen.getByRole('dialog', { name: 'Lịch sử chỉnh sửa' }).parentElement!);
    expect(screen.queryByRole('dialog', { name: 'Lịch sử chỉnh sửa' })).toBeNull();
  });

  it('sửa bài thật qua giao diện → lịch sử có bản cũ', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await menu(user, 'p2');
    await user.click(within(post('p2')).getByText('Chỉnh sửa bài viết'));
    const dialog = screen.getByRole('dialog', { name: 'Đăng bài' });
    const box = within(dialog).getByRole('textbox') as HTMLTextAreaElement;
    await user.clear(box);
    await user.type(box, 'Bản mới');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await user.click(await within(post('p2')).findByRole('button', { name: '(đã chỉnh sửa)' }));
    expect(within(screen.getByRole('dialog', { name: 'Lịch sử chỉnh sửa' })).getByText('Bài của tôi')).toBeTruthy();
  });

  it('bài có phiên bản cũ rỗng (chỉ ảnh) hiện nhãn thay thế', async () => {
    const { user } = renderApp('/', { seed: () => void Object.assign(db.posts[1], { content: '', updatedAt: new Date().toISOString(), editHistory: [{ content: '', editedAt: new Date().toISOString() }] }) });
    await feedLoaded();
    await user.click(within(post('p2')).getByRole('button', { name: '(đã chỉnh sửa)' }));
    expect(screen.getAllByText('(không có nội dung chữ)')).toHaveLength(2);
  });
});

describe('Tắt / bật bình luận', () => {
  it('chủ bài: menu có "Tắt bình luận"; sau khi tắt → toast, khung bình luận có thông báo, không có ô viết', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await menu(user, 'p2');
    await user.click(within(post('p2')).getByText('Tắt bình luận'));
    expect(await screen.findByText('Đã tắt bình luận cho bài viết')).toBeTruthy();
    await user.click(within(post('p2')).getByRole('button', { name: 'Bình luận' }));
    expect(await within(post('p2')).findByText(/Chủ bài viết đã tắt bình luận/)).toBeTruthy();
    expect(within(post('p2')).queryByPlaceholderText(/Viết bình luận/)).toBeNull();
    expect(within(post('p2')).queryByRole('button', { name: 'Trả lời' })).toBeNull();
    expect(within(post('p2')).getByText('Bình luận đầu tiên')).toBeTruthy(); // bình luận cũ vẫn xem được
  });

  it('bật lại → có ô viết bình luận và nút trả lời', async () => {
    const { user } = renderApp('/', { seed: () => void (db.posts[1].commentsDisabled = true) });
    await feedLoaded();
    await menu(user, 'p2');
    await user.click(within(post('p2')).getByText('Bật bình luận'));
    expect(await screen.findByText('Đã bật lại bình luận')).toBeTruthy();
    await user.click(within(post('p2')).getByRole('button', { name: 'Bình luận' }));
    expect(await within(post('p2')).findByPlaceholderText(/Viết bình luận/)).toBeTruthy();
    expect(within(post('p2')).getByRole('button', { name: 'Trả lời' })).toBeTruthy();
  });

  it('bài đã tắt không có lời mời "Chưa có bình luận nào" (không còn ai viết được)', async () => {
    const { user } = renderApp('/', { seed: () => void (db.posts[0].commentsDisabled = true) });
    await feedLoaded();
    await user.click(within(post('p1')).getByRole('button', { name: 'Bình luận' }));
    expect(await within(post('p1')).findByText(/đã tắt bình luận/)).toBeTruthy();
    expect(within(post('p1')).queryByText(/Chưa có bình luận nào/)).toBeNull();
  });

  it('bài của người khác không có mục tắt bình luận', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await menu(user, 'p1');
    expect(within(post('p1')).queryByText('Tắt bình luận')).toBeNull();
    expect(within(post('p1')).queryByText('Bật bình luận')).toBeNull();
  });

  it('server lỗi → toast lỗi', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    db.failNext.add('POST /posts/p2/toggle-comments');
    await menu(user, 'p2');
    await user.click(within(post('p2')).getByText('Tắt bình luận'));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
  });
});

describe('Ẩn bài viết', () => {
  it('bài của người khác có "Ẩn bài viết"; bấm → bài biến mất + toast có nút Hoàn tác', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await menu(user, 'p3');
    await user.click(within(post('p3')).getByText('Ẩn bài viết'));
    await waitFor(() => expect(screen.queryByText('Bài của người lạ')).toBeNull());
    expect(screen.getByText(/Đã ẩn bài viết/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/posts/p3/hide')).toBe(true);
  });

  it('Hoàn tác → bài quay lại ĐÚNG vị trí cũ và toast biến mất', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    const before = Array.from(document.querySelectorAll('article')).map((a) => a.id);
    await menu(user, 'p2');
    // p2 là bài của mình → không có nút ẩn; dùng p3
    fireEvent.mouseDown(document.body);
    await menu(user, 'p3');
    await user.click(within(post('p3')).getByText('Ẩn bài viết'));
    await user.click(await screen.findByRole('button', { name: 'Hoàn tác' }));
    await waitFor(() => expect(post('p3')).toBeTruthy());
    expect(Array.from(document.querySelectorAll('article')).map((a) => a.id)).toEqual(before);
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).toBeNull();
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/posts/p3/hide')).toBe(true);
  });

  it('bài của chính mình không có mục "Ẩn bài viết"', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await menu(user, 'p2');
    expect(within(post('p2')).queryByText('Ẩn bài viết')).toBeNull();
  });

  it('server lỗi khi ẩn → toast lỗi và bài vẫn còn', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    db.failNext.add('POST /posts/p3/hide');
    await menu(user, 'p3');
    await user.click(within(post('p3')).getByText('Ẩn bài viết'));
    expect((await screen.findByRole('alert')).textContent).toContain('Lỗi máy chủ giả lập');
    expect(screen.getByText('Bài của người lạ')).toBeTruthy();
  });

  it('Hoàn tác khi server lỗi vẫn đưa bài về (không mất bài)', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await menu(user, 'p3');
    await user.click(within(post('p3')).getByText('Ẩn bài viết'));
    const button = await screen.findByRole('button', { name: 'Hoàn tác' });
    db.failNext.add('DELETE /posts/p3/hide');
    await user.click(button);
    await waitFor(() => expect(screen.getByText('Bài của người lạ')).toBeTruthy());
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { render } from '@testing-library/react';
import { installBrowserStubs, renderApp, feedLoaded, post, screen, waitFor, within, fireEvent } from './harness';
import { db, calls } from './fakeServer';
import { AvatarFrame } from '../../src/components/ui';
import { AVATAR_FRAMES, frameClass } from '../../src/utils/avatarFrames';
import { SOCIAL_PLATFORMS, isValidSocialUrl } from '../../src/utils/socialLinks';

// Hồ sơ: khung ảnh đại diện + liên kết mạng xã hội.

beforeEach(() => installBrowserStubs());

describe('frameClass / AvatarFrame', () => {
  it('có đủ 6 khung, khớp danh sách của server', () => {
    expect(AVATAR_FRAMES.map((f) => f.key)).toEqual(['none', 'blue', 'green', 'rose', 'gold', 'rainbow']);
    expect(new Set(AVATAR_FRAMES.map((f) => f.label)).size).toBe(6);
  });

  it.each(AVATAR_FRAMES.filter((f) => f.key !== 'none'))('khung "$key" có class nền riêng và bọc ảnh', (f) => {
    expect(frameClass(f.key)).toBe(f.className);
    expect(f.className).not.toBe('');
    const { container } = render(<AvatarFrame frame={f.key}><img alt="a" src="/a.png" /></AvatarFrame>);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('data-frame')).toBe(f.key);
    expect(wrapper.className).toContain(f.className.split(' ')[0]);
    expect(wrapper.querySelector('img')).toBeTruthy();
  });

  it.each([['none'], [undefined], [''], ['khong-co'], ['GOLD']])('khung %j → không bọc thêm thẻ nào', (frame) => {
    const { container } = render(<AvatarFrame frame={frame}><img alt="a" src="/a.png" /></AvatarFrame>);
    expect(container.firstElementChild!.tagName).toBe('IMG');
    expect(frameClass(frame as string)).toBe('');
  });

  it('nhận thêm className cho vòng khung', () => {
    const { container } = render(<AvatarFrame frame="gold" className="shadow-xl"><img alt="a" src="/a.png" /></AvatarFrame>);
    expect((container.firstElementChild as HTMLElement).className).toContain('shadow-xl');
  });
});

describe('isValidSocialUrl', () => {
  it.each([
    ['', true], ['   ', true], ['https://facebook.com/a', true], ['http://a.com', true], ['HTTPS://A.COM/x', true], ['  https://a.com  ', true], ['https://a.com/path?x=1&y=2#top', true], ['https://sub.a.com/@user', true],
    ['javascript:alert(1)', false], ['JAVASCRIPT:alert(1)', false], ['data:text/html,x', false], ['vbscript:x', false], ['file:///etc/passwd', false], ['ftp://a.com', false],
    ['facebook.com/a', false], ['//a.com', false], ['www.a.com', false], ['https://', false], ['https://a b.com', false], ['https://a.com/<b>', false], ['https://a.com/"x', false], ["https://a.com/'x", false], ['abc', false],
  ])('%j → %s', (value, expected) => expect(isValidSocialUrl(value)).toBe(expected));

  it('7 nền tảng, mỗi nền tảng có nhãn, icon và gợi ý bắt đầu bằng https://', () => {
    expect(SOCIAL_PLATFORMS).toHaveLength(7);
    for (const p of SOCIAL_PLATFORMS) {
      expect(p.label).toBeTruthy();
      expect(p.icon).toBeTruthy();
      expect(isValidSocialUrl(p.placeholder)).toBe(true);
    }
  });
});

describe('Sửa hồ sơ: khung ảnh đại diện', () => {
  it('có 6 lựa chọn khung; mặc định "Không khung" đang chọn', async () => {
    renderApp('/settings/profile');
    const group = await screen.findByRole('group', { name: 'Chọn khung ảnh đại diện' });
    expect(within(group).getAllByRole('button')).toHaveLength(6);
    expect(within(group).getByRole('button', { name: 'Không khung' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-frame]')).toBeNull();
  });

  it('chọn khung → đánh dấu đang chọn + xem trước ảnh đại diện có khung', async () => {
    const { user } = renderApp('/settings/profile');
    await user.click(await screen.findByRole('button', { name: 'Vàng' }));
    expect(screen.getByRole('button', { name: 'Vàng' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Không khung' }).getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-frame="gold"]')).toBeTruthy();
  });

  it('lưu → gửi avatarFrame lên server và hồ sơ hiện khung', async () => {
    const { user } = renderApp('/settings/profile');
    await user.click(await screen.findByRole('button', { name: 'Cầu vồng' }));
    await user.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.path === '/users/me')?.body).toMatchObject({ avatarFrame: 'rainbow' }));
    await screen.findByRole('heading', { level: 1, name: 'Trần Xuân Hoàng' });
    expect(document.querySelector('[data-frame="rainbow"]')).toBeTruthy();
  });

  it('khung đã lưu được chọn sẵn khi mở lại', async () => {
    renderApp('/settings/profile', { seed: () => void (db.me.avatarFrame = 'rose') });
    expect((await screen.findByRole('button', { name: 'Hồng' })).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Sửa hồ sơ: liên kết mạng xã hội', () => {
  it('có đủ 7 ô nhập, điền sẵn liên kết đã lưu', async () => {
    renderApp('/settings/profile', { seed: () => void (db.me.socialLinks = { github: 'https://github.com/abc' }) });
    for (const p of SOCIAL_PLATFORMS) expect(await screen.findByLabelText(p.label)).toBeTruthy();
    expect((screen.getByLabelText('GitHub') as HTMLInputElement).value).toBe('https://github.com/abc');
    expect((screen.getByLabelText('Facebook') as HTMLInputElement).value).toBe('');
  });

  it('lưu → gửi đủ 7 khoá (đã cắt khoảng trắng; ô trống gửi chuỗi rỗng để xoá)', async () => {
    const { user } = renderApp('/settings/profile');
    await user.type(await screen.findByLabelText('Facebook'), '  https://facebook.com/toi  ');
    await user.type(screen.getByLabelText('YouTube'), 'https://youtube.com/@toi');
    await user.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.path === '/users/me')).toBeTruthy());
    const body = calls.find((c) => c.method === 'PATCH' && c.path === '/users/me')!.body as { socialLinks: Record<string, string> };
    expect(Object.keys(body.socialLinks).sort()).toEqual(SOCIAL_PLATFORMS.map((p) => p.key).sort());
    expect(body.socialLinks).toMatchObject({ facebook: 'https://facebook.com/toi', youtube: 'https://youtube.com/@toi', github: '', tiktok: '' });
  });

  it('xoá một liên kết đã có → gửi chuỗi rỗng', async () => {
    const { user } = renderApp('/settings/profile', { seed: () => void (db.me.socialLinks = { github: 'https://github.com/abc' }) });
    await user.clear(await screen.findByLabelText('GitHub'));
    await user.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ socialLinks: { github: '' } }));
  });

  it.each(['javascript:alert(1)', 'facebook.com/abc', 'ftp://x.com', 'data:text/html,x'])('liên kết "%s" bị chặn ngay ở giao diện: toast lỗi, không gọi server', async (bad) => {
    renderApp('/settings/profile');
    const input = await screen.findByLabelText('LinkedIn');
    fireEvent.change(input, { target: { value: bad } });
    fireEvent.submit(input.closest('form')!); // bỏ qua kiểm tra có sẵn của trình duyệt để thử đúng lớp kiểm tra của ứng dụng
    expect((await screen.findByRole('alert')).textContent).toContain('Liên kết LinkedIn phải bắt đầu bằng http:// hoặc https://');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('server từ chối (400) → toast lỗi, ở lại trang', async () => {
    const { user, location } = renderApp('/settings/profile');
    await user.type(await screen.findByLabelText('Facebook'), 'https://facebook.com/ok');
    db.failNext.add('PATCH /users/me');
    await user.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Không thể lưu thông tin');
    expect(location()).toBe('/settings/profile');
  });
});

describe('Hiển thị trên trang cá nhân', () => {
  it('hồ sơ có liên kết → hiện đúng các icon, mở tab mới, có rel an toàn', async () => {
    renderApp('/profile/u1', { seed: () => void (db.me.socialLinks = { facebook: 'https://facebook.com/toi', github: 'https://github.com/toi' }) });
    const list = await screen.findByRole('list', { name: 'Mạng xã hội' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual(['Facebook', 'GitHub']);
    expect(links[0].getAttribute('href')).toBe('https://facebook.com/toi');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(links[0].getAttribute('rel')).toContain('nofollow');
  });

  it('không có liên kết → không hiện danh sách', async () => {
    renderApp('/profile/u1');
    await screen.findByRole('heading', { level: 1, name: 'Trần Xuân Hoàng' });
    expect(screen.queryByRole('list', { name: 'Mạng xã hội' })).toBeNull();
  });

  it('hồ sơ người khác cũng hiện liên kết và khung', async () => {
    renderApp('/profile/f1', { seed: () => void Object.assign(db.users[1], { socialLinks: { tiktok: 'https://tiktok.com/@f1' }, avatarFrame: 'green' }) });
    expect(await screen.findByRole('link', { name: 'TikTok' })).toBeTruthy();
    expect(document.querySelector('[data-frame="green"]')).toBeTruthy();
  });

  it('ảnh đại diện lớn có khung theo hồ sơ; không khung thì không có vòng', async () => {
    renderApp('/profile/u1', { seed: () => void (db.me.avatarFrame = 'blue') });
    await screen.findByRole('heading', { level: 1, name: 'Trần Xuân Hoàng' });
    expect(document.querySelector('main [data-frame="blue"]')).toBeTruthy();
  });

  it('khung hiện cả ở ảnh tác giả trong bảng tin', async () => {
    renderApp('/', { seed: () => void (db.posts[0].author = { ...db.posts[0].author, avatarFrame: 'gold' }) });
    await feedLoaded();
    expect(post('p1').querySelector('[data-frame="gold"]')).toBeTruthy();
    expect(post('p3').querySelector('[data-frame]')).toBeNull();
  });
});

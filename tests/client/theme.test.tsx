// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../../src/utils/api', async () => (await import('./fakeServer')).apiModule);
vi.mock('../../src/utils/socket', async () => (await import('./fakeServer')).socketModule);

import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../../src/context/ThemeContext';
import { installBrowserStubs, renderApp, feedLoaded, screen } from './harness';

// Giao diện sáng / tối: logic chọn theme, nhớ lựa chọn, công tắc ở menu tài khoản và trang đăng nhập, khối CSS tối.

type Listener = (e: { matches: boolean }) => void;
let systemDark = false;
const listeners = new Set<Listener>();
const stubMatchMedia = () =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('prefers-color-scheme: dark') ? systemDark : q.includes('min-width'),
    media: q,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  }));
const html = () => document.documentElement;
const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const setup = () => renderHook(() => useTheme(), { wrapper });

beforeEach(() => {
  systemDark = false;
  listeners.clear();
  localStorage.clear();
  html().classList.remove('dark');
  html().style.colorScheme = '';
  stubMatchMedia();
});
afterEach(() => vi.unstubAllGlobals());

describe('ThemeProvider', () => {
  it('lần đầu (chưa lưu gì) → theo hệ thống: hệ thống sáng → sáng', () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ theme: 'system', resolved: 'light' });
    expect(html().classList.contains('dark')).toBe(false);
    expect(html().style.colorScheme).toBe('light');
  });

  it('hệ thống đang tối → tối, class "dark" gắn vào <html>', () => {
    systemDark = true;
    const { result } = setup();
    expect(result.current.resolved).toBe('dark');
    expect(html().classList.contains('dark')).toBe(true);
    expect(html().style.colorScheme).toBe('dark');
  });

  it.each([['light', false], ['dark', true]] as const)('đã lưu "%s" thì ưu tiên hơn hệ thống', (stored, dark) => {
    systemDark = !dark;
    localStorage.setItem('theme', stored);
    const { result } = setup();
    expect(result.current.theme).toBe(stored);
    expect(result.current.resolved).toBe(dark ? 'dark' : 'light');
    expect(html().classList.contains('dark')).toBe(dark);
  });

  it.each([['rac'], [''], ['DARK'], ['null']])('giá trị lưu không hợp lệ %j → coi như "system"', (stored) => {
    localStorage.setItem('theme', stored);
    expect(setup().result.current.theme).toBe('system');
  });

  it('toggle: sáng → tối → sáng, và nhớ lựa chọn', () => {
    const { result } = setup();
    act(() => result.current.toggle());
    expect(result.current).toMatchObject({ theme: 'dark', resolved: 'dark' });
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(html().classList.contains('dark')).toBe(true);
    act(() => result.current.toggle());
    expect(result.current).toMatchObject({ theme: 'light', resolved: 'light' });
    expect(localStorage.getItem('theme')).toBe('light');
    expect(html().classList.contains('dark')).toBe(false);
  });

  it('toggle khi đang theo hệ thống tối → chuyển sang sáng (theo cái ĐANG hiển thị)', () => {
    systemDark = true;
    const { result } = setup();
    act(() => result.current.toggle());
    expect(result.current.resolved).toBe('light');
  });

  it('setTheme("system") quay lại theo hệ thống', () => {
    systemDark = true;
    localStorage.setItem('theme', 'light');
    const { result } = setup();
    expect(result.current.resolved).toBe('light');
    act(() => result.current.setTheme('system'));
    expect(result.current.resolved).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('system');
  });

  it('hệ điều hành đổi giao diện: đang "system" thì đổi theo; đã chọn cụ thể thì KHÔNG đổi', () => {
    const { result } = setup();
    act(() => listeners.forEach((fn) => fn({ matches: true })));
    expect(result.current.resolved).toBe('dark');
    act(() => result.current.setTheme('light'));
    act(() => listeners.forEach((fn) => fn({ matches: true })));
    expect(result.current.resolved).toBe('light');
  });

  it('gỡ lắng nghe khi unmount', () => {
    const { unmount } = setup();
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });

  it('localStorage bị chặn (đọc / ghi ném lỗi) → vẫn hoạt động cho phiên hiện tại', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bị chặn');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bị chặn');
    });
    const { result } = setup();
    expect(result.current.theme).toBe('system');
    act(() => result.current.toggle());
    expect(result.current.resolved).toBe('dark');
    vi.restoreAllMocks();
  });

  it('trình duyệt không có matchMedia → mặc định sáng, không lỗi', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = setup();
    expect(result.current.resolved).toBe('light');
    act(() => result.current.toggle());
    expect(result.current.resolved).toBe('dark');
  });
});

describe('Công tắc trong ứng dụng', () => {
  beforeEach(() => installBrowserStubs());

  it('menu tài khoản có "Chế độ tối"; bấm → tối, nhãn đổi thành "Chế độ sáng"; bấm lại → sáng', async () => {
    const { user } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await user.click(screen.getByRole('button', { name: 'Chế độ tối' }));
    expect(html().classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await user.click(screen.getByRole('button', { name: 'Chế độ sáng' }));
    expect(html().classList.contains('dark')).toBe(false);
  });

  it('giữ nguyên chế độ tối khi chuyển trang', async () => {
    localStorage.setItem('theme', 'dark');
    const { user, location } = renderApp('/');
    await feedLoaded();
    await user.click(screen.getAllByRole('link', { name: /Bạn bè/ })[0]);
    expect(location()).toBe('/friends');
    expect(html().classList.contains('dark')).toBe(true);
  });

  it('trang đăng nhập có nút đổi giao diện', async () => {
    const { user } = renderApp('/login', { loggedIn: false });
    await user.click(screen.getByRole('button', { name: 'Chuyển sang chế độ tối' }));
    expect(html().classList.contains('dark')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Chuyển sang chế độ sáng' }));
    expect(html().classList.contains('dark')).toBe(false);
  });
});

describe('Khối CSS chế độ tối (bảo vệ khỏi bị lỡ tay xoá / sửa)', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');

  it.each(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'])('đảo thang màu slate-%s trong .dark', (n) => {
    expect(css).toMatch(new RegExp(`\\.dark\\s*\\{[^}]*--color-slate-${n}:\\s*#[0-9a-f]{6}`, 's'));
  });

  it('có nền trang riêng cho sáng và tối, và ghi đè bg-white', () => {
    expect(css).toMatch(/:root\s*\{[^}]*--page-bg:/s);
    expect(css).toMatch(/\.dark\s*\{[^}]*--page-bg:/s);
    expect(css).toContain('.dark .bg-white');
  });

  it('thang slate tối đảo chiều: slate-50 tối hơn slate-900 (chữ chính sáng nhất)', () => {
    const value = (n: string) => parseInt(css.match(new RegExp(`--color-slate-${n}:\\s*#([0-9a-f]{6})`))![1], 16);
    for (const [dark, light] of [['50', '100'], ['100', '200'], ['200', '300'], ['300', '400'], ['400', '500'], ['500', '600'], ['600', '700'], ['700', '800'], ['800', '900']]) {
      expect(value(dark), `${dark} < ${light}`).toBeLessThan(value(light));
    }
  });
});

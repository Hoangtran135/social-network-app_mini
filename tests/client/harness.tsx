/* eslint-disable react-refresh/only-export-components -- file hỗ trợ test, không phải module giao diện */
import React from 'react';
import { vi } from 'vitest';
import { render, screen, waitFor, act, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppProviders, AppRoutes, ScrollToTop } from '../../src/App';
import { resetDb, setLoggedIn } from './fakeServer';

// Dựng cả ứng dụng (Provider thật + Route thật) trong MemoryRouter, nói chuyện với backend giả (fakeServer.ts).

/** Hiện đường dẫn hiện tại ra DOM để test kiểm tra điều hướng. */
const LocationProbe: React.FC = () => <div data-testid="location">{useLocation().pathname + useLocation().search}</div>;

/** Các callback IntersectionObserver đang đăng ký (cuộn vô hạn). Gọi triggerInfiniteScroll() để giả lập "cuộn tới cuối". */
const observers: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
export const triggerInfiniteScroll = (isIntersecting = true) => act(() => observers.forEach((cb) => cb([{ isIntersecting }])));

export function installBrowserStubs() {
  observers.length = 0;
  class FakeObserver {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
      observers.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
}

export function renderApp(path = '/', { loggedIn = true, seed }: { loggedIn?: boolean; seed?: () => void } = {}) {
  resetDb();
  seed?.(); // đổi dữ liệu giả (vd xoá hết bài viết) TRƯỚC khi ứng dụng tải dữ liệu
  setLoggedIn(loggedIn);
  const user = userEvent.setup();
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <ScrollToTop />
      <AppProviders>
        <AppRoutes />
        <LocationProbe />
      </AppProviders>
    </MemoryRouter>
  );
  return { user, ...utils, location: () => screen.getByTestId('location').textContent };
}

/** Chờ dữ liệu ban đầu của bảng tin tải xong. */
export const feedLoaded = () => screen.findByText('Bài của bạn một');

/** Thẻ bài viết theo id (<article id="post-<id>">). */
export const post = (id: string) => document.getElementById(`post-${id}`) as HTMLElement;

export { screen, waitFor, act, userEvent, within, fireEvent };

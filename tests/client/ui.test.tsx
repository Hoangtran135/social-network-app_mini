// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { FormField, CountBadge, EmptyState, PageLoading, TabButton, PageHeader, Avatar, UserLinks } from '../../src/components/ui';
import { FriendPicker } from '../../src/components/FriendPicker';
import { useEscapeKey } from '../../src/hooks/useEscapeKey';
import { useClickOutside } from '../../src/hooks/useClickOutside';
import { User } from '../../src/types';

// Test các mảnh giao diện dùng chung (src/components/ui.tsx), FriendPicker và các hook đóng popup.

describe('FormField', () => {
  it('nhãn gắn đúng với ô nhập (bấm nhãn / đọc màn hình hoạt động)', () => {
    render(<FormField label="Email" defaultValue="a@b.vn" />);
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('a@b.vn');
  });

  it('hai ô nhập trên cùng trang có id khác nhau', () => {
    render(<><FormField label="Một" /><FormField label="Hai" /></>);
    expect(screen.getByLabelText('Một').id).not.toBe(screen.getByLabelText('Hai').id);
  });

  it('truyền thuộc tính xuống <input> (onChange, required, autoComplete...)', () => {
    const onChange = vi.fn();
    render(<FormField label="Tên" required autoComplete="name" placeholder="Nguyễn Văn A" onChange={onChange} />);
    const input = screen.getByLabelText('Tên') as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(input.autocomplete).toBe('name');
    fireEvent.change(input, { target: { value: 'An' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ô mật khẩu: mặc định ẩn, bấm mắt để hiện / ẩn', () => {
    render(<FormField label="Mật khẩu" type="password" />);
    const input = screen.getByLabelText('Mật khẩu') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(input.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(input.type).toBe('password');
  });

  it('nút hiện mật khẩu không submit form và ô thường không có nút đó', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={onSubmit}><FormField label="Mật khẩu" type="password" /></form>);
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(onSubmit).not.toHaveBeenCalled();
    render(<FormField label="Email" type="email" />);
    expect(screen.queryAllByRole('button', { name: /mật khẩu/i })).toHaveLength(1);
  });

  it('hiện phần phụ bên phải nhãn (vd "Quên mật khẩu?")', () => {
    render(<FormField label="Mật khẩu" type="password" labelRight={<a href="/forgot">Quên mật khẩu?</a>} />);
    expect(screen.getByText('Quên mật khẩu?')).toBeTruthy();
  });
});

describe('CountBadge', () => {
  it.each([[0, null], [-1, null], [1, '1'], [99, '99'], [100, '99+'], [5000, '99+']])('%i → %s', (count, text) => {
    const { container } = render(<CountBadge count={count} />);
    if (text === null) expect(container.firstChild).toBeNull();
    else expect(container.textContent).toBe(text);
  });
});

describe('EmptyState / PageLoading / TabButton / PageHeader', () => {
  it('EmptyState hiện tiêu đề, mô tả và nội dung phụ (nút)', () => {
    render(<EmptyState icon={Bell} title="Chưa có gì" description="Hãy thử lại" ><button>Làm mới</button></EmptyState>);
    expect(screen.getByText('Chưa có gì')).toBeTruthy();
    expect(screen.getByText('Hãy thử lại')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Làm mới' })).toBeTruthy();
  });

  it('EmptyState không mô tả / không nội dung phụ vẫn hiển thị gọn', () => {
    render(<EmptyState icon={Bell} title="Trống" />);
    expect(screen.getByText('Trống')).toBeTruthy();
  });

  it('PageLoading có role="status" và chữ mặc định / tuỳ chọn', () => {
    const { rerender } = render(<PageLoading />);
    expect(screen.getByRole('status').textContent).toContain('Đang tải...');
    rerender(<PageLoading text="Đang tải hồ sơ..." />);
    expect(screen.getByRole('status').textContent).toContain('Đang tải hồ sơ...');
  });

  it('TabButton: aria-pressed theo trạng thái, bấm gọi onClick, không submit form', () => {
    const onClick = vi.fn();
    const { rerender } = render(<form onSubmit={(e) => e.preventDefault()}><TabButton active={false} onClick={onClick}>Bạn bè</TabButton></form>);
    const button = screen.getByRole('button', { name: 'Bạn bè' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect((button as HTMLButtonElement).type).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<TabButton active onClick={onClick}>Bạn bè</TabButton>);
    expect(screen.getByRole('button', { name: 'Bạn bè' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('PageHeader: tiêu đề là h1, có phụ đề và nút bên phải', () => {
    render(<PageHeader icon={Bell} title="Thông báo" subtitle="Bạn có 3 thông báo"><button>Đọc hết</button></PageHeader>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Thông báo');
    expect(screen.getByText('Bạn có 3 thông báo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đọc hết' })).toBeTruthy();
  });
});

describe('Avatar / UserLinks', () => {
  it('Avatar có chấm xanh khi online, không có khi offline', () => {
    const { container, rerender } = render(<Avatar src="/a.png" online />);
    expect(container.querySelector('span')).toBeTruthy();
    rerender(<Avatar src="/a.png" />);
    expect(container.querySelector('span')).toBeNull();
  });

  it('UserLinks: link tới trang cá nhân, ngăn cách bằng dấu phẩy, không dấu thừa ở đầu', () => {
    const { container } = render(<MemoryRouter><UserLinks users={[{ id: '1', name: 'An' }, { id: '2', name: 'Bình' }, { id: '3', name: 'Chi' }]} /></MemoryRouter>);
    expect(container.textContent).toBe('An, Bình, Chi');
    expect(screen.getByRole('link', { name: 'Bình' }).getAttribute('href')).toBe('/profile/2');
  });

  it('UserLinks rỗng → không hiện gì', () => {
    const { container } = render(<MemoryRouter><UserLinks users={[]} /></MemoryRouter>);
    expect(container.textContent).toBe('');
  });
});

describe('FriendPicker', () => {
  const friends = [
    { id: 'a', name: 'An', avatar: '/a.png' },
    { id: 'b', name: 'Bình', avatar: '/b.png' },
  ] as User[];

  it('hiện danh sách; bấm một người gọi onToggle với id đúng', () => {
    const onToggle = vi.fn();
    render(<FriendPicker friends={friends} selectedIds={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('Bình'));
    expect(onToggle).toHaveBeenCalledWith('b');
  });

  it('người được chọn có dấu tích (SVG), người chưa chọn thì không', () => {
    const { container } = render(<FriendPicker friends={friends} selectedIds={['a']} onToggle={() => {}} />);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('chưa có bạn → thông báo "chưa có bạn bè"', () => {
    render(<FriendPicker friends={[]} selectedIds={[]} onToggle={() => {}} />);
    expect(screen.getByText(/chưa có bạn bè/i)).toBeTruthy();
  });
});

describe('useEscapeKey', () => {
  it('nhấn Esc gọi callback; phím khác thì không', () => {
    const cb = vi.fn();
    renderHook(() => useEscapeKey(cb));
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(cb).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('luôn gọi callback MỚI NHẤT (không dùng bản cũ bị "đóng băng")', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useEscapeKey(cb), { initialProps: { cb: first } });
    rerender({ cb: second });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('gỡ bỏ sau khi unmount (không rò rỉ)', () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(cb));
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('useClickOutside', () => {
  function Menu({ onOutside }: { onOutside: () => void }) {
    const ref = useClickOutside(onOutside);
    return (
      <div>
        <div ref={ref} data-testid="menu"><button>bên trong</button></div>
        <button>bên ngoài</button>
      </div>
    );
  }

  it('bấm ngoài → gọi callback; bấm trong → không', () => {
    const onOutside = vi.fn();
    render(<Menu onOutside={onOutside} />);
    fireEvent.mouseDown(screen.getByText('bên trong'));
    expect(onOutside).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByText('bên ngoài'));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });
});

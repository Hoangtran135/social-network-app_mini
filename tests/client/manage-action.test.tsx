// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Hook useManageAction: chạy thao tác quản lý, thành công → toast + onDone; lỗi → toast đỏ (câu của server, hoặc câu chung nếu không phải ApiError).

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../src/context/SocialContext', () => ({ useSocial: () => ({ showToast: mocks.showToast }) }));
vi.mock('../../src/utils/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

import { useManageAction } from '../../src/hooks/useManageAction';
import { ApiError } from '../../src/utils/api';

beforeEach(() => mocks.showToast.mockClear());

describe('useManageAction', () => {
  it('thành công → toast xanh, chạy onDone, trả true; busy bật trong lúc chạy rồi tắt', async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useManageAction(onDone));
    let release!: () => void;
    let outcome: Promise<boolean> | undefined;
    act(() => {
      outcome = result.current.act(() => new Promise<void>((r) => (release = r)), 'Đã xong');
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      release();
      await outcome;
    });
    expect(result.current.busy).toBe(false);
    expect(await outcome).toBe(true);
    expect(mocks.showToast).toHaveBeenCalledWith('Đã xong');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('không truyền onDone vẫn chạy bình thường', async () => {
    const { result } = renderHook(() => useManageAction());
    await act(async () => {
      expect(await result.current.act(async () => undefined, 'OK')).toBe(true);
    });
    expect(mocks.showToast).toHaveBeenCalledWith('OK');
  });

  it('server trả ApiError → toast đỏ với đúng câu báo lỗi của server, KHÔNG chạy onDone, trả false', async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useManageAction(onDone));
    await act(async () => {
      expect(await result.current.act(() => Promise.reject(new ApiError(403, 'Chỉ chủ nhóm mới có quyền này.')), 'x')).toBe(false);
    });
    expect(mocks.showToast).toHaveBeenCalledWith('Chỉ chủ nhóm mới có quyền này.', 'error');
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('lỗi không phải ApiError (mất mạng...) → toast đỏ với câu chung', async () => {
    const { result } = renderHook(() => useManageAction());
    await act(async () => {
      expect(await result.current.act(() => Promise.reject(new TypeError('Failed to fetch')), 'x')).toBe(false);
    });
    expect(mocks.showToast).toHaveBeenCalledWith('Đã có lỗi xảy ra, vui lòng thử lại.', 'error');
  });
});

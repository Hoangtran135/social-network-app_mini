import { useState } from 'react';
import { ApiError } from '../utils/api';
import { useSocial } from '../context/SocialContext';

// Chạy một thao tác quản lý (nhóm, trang: duyệt, đuổi, bổ nhiệm, lưu cài đặt, xoá...): thành công thì hiện toast xanh + chạy onDone (tải lại dữ liệu),
// lỗi thì hiện toast đỏ với câu báo lỗi của server. Trong lúc chạy `busy` = true để khoá nút, tránh bấm đúp.
// Cách dùng: const { act, busy } = useManageAction(reload); act(() => api.post(...), 'Đã duyệt');

export function useManageAction(onDone?: () => void | Promise<void>) {
  const { showToast } = useSocial();
  const [busy, setBusy] = useState(false);

  const act = async (action: () => Promise<unknown>, okMessage: string) => {
    setBusy(true);
    try {
      await action();
      showToast(okMessage);
      await onDone?.();
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Đã có lỗi xảy ra, vui lòng thử lại.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { act, busy };
}

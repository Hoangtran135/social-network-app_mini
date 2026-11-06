import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../utils/api';

// Tải một danh sách của khu quản trị từ server: lọc / tìm kiếm / phân trang đều làm ở server (không tải hết về trình duyệt).
// Đổi `params` (vd từ khoá, bộ lọc) thì danh sách được tải lại từ đầu; loadMore() nối thêm trang kế tiếp.
// Cách dùng: const list = useAdminList<AdminUser>('/admin/users', 'users', { q, filter });

const PAGE_SIZE = 30;

export function useAdminList<T>(path: string, key: string, params: Record<string, string> = {}) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const latest = useRef(0); // chỉ nhận kết quả của lần gọi mới nhất (tránh kết quả cũ về muộn ghi đè)
  const paramsKey = JSON.stringify(params);

  const fetchPage = useCallback(
    async (skip: number) => {
      const query = new URLSearchParams({ ...(JSON.parse(paramsKey) as Record<string, string>), limit: String(PAGE_SIZE), skip: String(skip) });
      for (const [name, value] of [...query]) if (!value) query.delete(name);
      const id = ++latest.current;
      const data = await api.get<Record<string, unknown>>(`${path}?${query}`);
      return id === latest.current ? { rows: data[key] as T[], total: (data.total as number) ?? 0 } : null;
    },
    [path, key, paramsKey]
  );

  const reload = useCallback(async () => {
    try {
      const page = await fetchPage(0);
      if (!page) return;
      setItems(page.rows);
      setTotal(page.total);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [fetchPage]);

  // Đổi từ khoá / bộ lọc → hiện lại trạng thái "đang tải" rồi tải từ đầu
  useEffect(() => {
    setStatus('loading');
    void reload();
  }, [reload]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchPage(items.length);
      if (page) {
        setItems((list) => [...list, ...page.rows]);
        setTotal(page.total);
      }
    } catch {
      /* giữ nguyên danh sách hiện có; người dùng bấm lại được */
    } finally {
      setLoadingMore(false);
    }
  };

  return { items, total, status, reload, loadMore, loadingMore, hasMore: items.length < total };
}

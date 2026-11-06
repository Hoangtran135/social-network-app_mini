import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { getSocket } from '../utils/socket';

// Số báo cáo vi phạm đang chờ xử lý (huy hiệu ở menu quản trị). Tự cập nhật khi có báo cáo mới / báo cáo được xử lý (realtime).
// Cách dùng: const pending = usePendingReports();

export function usePendingReports() {
  const [pending, setPending] = useState(0);

  const refresh = useCallback(() => {
    api
      .get<{ pending: number }>('/admin/reports?limit=1')
      .then((data) => setPending(data.pending))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const socket = getSocket();
    socket.on('report:new', refresh);
    socket.on('report:update', refresh);
    return () => {
      socket.off('report:new', refresh);
      socket.off('report:update', refresh);
    };
  }, [refresh]);

  return pending;
}

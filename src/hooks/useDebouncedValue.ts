import { useEffect, useState } from 'react';

// Trả về giá trị đã "lắng" sau `delay` ms không đổi (vd chờ người dùng gõ xong ô tìm kiếm rồi mới gọi API).
// Cách dùng: const q = useDebouncedValue(search, 300);

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

import { useEffect, useRef } from 'react';

// Gọi callback khi người dùng nhấn phím Esc (dùng để đóng hộp thoại / popup).
// Cách dùng: useEscapeKey(onClose);

export function useEscapeKey(onEscape: () => void) {
  const callback = useRef(onEscape);
  callback.current = onEscape;

  useEffect(() => {
    const handle = (e: KeyboardEvent) => e.key === 'Escape' && callback.current();
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);
}

import { useEffect, useRef } from 'react';

// Hook đóng menu / popup khi người dùng bấm ra ngoài nó.
// Cách dùng: const ref = useClickOutside(() => setOpen(false)); <div ref={ref}>...menu...</div>

export function useClickOutside<T extends HTMLElement = HTMLDivElement>(onOutside: () => void) {
  const ref = useRef<T>(null);
  const callback = useRef(onOutside);
  callback.current = onOutside;

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) callback.current();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return ref;
}

import React, { createContext, useContext, useEffect, useState } from 'react';

// Giao diện sáng / tối. Lựa chọn của người dùng được nhớ trong localStorage ("light" | "dark" | "system").
// "system" (mặc định) = theo cài đặt của hệ điều hành và tự đổi khi hệ điều hành đổi.
// Chế độ tối = thêm class "dark" vào <html>; toàn bộ màu tối nằm trong src/index.css (khối ".dark").

export type Theme = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'theme';
const QUERY = '(prefers-color-scheme: dark)';

function readStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system'; // vd chế độ riêng tư chặn localStorage
  }
}

const systemPrefersDark = () => typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;

function useThemeState() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Hệ điều hành đổi giao diện → cập nhật (chỉ có tác dụng khi đang ở chế độ "system")
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(QUERY);
    const onChange = (e: { matches: boolean }) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved; // ô nhập, thanh cuộn... của trình duyệt cũng đổi theo
  }, [resolved]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // không lưu được thì vẫn đổi cho phiên hiện tại
    }
  };

  return { theme, resolved, setTheme, toggle: () => setTheme(resolved === 'dark' ? 'light' : 'dark') };
}

const ThemeContext = createContext<ReturnType<typeof useThemeState> | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <ThemeContext.Provider value={useThemeState()}>{children}</ThemeContext.Provider>;

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext)!;

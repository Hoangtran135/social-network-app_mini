import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Cấu hình bộ test (chạy bằng `npm test`).
// - tests/server/*.test.ts : test API + realtime của server, chạy trên một database MongoDB TẠM (xem tests/server/helpers.ts)
// - tests/client/*.test.ts(x) : test giao diện / hàm tiện ích của frontend; file nào cần DOM thì ghi dòng "// @vitest-environment jsdom" ở đầu file

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    // Giới hạn số tiến trình chạy song song: test giao diện nặng CPU (jsdom), chạy quá nhiều cùng lúc làm máy chậm và test chập chờn.
    poolOptions: { forks: { maxForks: 5 } },
    globals: true, // để Testing Library tự dọn DOM sau mỗi test
    testTimeout: 20000,
    hookTimeout: 30000,
    restoreMocks: true,
    // Đo độ phủ bằng `npm run test:coverage`. Ngưỡng bên dưới khiến lệnh THẤT BẠI (và CI báo đỏ) nếu độ phủ tụt xuống.
    // (Hiện tại: 100% dòng lệnh; các nhánh còn lại chỉ là những "lớp bảo vệ" không thể xảy ra qua giao diện thật.)
    coverage: {
      provider: 'v8',
      include: ['server/**', 'src/**'],
      exclude: ['src/types.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { statements: 99, lines: 99, branches: 98, functions: 95 },
    },
  },
});

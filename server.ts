import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import { connectDatabase } from "./server/database";
import { setupSocketServer } from "./server/socketServer";
import { createApp, errorHandler } from "./server/app";

// ĐIỂM KHỞI ĐỘNG CỦA SERVER (chạy bằng `npm run dev`).
// Thứ tự: kết nối database → dựng Express (server/app.ts: bảo mật, giới hạn request, các nhóm API)
// → phục vụ giao diện React → gắn Socket.io (realtime) → lắng nghe ở cổng PORT.

const isProduction = process.env.NODE_ENV === "production";
if (isProduction && !process.env.MONGODB_URI) throw new Error("MONGODB_URI must be set in production");

async function startServer() {
  await connectDatabase();
  const app = createApp();

  // Giao diện React: khi phát triển thì chạy Vite (tự tải lại khi sửa code);
  // khi chạy thật thì phục vụ các file đã build trong dist/, mọi đường dẫn khác trả index.html để React Router xử lý
  if (!isProduction) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.use(errorHandler);

  // Express và Socket.io dùng chung một HTTP server, chung một cổng
  const httpServer = http.createServer(app);
  setupSocketServer(httpServer);
  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, "0.0.0.0", () => console.log(`Server đang chạy tại http://localhost:${port}`));
}

// Ghi log lỗi không ai bắt thay vì để server tắt đột ngột
process.on("unhandledRejection", (err) => console.error("Unhandled promise rejection:", err));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));
startServer().catch((err) => {
  console.error("Không khởi động được server:", err);
  process.exit(1);
});

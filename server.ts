import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import cors from "cors";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import { createServer as createViteServer } from "vite";
import { connectDatabase } from "./server/database";
import { setupSocketServer } from "./server/socketServer";
import { authRouter } from "./server/routes/auth.routes";
import { usersRouter } from "./server/routes/users.routes";
import { postsRouter } from "./server/routes/posts.routes";
import { commentsRouter } from "./server/routes/comments.routes";
import { friendsRouter } from "./server/routes/friends.routes";
import { notificationsRouter } from "./server/routes/notifications.routes";
import { messagesRouter } from "./server/routes/messages.routes";
import { storiesRouter } from "./server/routes/stories.routes";
import { uploadRouter, serveUploads } from "./server/routes/upload.routes";

// ĐIỂM KHỞI ĐỘNG CỦA SERVER (chạy bằng `npm run dev`).
// Thứ tự: kết nối database → cấu hình Express (bảo mật, giới hạn request) → gắn các nhóm API
// → phục vụ giao diện React → gắn Socket.io (realtime) → lắng nghe ở cổng PORT.

const isProduction = process.env.NODE_ENV === "production";
if (isProduction && !process.env.MONGODB_URI) throw new Error("MONGODB_URI must be set in production");

async function startServer() {
  await connectDatabase();
  const app = express();

  // Server chạy sau 1 lớp proxy (Nginx) → tin header X-Forwarded-For để lấy đúng IP người dùng
  app.set("trust proxy", 1);
  const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true, credentials: true }));
  app.use(express.json());
  // Xoá các khoá bắt đầu bằng "$" trong dữ liệu gửi lên (chống NoSQL injection)
  app.use(mongoSanitize());

  // Giới hạn số request: 300 / phút cho mọi API; riêng đăng nhập, đăng ký... chỉ 20 / 15 phút (chống dò mật khẩu)
  const tooMany = { error: "Quá nhiều yêu cầu, vui lòng thử lại sau." };
  app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 300, message: tooMany }));
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: tooMany });
  app.use(["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password", "/api/auth/reset-password"], authLimiter);

  // Các nhóm API — vd authRouter.post('/login') sẽ thành POST /api/auth/login
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api/comments", commentsRouter);
  app.use("/api/friends", friendsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/stories", storiesRouter);
  app.use("/api/upload", uploadRouter);
  app.use("/uploads", serveUploads);
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

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

  // Bắt mọi lỗi chưa được xử lý ở các route → trả JSON thay vì làm sập server
  app.use((err: { status?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Lỗi khi xử lý request:", err);
    if (res.headersSent) return;
    res.status(err.status || 500).json({ error: isProduction ? "Đã có lỗi xảy ra, vui lòng thử lại sau." : String(err.message || err) });
  });

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

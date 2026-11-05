import "express-async-errors"; // Express 4 không tự bắt lỗi trong route async → import này để lỗi (vd id sai định dạng) trả JSON thay vì treo request
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import { authRouter } from "./routes/auth.routes";
import { usersRouter } from "./routes/users.routes";
import { postsRouter } from "./routes/posts.routes";
import { commentsRouter } from "./routes/comments.routes";
import { friendsRouter } from "./routes/friends.routes";
import { notificationsRouter } from "./routes/notifications.routes";
import { messagesRouter } from "./routes/messages.routes";
import { storiesRouter } from "./routes/stories.routes";
import { uploadRouter, serveUploads } from "./routes/upload.routes";

// Dựng ứng dụng Express (middleware bảo mật + các nhóm API). Tách riêng khỏi server.ts để bộ test có thể dựng app
// mà không cần mở cổng mạng, không cần Vite. server.ts gọi createApp() rồi gắn giao diện, lỗi chung và lắng nghe cổng.

const isProduction = process.env.NODE_ENV === "production";

export function createApp({ rateLimits = true }: { rateLimits?: boolean } = {}) {
  const app = express();

  // Server chạy sau 1 lớp proxy (Nginx) → tin header X-Forwarded-For để lấy đúng IP người dùng
  app.set("trust proxy", 1);
  const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true, credentials: true }));
  app.use(express.json());
  // Xoá các khoá bắt đầu bằng "$" trong dữ liệu gửi lên (chống NoSQL injection)
  app.use(mongoSanitize());

  // Giới hạn số request: 300 / phút cho mọi API; riêng đăng nhập, đăng ký... chỉ 20 / 15 phút (chống dò mật khẩu)
  if (rateLimits) {
    const tooMany = { error: "Quá nhiều yêu cầu, vui lòng thử lại sau." };
    app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 300, message: tooMany }));
    const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: tooMany });
    app.use(["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password", "/api/auth/reset-password", "/api/auth/verify-email", "/api/auth/resend-verification"], authLimiter);
  }

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

  return app;
}

/** Bắt mọi lỗi chưa được xử lý ở các route → trả JSON thay vì làm sập server. Phải gắn SAU cùng. */
export function errorHandler(err: { status?: number; name?: string; message?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) {
  // Đã gửi một phần phản hồi thì không thể trả JSON nữa → để Express đóng kết nối (nếu bỏ mặc, kết nối sẽ treo mãi)
  if (res.headersSent) return next(err);
  // Id sai định dạng (vd /posts/abc) → 400 thay vì 500
  if (err.name === "CastError") return void res.status(400).json({ error: "ID không hợp lệ." });
  // Vi phạm ràng buộc duy nhất của database (vd gửi 2 lời mời cùng lúc) → 409
  if ((err as { code?: number }).code === 11000) return void res.status(409).json({ error: "Dữ liệu đã tồn tại." });
  // JSON gửi lên bị hỏng
  if (err.status === 400 && err.name === "SyntaxError") return void res.status(400).json({ error: "Dữ liệu gửi lên không phải JSON hợp lệ." });
  console.error("Lỗi khi xử lý request:", err);
  res.status(err.status || 500).json({ error: isProduction ? "Đã có lỗi xảy ra, vui lòng thử lại sau." : String(err.message || err) });
}

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

// Xử lý đăng nhập bằng token (JWT):
// - createToken: tạo token khi đăng nhập / đăng ký (hạn 7 ngày)
// - getUserIdFromToken: đọc token → id người dùng (dùng cho cả API và Socket.io)
// - requireAuth: middleware chặn các API cần đăng nhập, gắn req.userId cho route phía sau

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';

// Cho TypeScript biết mọi request đều có thể có req.userId (được gắn bởi requireAuth)
declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}

export function createToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

/** Trả về id người dùng trong token, hoặc null nếu token sai / hết hạn. */
export function getUserIdFromToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    return (jwt.verify(token, JWT_SECRET) as { sub: string }).sub;
  } catch {
    return null;
  }
}

/** Middleware: client phải gửi header "Authorization: Bearer <token>" hợp lệ. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const userId = getUserIdFromToken(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  if (!userId) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  req.userId = userId;
  next();
}

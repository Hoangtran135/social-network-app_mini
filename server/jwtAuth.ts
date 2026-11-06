import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { UserModel } from './models/User';

// Xử lý đăng nhập bằng token (JWT):
// - createToken: tạo token khi đăng nhập / đăng ký (hạn 7 ngày)
// - getUserIdFromToken: đọc token → id người dùng (dùng cho cả API và Socket.io)
// - requireAuth: middleware chặn các API cần đăng nhập (token hợp lệ, tài khoản còn tồn tại và không bị khoá), gắn req.userId + req.userRole
// - requireAdmin: dùng SAU requireAuth, chỉ cho quản trị hệ thống (role = admin)

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';

// Cho TypeScript biết mọi request đều có thể có req.userId (được gắn bởi requireAuth)
declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
    userRole: 'user' | 'admin';
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

export const BANNED_MESSAGE = 'Tài khoản của bạn đã bị khoá. Liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.';

/** Trạng thái tài khoản dùng cho xác thực: null nếu không tồn tại. Id sai định dạng cũng coi như không tồn tại. */
export async function getAccountState(userId: string): Promise<{ banned: boolean; role: 'user' | 'admin' } | null> {
  const user = await UserModel.findById(userId).select('banned role').lean().catch(() => null);
  return user ? { banned: !!user.banned, role: user.role === 'admin' ? 'admin' : 'user' } : null;
}

/** Middleware: client phải gửi header "Authorization: Bearer <token>" hợp lệ; tài khoản phải còn tồn tại và không bị khoá. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const userId = getUserIdFromToken(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  const account = userId ? await getAccountState(userId) : null;
  if (!userId || !account) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  if (account.banned) return res.status(401).json({ error: BANNED_MESSAGE, code: 'banned' });
  req.userId = userId;
  req.userRole = account.role;
  next();
}

/** Middleware (dùng sau requireAuth): chỉ quản trị hệ thống. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Chỉ quản trị viên hệ thống mới có quyền này.' });
  next();
}

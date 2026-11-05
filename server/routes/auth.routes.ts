import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { UserModel } from '../models/User';
import { createToken, requireAuth } from '../jwtAuth';
import { meToJson } from '../formatResponse';
import { sendPasswordResetEmail, sendVerificationEmail } from '../email';
import { validate, registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema } from '../validation';

// API tài khoản (/api/auth): đăng ký, đăng nhập, quên / đặt lại mật khẩu, đăng xuất, lấy thông tin của mình.

export const authRouter = Router();

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

/** Tạo mã xác minh mới cho user (lưu bản băm, hạn 24 giờ) rồi gửi email chứa link. Lỗi gửi mail chỉ ghi log, không làm hỏng việc đăng ký. */
async function issueVerification(user: { email: string; verifyTokenHash?: string; verifyTokenExpires?: Date; save: () => Promise<unknown> }, origin: string) {
  const token = crypto.randomBytes(32).toString('hex');
  user.verifyTokenHash = sha256(token);
  user.verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();
  const verifyUrl = `${origin}/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;
  await sendVerificationEmail(user.email, verifyUrl).catch((err) => console.error('Gửi email xác minh thất bại:', err));
}

const originOf = (req: { headers: { origin?: string }; protocol: string; get: (name: string) => string | undefined }) => req.headers.origin || `${req.protocol}://${req.get('host')}`;

/** Đăng ký tài khoản */
authRouter.post('/register', validate(registerSchema), async (req, res) => {
  const { name, username, email, password } = req.body;
  if (await UserModel.exists({ $or: [{ email: email.toLowerCase() }, { username }] })) {
    return res.status(409).json({ error: 'Email hoặc username đã được sử dụng.' });
  }
  const user = await UserModel.create({
    name,
    username,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
    bio: 'Thành viên mới của mạng xã hội 👋',
    isOnline: true,
    emailVerified: false,
  });
  await issueVerification(user, originOf(req));
  res.json({ token: createToken(user.id), user: meToJson(user) });
});

/** Đăng nhập */
authRouter.post('/login', validate(loginSchema), async (req, res) => {
  const user = await UserModel.findOne({ email: req.body.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
  }
  user.isOnline = true;
  user.lastActive = undefined;
  await user.save();
  res.json({ token: createToken(user.id), user: meToJson(user) });
});

/** Gửi email đặt lại mật khẩu */
authRouter.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  const user = await UserModel.findOne({ email: req.body.email.toLowerCase() });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = sha256(token);
    user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${origin}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    await sendPasswordResetEmail(user.email, resetUrl).catch((err) => console.error('Gửi email thất bại:', err));
  }
  res.json({ ok: true });
});

/** Đặt lại mật khẩu */
authRouter.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  const { email, token, password } = req.body;
  const user = await UserModel.findOne({ email: email.toLowerCase() });
  const valid = user?.resetTokenHash === sha256(token) && user.resetTokenExpires?.getTime() > Date.now();
  if (!valid) return res.status(400).json({ error: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' });

  user.passwordHash = await bcrypt.hash(password, 10);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  await user.save();
  res.json({ ok: true });
});

/** Xác minh email bằng mã trong link. Đã xác minh rồi thì trả ok (bấm link lần 2 không lỗi). */
authRouter.post('/verify-email', validate(verifyEmailSchema), async (req, res) => {
  const { email, token } = req.body;
  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (user?.emailVerified !== false && user) return res.json({ ok: true });
  const valid = user?.verifyTokenHash === sha256(token) && user.verifyTokenExpires?.getTime() > Date.now();
  if (!valid) return res.status(400).json({ error: 'Liên kết xác minh không hợp lệ hoặc đã hết hạn.' });

  user.emailVerified = true;
  user.verifyTokenHash = undefined;
  user.verifyTokenExpires = undefined;
  await user.save();
  res.json({ ok: true });
});

/** Gửi lại email xác minh (người đang đăng nhập) */
authRouter.post('/resend-verification', requireAuth, async (req, res) => {
  const user = await UserModel.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  if (user.emailVerified !== false) return res.status(400).json({ error: 'Email này đã được xác minh.' });
  await issueVerification(user, originOf(req));
  res.json({ ok: true });
});

/** Đăng xuất */
authRouter.post('/logout', requireAuth, async (req, res) => {
  await UserModel.findByIdAndUpdate(req.userId, { isOnline: false, lastActive: new Date() });
  res.json({ ok: true });
});

/** Lấy thông tin người đang đăng nhập */
authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await UserModel.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  res.json({ user: meToJson(user) });
});

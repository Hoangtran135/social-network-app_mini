import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { UserModel } from '../models/User';
import { createToken, requireAuth } from '../jwtAuth';
import { meToJson } from '../formatResponse';
import { sendPasswordResetEmail } from '../email';
import { validate, registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../validation';

// API tài khoản (/api/auth): đăng ký, đăng nhập, quên / đặt lại mật khẩu, đăng xuất, lấy thông tin của mình.

export const authRouter = Router();

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

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
  });
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

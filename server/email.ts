import nodemailer from 'nodemailer';

// Gửi email (hiện chỉ dùng cho chức năng "Quên mật khẩu").
// Cấu hình máy chủ gửi mail bằng các biến SMTP_* trong file .env.
// Nếu chưa cấu hình SMTP thì khi chạy thử, link đặt lại mật khẩu sẽ được in ra terminal thay vì gửi mail.

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

const transporter = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    })
  : null;

/** Gửi một email; chưa cấu hình SMTP thì (ngoài production) in link ra terminal để thử, production thì báo lỗi. */
async function deliver(to: string, subject: string, html: string, devLog: string) {
  if (!transporter) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP is not configured');
    if (process.env.NODE_ENV !== 'test') console.log(`[email] SMTP chưa cấu hình — ${devLog}`);
    return;
  }
  await transporter.sendMail({ from: SMTP_FROM || 'SocialNet <no-reply@a2t.io.vn>', to, subject, html });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await deliver(
    to,
    'Đặt lại mật khẩu SocialNet',
    `
      <p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản SocialNet này.</p>
      <p><a href="${resetUrl}">Nhấn vào đây để đặt lại mật khẩu</a> (liên kết có hiệu lực trong 1 giờ).</p>
      <p>Nếu bạn không yêu cầu điều này, hãy bỏ qua email này.</p>
    `,
    `link đặt lại mật khẩu cho ${to}: ${resetUrl}`
  );
}

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  await deliver(
    to,
    'Xác minh email SocialNet',
    `
      <p>Chào mừng bạn đến với SocialNet! Hãy xác minh địa chỉ email để bảo vệ tài khoản.</p>
      <p><a href="${verifyUrl}">Nhấn vào đây để xác minh email</a> (liên kết có hiệu lực trong 24 giờ).</p>
      <p>Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email này.</p>
    `,
    `link xác minh email cho ${to}: ${verifyUrl}`
  );
}

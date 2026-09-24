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

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!transporter) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP is not configured');
    console.log(`[email] SMTP chưa cấu hình — link đặt lại mật khẩu cho ${to}: ${resetUrl}`);
    return;
  }
  await transporter.sendMail({
    from: SMTP_FROM || 'SocialNet <no-reply@a2t.io.vn>',
    to,
    subject: 'Đặt lại mật khẩu SocialNet',
    html: `
      <p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản SocialNet này.</p>
      <p><a href="${resetUrl}">Nhấn vào đây để đặt lại mật khẩu</a> (liên kết có hiệu lực trong 1 giờ).</p>
      <p>Nếu bạn không yêu cầu điều này, hãy bỏ qua email này.</p>
    `,
  });
}

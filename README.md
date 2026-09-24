# Social Network App

Website mạng xã hội full-stack: đăng bài, kết bạn, nhắn tin realtime, gọi video/thoại, story, nhóm, thông báo và trang quản trị.

Repo: https://github.com/Hoangtran135/social-network-appp.git

## Công nghệ sử dụng

- **Frontend:** React 19, TypeScript, React Router 7, Tailwind CSS 4, Socket.IO Client
- **Backend:** Node.js, Express, MongoDB (Mongoose), Socket.IO
- **Xác thực & bảo mật:** JWT, bcryptjs, Zod, express-rate-limit, express-mongo-sanitize
- **Khác:** Multer (upload media), Nodemailer (email)

## Yêu cầu môi trường

- Node.js 20+
- MongoDB (local hoặc remote)

## Chạy dự án ở local

1. Clone repo:
   ```bash
   git clone https://github.com/Hoangtran135/social-network-appp.git
   cd social-network-appp
   ```

2. Cài dependencies:
   ```bash
   npm install
   ```

3. Tạo file `.env` ở thư mục gốc:
   ```
   PORT=3000
   NODE_ENV=development
   MONGODB_URI=mongodb://127.0.0.1:27017/social-network-app
   JWT_ACCESS_SECRET=doi-thanh-chuoi-ngau-nhien-cua-ban
   JWT_REFRESH_SECRET=doi-thanh-chuoi-ngau-nhien-khac
   CORS_ORIGIN=http://localhost:3000
   ```

4. Đảm bảo MongoDB đang chạy ở local (hoặc trỏ `MONGODB_URI` tới cụm MongoDB khác).

5. Chạy dev server:
   ```bash
   npm run dev
   ```
   Mặc định chạy tại `http://localhost:3000`.

## Các lệnh chính

| Lệnh | Mô tả |
|---|---|
| `npm run dev` | Chạy server dev (Vite HMR + Express + Socket.IO) |
| `npm run build` | Build frontend (Vite) + bundle backend (esbuild) ra `dist/` |
| `npm run start` | Chạy bản production đã build (`dist/server.cjs`) |
| `npm run lint` | Kiểm tra code bằng ESLint |
| `npm run make-admin -- <email>` | Cấp quyền admin cho tài khoản theo email |

## Quản lý dữ liệu demo (thư mục `db/`)

| Script | Mô tả |
|---|---|
| `npx tsx db/seed-demo.ts` | **Xoá sạch** dữ liệu hiện có và tạo lại bộ data demo mẫu (users, bài viết, nhóm, story, tin nhắn...) |
| `npx tsx db/export-json.ts` | Export toàn bộ dữ liệu MongoDB hiện tại ra JSON (thư mục `db/export/`) |
| `npx tsx db/import-json.ts` | Import dữ liệu từ `db/export/` vào MongoDB (mặc định xoá dữ liệu cũ trước; đặt `DROP_EXISTING=false` để chỉ chèn thêm) |
| `npx tsx db/make-admin.ts <email>` | Cấp quyền admin cho user theo email |

Tài khoản demo có sẵn trong `db/export/` (mật khẩu chung: `123456`):
- Admin: `minhanh@demo.vn`
- User thường: `quocbao@demo.vn`, `camle@demo.vn`, `ducduy@demo.vn`, `thuha@demo.vn`, `anhkhoa@demo.vn`, `ngoclinh@demo.vn`, `giaphuc@demo.vn`

## Triển khai lên VPS (Windows Server)

Toàn bộ script nằm trong thư mục `deploy/`. Mọi lệnh chạy trong **PowerShell "Run as Administrator"** trên VPS (kết nối bằng Remote Desktop).

1. Cài **Node.js 22 LTS** từ https://nodejs.org/ và **Git** từ https://git-scm.com/ (chọn mặc định khi cài), rồi mở PowerShell mới.

2. Lấy code về VPS:
   ```powershell
   git clone https://github.com/Hoangtran135/social-network-appp.git C:\www\social-network-app
   cd C:\www\social-network-app
   ```

3. Cài đặt một lần — MongoDB, PM2, Nginx, tường lửa, file `.env` production (JWT_SECRET ngẫu nhiên), tự khởi động lại khi reboot, build và chạy app:
   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\deploy\setup-vps-windows.ps1 -Domain a2t.io.vn
   ```
   Script sẽ hỏi mật khẩu tài khoản Windows đang dùng (để app tự chạy lại khi VPS khởi động lại).

4. Trỏ DNS: tạo bản ghi **A** cho `a2t.io.vn` và `www.a2t.io.vn` về IP của VPS, đợi mở được `http://a2t.io.vn`.

5. Bật HTTPS miễn phí (Let's Encrypt, tự gia hạn):
   ```powershell
   .\deploy\enable-https-windows.ps1 -Domain a2t.io.vn -Email you@example.com
   ```

6. (Tuỳ chọn) Nạp dữ liệu demo: `npx tsx db/import-json.ts`

7. (Tuỳ chọn) Muốn gửi email "Quên mật khẩu" thật thì điền các biến `SMTP_*` trong `.env` rồi chạy lại bước deploy.

**Các lần cập nhật sau:** `.\deploy\deploy-windows.ps1` (tự `git pull` → cài thư viện → build → khởi động lại → kiểm tra `/api/health`).
Hoặc tự động mỗi khi merge vào `master`: xem [deploy/setup-github-runner.md](deploy/setup-github-runner.md).

**Lệnh hay dùng:** `pm2 status` · `pm2 logs social-network-app` · `pm2 restart social-network-app`

## Tính năng chính

- Đăng bài viết (ảnh/video), thích, bình luận, lưu bài viết
- Kết bạn, gợi ý bạn bè
- Nhắn tin realtime, gọi video/thoại (Socket.IO)
- Story 24 giờ
- Nhóm cộng đồng
- Thông báo realtime, tìm kiếm
- Báo cáo vi phạm & kiểm duyệt nội dung
- Trang quản trị (quản lý người dùng, bài viết, nhóm, báo cáo, thông báo hệ thống)

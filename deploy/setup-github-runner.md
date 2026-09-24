# Cài đặt tự động deploy khi merge PR vào main

Việc này cần chạy **trên chính VPS** (103.16.224.147), không phải máy dev. Làm theo các bước sau qua RDP.

> Làm **sau** khi đã chạy `deploy\setup-vps-windows.ps1` (đã có Node, PM2, MongoDB, Nginx, biến môi trường `PM2_HOME=C:\pm2` cho cả máy).

## 1. Tạo self-hosted runner trên GitHub

1. Vào repo trên GitHub → **Settings** → **Actions** → **Runners** → **New self-hosted runner**
2. Chọn OS: **Windows**, Architecture: **x64**
3. GitHub sẽ hiện đoạn lệnh PowerShell riêng cho bạn (có token xác thực, chỉ dùng được 1 lần và hết hạn nhanh) — copy đoạn đó, nó trông giống thế này (chỉ ví dụ, số/token thật sẽ khác):

```powershell
mkdir C:\actions-runner; cd C:\actions-runner
Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/vX.X.X/actions-runner-win-x64-X.X.X.zip -OutFile actions-runner.zip
Expand-Archive -Path actions-runner.zip -DestinationPath .
./config.cmd --url https://github.com/Hoangtran135/social-network-app_mini --token <TOKEN_GITHUB_CUNG_CAP>
```

4. Khi `config.cmd` hỏi **"Enter any additional labels"**, nhập chính xác: `windows,vps`
   (workflow đã cấu hình chạy trên `[self-hosted, windows, vps]`)
5. Các câu hỏi khác cứ Enter mặc định (work folder mặc định `_work` là ổn).

## 2. Cài runner chạy nền như Windows Service (để không cần mở cửa sổ/đăng nhập)

```powershell
cd C:\actions-runner
./svc.cmd install
./svc.cmd start
```

Kiểm tra chạy đúng: `Get-Service actions.runner.*` phải ở trạng thái `Running`.

**Lưu ý quan trọng:** Windows Service mặc định chạy bằng tài khoản hệ thống (Local System) hoặc tài khoản bạn chỉ định lúc cài — tài khoản đó cần có `node`, `npm`, `pm2` trong PATH. Cách đơn giản nhất: khi `svc.cmd install` hỏi tài khoản chạy dịch vụ, chọn tài khoản Windows bạn đang dùng để chạy PM2 hiện tại (đừng để mặc định SYSTEM nếu Node/PM2 chỉ cài cho user hiện tại). Đây cũng phải là tài khoản bạn đã nhập mật khẩu cho tác vụ khởi động `SocialNet-PM2` lúc chạy `setup-vps-windows.ps1`. Nhờ `PM2_HOME=C:\pm2`, runner, tác vụ khởi động và cửa sổ PowerShell của bạn đều thấy cùng một danh sách app trong `pm2 status`.

## 3. Chuẩn bị thư mục checkout của runner (chỉ làm 1 lần)

Runner sẽ tự checkout code vào `C:\actions-runner\_work\social-network-app_mini\social-network-app_mini` mỗi lần chạy — đây sẽ là bản chạy chính thức mới, **khác** với thư mục bạn từng deploy thủ công trước đó.

Sau lần chạy workflow đầu tiên (hoặc trước khi trigger nó), copy file `.env` thật (với `JWT_SECRET`, `MONGODB_URI`, v.v. — dùng luôn file `.env` mà `setup-vps-windows.ps1` đã tạo trong thư mục project, **giữ nguyên `JWT_SECRET`** để người dùng không bị đăng xuất) vào đúng thư mục checkout đó:

```powershell
Copy-Item "C:\đường-dẫn-.env-cũ-của-bạn\.env" "C:\actions-runner\_work\social-network-app_mini\social-network-app_mini\.env"
```

Workflow đã đặt `clean: false` nên `.env` sẽ **không** bị xóa giữa các lần deploy sau này.

## 4. Trỏ Nginx sang thư mục checkout mới

Nếu Nginx (`nginx.conf`) đang `proxy_pass` tới ứng dụng chạy từ thư mục cũ, không cần đổi gì — Nginx chỉ proxy tới `http://127.0.0.1:3000`, không quan tâm code nằm ở đâu. Chỉ cần đảm bảo **PM2 process `social-network-app` chạy từ thư mục checkout mới** (workflow tự lo việc này qua `pm2 restart`/`pm2 start`).

Nếu bạn có một process PM2 `social-network-app` cũ đang chạy từ thư mục khác, hãy dừng nó trước khi chạy workflow lần đầu:

```powershell
pm2 delete social-network-app
```

## 5. Test thử

Tạo 1 PR nhỏ (vd sửa README), merge vào `main`, rồi vào tab **Actions** trên GitHub xem workflow **Deploy to production** có chạy xanh không. Nếu lỗi, log chi tiết hiện ngay trong đó.

---

Sau khi hoàn tất 5 bước trên, mọi PR merge vào `main` sẽ tự động: `npm ci` → `npm run build` → `pm2 restart` trên VPS — không cần làm gì thủ công nữa.

# Cài đặt MỘT LẦN cho VPS Windows Server mới. Chạy trong PowerShell "Run as Administrator",
# từ thư mục project đã copy / clone lên VPS:
#   .\deploy\setup-vps-windows.ps1 -Domain a2t.io.vn
#
# Script làm:
#   1. Kiểm tra Node.js, cài PM2 (PM2_HOME dùng chung C:\pm2)
#   2. Cài MongoDB (Windows Service, chỉ nghe 127.0.0.1)
#   3. Tạo file .env production (JWT_SECRET ngẫu nhiên) nếu chưa có
#   4. Cài Nginx + ghi cấu hình reverse proxy
#   5. Mở tường lửa cổng 80, 443
#   6. Tạo Scheduled Task để Nginx và app tự chạy lại khi VPS khởi động lại
#   7. Build và chạy app lần đầu (deploy-windows.ps1)
# Chạy lại nhiều lần vẫn an toàn: bước nào đã làm rồi thì bỏ qua.

param(
    [string]$Domain = "a2t.io.vn",
    [string]$AppPort = "3000",
    [string]$MongoVersion = "8.0.4",
    # Tên database riêng cho app này (tránh dùng chung / ghi đè dữ liệu của app khác trên cùng MongoDB)
    [string]$DbName = "social-network-app-mini"
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$NginxDir = "C:\nginx"
$Pm2Home = "C:\pm2"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object System.Security.Principal.WindowsPrincipal($identity)).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Please run this script in an elevated (Run as Administrator) PowerShell window."
    exit 1
}

# ---------- 1. Node.js + PM2 ----------
Step "Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Install the LTS version (22.x) from https://nodejs.org/ then open a NEW Administrator PowerShell and re-run this script." -ForegroundColor Yellow
    exit 1
}
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    Write-Host "Node.js $(node -v) is too old. Install Node.js 22 LTS from https://nodejs.org/ and re-run." -ForegroundColor Yellow
    exit 1
}
Write-Host "Node.js $(node -v)" -ForegroundColor Green

Step "Installing PM2 (PM2_HOME = $Pm2Home)..."
# PM2_HOME cố định cho cả máy → tài khoản chạy GitHub runner, tác vụ khởi động và cửa sổ PowerShell đều thấy cùng một danh sách app
[Environment]::SetEnvironmentVariable("PM2_HOME", $Pm2Home, "Machine")
$env:PM2_HOME = $Pm2Home
New-Item -ItemType Directory -Force -Path $Pm2Home | Out-Null
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { npm install -g pm2 }
$pm2Path = (Get-Command pm2.cmd -ErrorAction SilentlyContinue).Source
if (-not $pm2Path) { $pm2Path = (Get-Command pm2).Source }
Write-Host "PM2 at $pm2Path" -ForegroundColor Green

# ---------- 2. MongoDB ----------
Step "Installing MongoDB $MongoVersion..."
if (Get-Service -Name MongoDB -ErrorAction SilentlyContinue) {
    Write-Host "MongoDB service already installed." -ForegroundColor Green
} else {
    $msi = Join-Path $env:TEMP "mongodb-$MongoVersion.msi"
    if (-not (Test-Path $msi)) {
        Write-Host "Downloading MongoDB (~750MB)..."
        $ProgressPreference = "SilentlyContinue"   # thanh tiến trình làm Invoke-WebRequest chậm đi rất nhiều
        Invoke-WebRequest -Uri "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-$MongoVersion-signed.msi" -OutFile $msi
    }
    # ServerService = cài MongoDB chạy như Windows Service; cấu hình mặc định chỉ nghe 127.0.0.1
    $p = Start-Process msiexec.exe -Wait -PassThru -ArgumentList "/i `"$msi`" /qn /norestart ADDLOCAL=`"ServerService`" SHOULD_INSTALL_COMPASS=`"0`""
    if ($p.ExitCode -ne 0) { throw "MongoDB installer failed with exit code $($p.ExitCode)." }
}
Set-Service -Name MongoDB -StartupType Automatic
Start-Service -Name MongoDB
$mongoUp = $false
for ($i = 0; $i -lt 15 -and -not $mongoUp; $i++) {
    $mongoUp = Test-NetConnection 127.0.0.1 -Port 27017 -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $mongoUp) { Start-Sleep -Seconds 2 }
}
if (-not $mongoUp) { throw "MongoDB is not listening on 127.0.0.1:27017." }
Write-Host "MongoDB is running on 127.0.0.1:27017 (not exposed to the internet)." -ForegroundColor Green

# ---------- 3. File .env ----------
Step "Preparing .env..."
$envFile = Join-Path $ProjectDir ".env"
if (Test-Path $envFile) {
    Write-Host ".env already exists, leaving it untouched." -ForegroundColor Green
} else {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
    $envText = @"
PORT=$AppPort
NODE_ENV=production
MONGODB_URI=mongodb://127.0.0.1:27017/$DbName
JWT_SECRET=$secret
CORS_ORIGIN=https://$Domain,https://www.$Domain,http://$Domain,http://www.$Domain

# Email for "forgot password". In production the reset email is NOT sent if SMTP is empty.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=SocialNet <no-reply@$Domain>
"@
    # Ghi UTF-8 KHÔNG có BOM (BOM làm dotenv đọc sai tên biến đầu tiên)
    [System.IO.File]::WriteAllText($envFile, $envText, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host ".env created with a random JWT_SECRET." -ForegroundColor Green
}

# ---------- 4. Nginx ----------
Step "Installing Nginx to $NginxDir..."
if (-not (Test-Path "$NginxDir\nginx.exe")) {
    $zipPath = Join-Path $env:TEMP "nginx.zip"
    $extractDir = Join-Path $env:TEMP "nginx_extract"
    $ProgressPreference = "SilentlyContinue"
    Invoke-WebRequest -Uri "http://nginx.org/download/nginx-1.26.2.zip" -OutFile $zipPath
    if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    $extracted = Get-ChildItem $extractDir | Select-Object -First 1
    New-Item -ItemType Directory -Force -Path $NginxDir | Out-Null
    Copy-Item -Path (Join-Path $extracted.FullName "*") -Destination $NginxDir -Recurse -Force
} else {
    Write-Host "Nginx already present." -ForegroundColor Green
}
New-Item -ItemType Directory -Force -Path "$NginxDir\ssl", "$NginxDir\html\.well-known\acme-challenge" | Out-Null
& (Join-Path $PSScriptRoot "write-nginx-config-windows.ps1") -Domain $Domain -AppPort $AppPort -NginxDir $NginxDir

# ---------- 5. Tường lửa ----------
Step "Opening Windows Firewall ports 80/443..."
foreach ($port in 80, 443) {
    $name = "SocialNet-HTTP-$port"
    if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
    }
}
Write-Host "Ports 80/443 open. Ports $AppPort (Node) and 27017 (MongoDB) stay closed to the internet." -ForegroundColor Green

# ---------- 6. Tự chạy lại khi VPS khởi động ----------
Step "Registering startup tasks..."
# Nginx: chạy bằng tài khoản SYSTEM lúc máy khởi động
$nginxAction = New-ScheduledTaskAction -Execute "$NginxDir\nginx.exe" -Argument "-p $($NginxDir -replace '\\', '/')/" -WorkingDirectory $NginxDir
Register-ScheduledTask -TaskName "SocialNet-Nginx" -Action $nginxAction -Trigger (New-ScheduledTaskTrigger -AtStartup) `
    -Principal (New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest) -Force | Out-Null

# App: "pm2 resurrect" khôi phục các app đã "pm2 save". Phải chạy bằng CHÍNH tài khoản đang dùng PM2
# (và GitHub runner) → cần mật khẩu tài khoản để tác vụ chạy được khi chưa ai đăng nhập.
Write-Host "Enter the password of the Windows account that runs PM2 (the account you are using now)." -ForegroundColor Yellow
$cred = Get-Credential -UserName "$env:USERDOMAIN\$env:USERNAME" -Message "Account that will run the app at startup"
$pm2Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c set PM2_HOME=$Pm2Home&& `"$pm2Path`" resurrect"
$pm2Trigger = New-ScheduledTaskTrigger -AtStartup
$pm2Trigger.Delay = "PT30S"   # đợi MongoDB khởi động xong
Register-ScheduledTask -TaskName "SocialNet-PM2" -Action $pm2Action -Trigger $pm2Trigger -RunLevel Highest `
    -User $cred.UserName -Password $cred.GetNetworkCredential().Password -Force | Out-Null
Write-Host "Startup tasks 'SocialNet-Nginx' and 'SocialNet-PM2' registered." -ForegroundColor Green

# ---------- 7. Deploy lần đầu ----------
Step "Building and starting the app..."
& (Join-Path $PSScriptRoot "deploy-windows.ps1") -SkipPull

Write-Host ""
Write-Host "==> Setup complete." -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "  1. DNS: create A records for $Domain and www.$Domain pointing to this VPS public IP."
Write-Host "  2. Test: open http://$Domain in a browser."
Write-Host "  3. HTTPS: .\deploy\enable-https-windows.ps1 -Domain $Domain -Email you@example.com"
Write-Host "  4. (Optional) Demo data: npx tsx db/import-json.ts"
Write-Host "  5. (Optional) Auto-deploy from GitHub: see deploy\setup-github-runner.md"

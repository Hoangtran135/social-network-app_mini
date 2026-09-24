# One-command deploy for the Windows VPS. Run from anywhere — it cd's to the
# project root itself:
#   .\deploy\deploy-windows.ps1            (git pull -> npm ci -> build -> pm2 restart)
#   .\deploy\deploy-windows.ps1 -SkipPull  (code already up to date, e.g. GitHub Actions checkout)
#
# Stops the PM2 process first — on Windows the running dist/server.cjs keeps native
# modules (like @rollup's win32 binary) file-locked, which makes `npm ci` fail with
# EPERM while the app is still up. Also hard-fails on any step's exit code instead of
# silently reloading PM2 on a stale build when a step errors.

param([switch]$SkipPull)

# PM2 / npm in cảnh báo ra stderr (vd "app doesn't exist"); ở chế độ "Stop" (kế thừa khi được gọi từ
# setup-vps-windows.ps1) PowerShell coi đó là lỗi và dừng script → luôn dùng "Continue", tự kiểm tra
# $LASTEXITCODE bằng FailIfError.
$ErrorActionPreference = "Continue"

Set-Location (Join-Path $PSScriptRoot "..")

# Same PM2 process list for every account (set machine-wide by setup-vps-windows.ps1)
if (-not $env:PM2_HOME) { $env:PM2_HOME = [Environment]::GetEnvironmentVariable("PM2_HOME", "Machine") }

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function FailIfError($msg) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $msg (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

if (-not (Test-Path .env)) {
    Write-Host "FAILED: .env not found in $(Get-Location). Run deploy\setup-vps-windows.ps1 first or copy your .env here." -ForegroundColor Red
    exit 1
}

if ($SkipPull) {
    Step "Skipping git pull."
} elseif (Test-Path .git) {
    Step "Pulling latest code..."
    git pull
    FailIfError "git pull"
} else {
    Step "No git repo detected, skipping pull."
}

$port = (Get-Content .env | Where-Object { $_ -match '^PORT=' }) -replace '^PORT=', ''
if (-not $port) { $port = "3000" }

pm2 describe social-network-app *> $null
$appExists = ($LASTEXITCODE -eq 0)

# Cùng tên "social-network-app" nhưng chạy từ thư mục KHÁC = app cũ → gỡ khỏi PM2 để chạy bản ở thư mục này
if ($appExists) {
    $here = (Get-Location).Path.TrimEnd('\')
    $oldCwd = ""
    try {
        $json = (pm2 jlist | Out-String)
        $json = $json.Substring($json.IndexOf('['))   # bỏ các dòng cảnh báo (nếu có) trước dữ liệu JSON
        $old = ($json | ConvertFrom-Json) | Where-Object { $_.name -eq "social-network-app" } | Select-Object -First 1
        $oldCwd = "$($old.pm2_env.pm_cwd)".TrimEnd('\')
    } catch { }
    if ($oldCwd -and ($oldCwd -ne $here)) {
        Step "Replacing old PM2 app running from $oldCwd..."
        pm2 delete social-network-app | Out-Null
        $appExists = $false
    }
}

if ($appExists) {
    Step "Stopping app to release file locks..."
    pm2 stop social-network-app | Out-Null
}

# Cổng của app phải trống (không bị app / chương trình khác chiếm)
$busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($busy) {
    $proc = Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "FAILED: port $port is already used by '$($proc.ProcessName)' (PID $($busy.OwningProcess), $($proc.Path))." -ForegroundColor Red
    Write-Host "Stop that program (see 'pm2 list'), or set another PORT in .env and re-run." -ForegroundColor Red
    exit 1
}

Step "Installing dependencies..."
npm ci
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm ci failed, retrying with a clean node_modules..." -ForegroundColor Yellow
    if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }
    npm install
    FailIfError "npm install"
}

Step "Building project..."
npm run build
FailIfError "npm run build"

Step "Starting app with PM2..."
if ($appExists) {
    pm2 restart ecosystem.config.cjs --env production
} else {
    pm2 start ecosystem.config.cjs --env production
}
FailIfError "pm2 start/restart"

pm2 save

Step "Checking the app responds..."
$healthy = $false
for ($i = 0; $i -lt 15 -and -not $healthy; $i++) {
    Start-Sleep -Seconds 2
    try { $healthy = (Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { }
}
pm2 status
if (-not $healthy) {
    Write-Host "FAILED: app did not answer on http://127.0.0.1:$port/api/health. Check the logs: pm2 logs social-network-app --lines 50" -ForegroundColor Red
    exit 1
}
Step "Deploy complete — app is up on port $port."

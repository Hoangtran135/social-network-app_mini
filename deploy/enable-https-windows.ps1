# Bật HTTPS miễn phí (Let's Encrypt) bằng win-acme. Chạy SAU setup-vps-windows.ps1, khi DNS của tên miền
# đã trỏ về IP của VPS (http://<tên miền> mở được). PowerShell "Run as Administrator":
#   .\deploy\enable-https-windows.ps1 -Domain a2t.io.vn -Email you@example.com
#
# win-acme đặt tệp xác minh vào C:\nginx\html\.well-known\acme-challenge (Nginx phục vụ thư mục này),
# lưu chứng chỉ dạng .pem vào C:\nginx\ssl, và tự tạo Scheduled Task gia hạn (chứng chỉ hạn 90 ngày);
# mỗi lần gia hạn xong sẽ chạy reload-nginx.bat để Nginx dùng chứng chỉ mới.

param(
    [string]$Domain = "a2t.io.vn",
    [Parameter(Mandatory = $true)][string]$Email,
    [string]$AppPort = "3000",
    [string]$NginxDir = "C:\nginx",
    [string]$WinAcmeDir = "C:\win-acme"
)

$ErrorActionPreference = "Stop"
function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

Step "Checking that http://$Domain reaches this server..."
try {
    Invoke-WebRequest -Uri "http://$Domain/api/health" -UseBasicParsing -TimeoutSec 10 | Out-Null
    Write-Host "OK" -ForegroundColor Green
} catch {
    Write-Host "http://$Domain/api/health is not reachable. Check the DNS A records and that the app is running (pm2 status), then retry." -ForegroundColor Red
    exit 1
}

Step "Installing win-acme to $WinAcmeDir..."
if (-not (Test-Path "$WinAcmeDir\wacs.exe")) {
    $ProgressPreference = "SilentlyContinue"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/win-acme/win-acme/releases/latest" -Headers @{ "User-Agent" = "setup-script" }
    $asset = $release.assets | Where-Object { $_.name -like "*x64.pluggable.zip" } | Select-Object -First 1
    $zip = Join-Path $env:TEMP $asset.name
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
    New-Item -ItemType Directory -Force -Path $WinAcmeDir | Out-Null
    Expand-Archive -Path $zip -DestinationPath $WinAcmeDir -Force
}

New-Item -ItemType Directory -Force -Path "$NginxDir\ssl", "$NginxDir\html\.well-known\acme-challenge" | Out-Null
$reloadBat = Join-Path $NginxDir "reload-nginx.bat"
Set-Content -Path $reloadBat -Value "@echo off`r`ncd /d $NginxDir`r`nnginx.exe -p $($NginxDir -replace '\\', '/')/ -s reload" -Encoding ASCII

Step "Requesting certificate for $Domain and www.$Domain..."
& "$WinAcmeDir\wacs.exe" `
    --source manual --host "$Domain,www.$Domain" `
    --validation filesystem --webroot "$NginxDir\html" `
    --store pemfiles --pemfilespath "$NginxDir\ssl" `
    --installation script --script $reloadBat `
    --accepttos --emailaddress $Email
if ($LASTEXITCODE -ne 0) { throw "win-acme failed (exit code $LASTEXITCODE). See the output above." }

Step "Switching Nginx to HTTPS..."
& (Join-Path $PSScriptRoot "write-nginx-config-windows.ps1") -Domain $Domain -AppPort $AppPort -NginxDir $NginxDir

Write-Host ""
Write-Host "==> HTTPS enabled: https://$Domain" -ForegroundColor Green
Write-Host "Certificates renew automatically (Scheduled Task created by win-acme)."

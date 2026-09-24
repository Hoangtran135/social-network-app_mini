# CHỈ ĐỌC — không sửa gì trên máy. Liệt kê những gì đang chạy trên VPS (app cũ, cổng, Nginx, IIS, MongoDB,
# GitHub runner...) để biết cần tắt gì trước khi chạy app mới. Chạy trong PowerShell (Admin):
#   .\deploy\inspect-vps-windows.ps1

if (-not $env:PM2_HOME) { $env:PM2_HOME = [Environment]::GetEnvironmentVariable("PM2_HOME", "Machine") }
function Section($t) { Write-Host "`n===== $t =====" -ForegroundColor Cyan }

Section "Programs listening on web / app / db ports"
foreach ($port in 80, 443, 3000, 3001, 5000, 8080, 27017) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 | ForEach-Object {
        $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        "{0,-6} {1,-12} PID {2,-6} {3}" -f $port, $p.ProcessName, $_.OwningProcess, $p.Path
    }
}

Section "PM2 apps (name, status, folder, script)"
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    try {
        $json = (pm2 jlist | Out-String); $json = $json.Substring($json.IndexOf('['))
        ($json | ConvertFrom-Json) | ForEach-Object { "{0,-25} {1,-8} {2}  ({3})" -f $_.name, $_.pm2_env.status, $_.pm2_env.pm_cwd, $_.pm2_env.pm_exec_path }
    } catch { pm2 list }
    "PM2_HOME = $env:PM2_HOME"
} else { "pm2 not installed" }

Section "Nginx"
foreach ($dir in "C:\nginx") {
    if (Test-Path "$dir\conf\nginx.conf") {
        "Config: $dir\conf\nginx.conf"
        Select-String -Path "$dir\conf\nginx.conf" -Pattern "server_name|proxy_pass|listen|ssl_certificate|root " |
            Where-Object { $_.Line.Trim() -notmatch '^#' } | ForEach-Object { "  " + $_.Line.Trim() }
    } else { "No Nginx at $dir" }
}
Get-Process nginx -ErrorAction SilentlyContinue | Select-Object -First 1 | ForEach-Object { "Running: $($_.Path)" }

Section "IIS"
$w3 = Get-Service W3SVC -ErrorAction SilentlyContinue
if ($w3) { "W3SVC (IIS) = $($w3.Status), startup $($w3.StartType)" } else { "IIS not installed" }

Section "Services (MongoDB, GitHub runner, other Node/web services)"
Get-Service | Where-Object { $_.Name -match 'mongo|actions\.runner|nginx|node|pm2' } | ForEach-Object { "{0,-45} {1,-8} {2}" -f $_.Name, $_.Status, $_.StartType }

Section "Startup scheduled tasks"
Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match 'nginx|pm2|node|SocialNet|win-acme' } | ForEach-Object { "{0,-40} {1}" -f $_.TaskName, $_.State }

Section "SSL certificates"
foreach ($dir in "C:\nginx\ssl", "C:\win-acme") {
    if (Test-Path $dir) { Get-ChildItem $dir -Filter *.pem -Recurse -ErrorAction SilentlyContinue | ForEach-Object { "  $($_.FullName)  ($($_.LastWriteTime))" } }
}

Section "MongoDB databases"
if (Get-Command node -ErrorAction SilentlyContinue) {
    node -e "require('net').connect(27017,'127.0.0.1').on('connect',function(){console.log('MongoDB reachable on 127.0.0.1:27017');this.end()}).on('error',function(){console.log('MongoDB NOT reachable on 127.0.0.1:27017')})"
}

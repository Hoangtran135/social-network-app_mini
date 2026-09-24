# Ghi file C:\nginx\conf\nginx.conf rồi khởi động / tải lại Nginx.
# Tự nhận biết chứng chỉ SSL trong C:\nginx\ssl (do enable-https-windows.ps1 tạo):
#   - chưa có chứng chỉ → chỉ chạy HTTP (cổng 80)
#   - đã có chứng chỉ   → chạy HTTPS (cổng 443), HTTP tự chuyển sang HTTPS
# Được gọi bởi setup-vps-windows.ps1 và enable-https-windows.ps1; cũng có thể chạy tay:
#   .\deploy\write-nginx-config-windows.ps1 -Domain a2t.io.vn

param(
    [string]$Domain = "a2t.io.vn",
    [string]$AppPort = "3000",
    [string]$NginxDir = "C:\nginx"
)

$ErrorActionPreference = "Stop"
$sslDir = Join-Path $NginxDir "ssl"
$acmeRoot = (Join-Path $NginxDir "html") -replace '\\', '/'

# Chứng chỉ do win-acme tạo: <tên>-chain.pem (chứng chỉ + chuỗi trung gian) và <tên>-key.pem
$chain = Get-ChildItem $sslDir -Filter "*-chain.pem" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*-chain-only.pem" } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
$key = if ($chain) { Get-Item ($chain.FullName -replace '-chain\.pem$', '-key.pem') -ErrorAction SilentlyContinue }
$useHttps = [bool]($chain -and $key)

# Chuyển tiếp mọi request tới Node (kể cả WebSocket của Socket.io)
$proxy = @"
        location / {
            proxy_pass         http://127.0.0.1:$AppPort;
            proxy_http_version 1.1;
            proxy_set_header   Upgrade `$http_upgrade;
            proxy_set_header   Connection "upgrade";
            proxy_set_header   Host `$host;
            proxy_set_header   X-Real-IP `$remote_addr;
            proxy_set_header   X-Forwarded-For `$proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto `$scheme;
            proxy_read_timeout 3600s;
        }
"@

# Let's Encrypt kiểm tra tên miền bằng cách đọc tệp trong thư mục này
$acme = @"
        location ^~ /.well-known/acme-challenge/ {
            root         $acmeRoot;
            default_type text/plain;
        }
"@

if ($useHttps) {
    $certPath = $chain.FullName -replace '\\', '/'
    $keyPath = $key.FullName -replace '\\', '/'
    $servers = @"
    server {
        listen       80;
        server_name  $Domain www.$Domain;
$acme
        location / { return 301 https://`$host`$request_uri; }
    }

    server {
        listen       443 ssl;
        server_name  $Domain www.$Domain;
        ssl_certificate      $certPath;
        ssl_certificate_key  $keyPath;
        ssl_protocols        TLSv1.2 TLSv1.3;
        ssl_session_cache    shared:SSL:10m;
$proxy
    }
"@
} else {
    $servers = @"
    server {
        listen       80;
        server_name  $Domain www.$Domain;
$acme
$proxy
    }
"@
}

$conf = @"
worker_processes  1;
events { worker_connections  1024; }
http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile           on;
    keepalive_timeout  65;
    # App accepts uploads up to 20MB; Nginx default is 1MB (larger requests fail with 413)
    client_max_body_size 25m;

$servers
}
"@

$confPath = Join-Path $NginxDir "conf\nginx.conf"
# Giữ lại bản cũ (vd cấu hình của app trước đó) để có thể khôi phục: conf\nginx.conf.bak-<thời gian>
if ((Test-Path $confPath) -and ((Get-Content $confPath -Raw) -ne $conf)) {
    $backup = "$confPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $confPath $backup
    Write-Host "Previous config saved to $backup" -ForegroundColor Yellow
}
Set-Content -Path $confPath -Value $conf -Encoding ASCII
Write-Host ("Nginx config written ({0})." -f $(if ($useHttps) { "HTTPS" } else { "HTTP only" })) -ForegroundColor Green

# Nginx trên Windows lấy thư mục làm việc của tiến trình làm thư mục gốc → luôn chỉ rõ bằng -p
# (dùng dấu "/" ở cuối; "\" đứng trước dấu nháy sẽ làm hỏng tham số dòng lệnh)
$nginxExe = Join-Path $NginxDir "nginx.exe"
$prefix = ($NginxDir -replace '\\', '/').TrimEnd('/') + '/'
& $nginxExe -p $prefix -t
if ($LASTEXITCODE -ne 0) { throw "Nginx config test failed." }
if (Get-Process nginx -ErrorAction SilentlyContinue) {
    & $nginxExe -p $prefix -s reload
    Write-Host "Nginx reloaded." -ForegroundColor Green
} else {
    # Cổng 80/443 phải trống; hay gặp nhất là IIS (tiến trình "System", PID 4) đang giữ cổng 80
    foreach ($p in 80, 443) {
        $busy = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($busy) {
            $proc = Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue
            $hint = if ($busy.OwningProcess -eq 4) { " Probably IIS: run 'iisreset /stop' and 'Set-Service W3SVC -StartupType Disabled'." } else { "" }
            throw "Port $p is already used by '$($proc.ProcessName)' (PID $($busy.OwningProcess)).$hint"
        }
    }
    Start-Process -FilePath $nginxExe -ArgumentList "-p", $prefix -WorkingDirectory $NginxDir -WindowStyle Hidden
    Write-Host "Nginx started." -ForegroundColor Green
}

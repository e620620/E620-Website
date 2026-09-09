# PowerShell 輕量級本機與區網 HTTP 伺服器
$port = 8080
$projectRoot = (Get-Location).Path

# 取得本機 IP
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" } | Select-Object -First 1).IPAddress
if (-not $localIP) { $localIP = "127.0.0.1" }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://*:$port/")

try {
    $listener.Start()
} catch {
    # 若需系統管理員權限監聽 0.0.0.0，退回 localhost
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  🏥 雙和醫院 智慧諮詢服務 - 網頁伺服器已啟動！" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  💻 本機電腦瀏覽網址： http://localhost:$port" -ForegroundColor Yellow
Write-Host "  📱 同區網/手機連線網址： http://$($localIP):$port" -ForegroundColor Yellow
Write-Host ""
Write-Host "  💡 按 Ctrl + C 可隨時停止伺服器" -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 自動以預設瀏覽器開啟 QR Code 立牌與問答網頁
Start-Process "http://localhost:$port/📱雙和醫院_智能問答QR_Code立牌與海報.html?url=http://$($localIP):$port"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $urlPath = $request.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($urlPath)) {
        $urlPath = "index.html"
    }

    $filePath = Join-Path $projectRoot $urlPath

    if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = "text/plain; charset=utf-8"
        switch ($ext) {
            ".html" { $contentType = "text/html; charset=utf-8" }
            ".htm"  { $contentType = "text/html; charset=utf-8" }
            ".css"  { $contentType = "text/css; charset=utf-8" }
            ".js"   { $contentType = "application/javascript; charset=utf-8" }
            ".json" { $contentType = "application/json; charset=utf-8" }
            ".png"  { $contentType = "image/png" }
            ".jpg"  { $contentType = "image/jpeg" }
            ".jpeg" { $contentType = "image/jpeg" }
            ".gif"  { $contentType = "image/gif" }
            ".svg"  { $contentType = "image/svg+xml" }
            ".ico"  { $contentType = "image/x-icon" }
            ".txt"  { $contentType = "text/plain; charset=utf-8" }
        }

        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentType = $contentType
        $response.ContentLength64 = $bytes.Length
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $response.StatusCode = 404
        $notFoundMsg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($notFoundMsg, 0, $notFoundMsg.Length)
    }

    $response.Close()
}

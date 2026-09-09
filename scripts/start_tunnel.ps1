# 啟動本機伺服器並透過 Cloudflare Quick Tunnel 產生即時外網網址
$projectRoot = (Get-Location).Path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cloudflaredExe = Join-Path $scriptDir "cloudflared.exe"

# 1. 檢查 cloudflared.exe
if (-not (Test-Path $cloudflaredExe)) {
    Write-Host "正在下載外網穿透元件..." -ForegroundColor Yellow
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cloudflaredExe -UseBasicParsing
}

# 2. 背景啟動本機伺服器
$serverJob = Start-Job -ScriptBlock {
    param($root)
    Set-Location $root
    $port = 8080
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $urlPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($urlPath)) { $urlPath = "index.html" }
        $filePath = Join-Path $root $urlPath
        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = "text/plain; charset=utf-8"
            switch ($ext) {
                ".html" { $contentType = "text/html; charset=utf-8" }
                ".css"  { $contentType = "text/css; charset=utf-8" }
                ".js"   { $contentType = "application/javascript; charset=utf-8" }
                ".json" { $contentType = "application/json; charset=utf-8" }
                ".png"  { $contentType = "image/png" }
                ".jpg"  { $contentType = "image/jpeg" }
                ".svg"  { $contentType = "image/svg+xml" }
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
} -ArgumentList $projectRoot

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  🚀 雙和醫院 智慧諮詢服務 - 外網公開連線建置中..." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  請稍候 3~5 秒，即將自動產生外網專用 QR Code 與網址..." -ForegroundColor Yellow
Write-Host ""

$pinfo = New-Object System.Diagnostics.ProcessStartInfo
$pinfo.FileName = $cloudflaredExe
$pinfo.Arguments = "tunnel --url http://localhost:8080"
$pinfo.RedirectStandardError = $true
$pinfo.RedirectStandardOutput = $true
$pinfo.UseShellExecute = $false
$pinfo.CreateNoWindow = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $pinfo
$process.Start() | Out-Null

$tunnelUrlFound = $false

try {
    while (-not $process.HasExited) {
        $line = $process.StandardError.ReadLine()
        if ($line) {
            if ($line -match "https://[a-zA-Z0-9\-]+\.trycloudflare\.com") {
                $tunnelUrl = $matches[0]
                if (-not $tunnelUrlFound) {
                    $tunnelUrlFound = $true
                    Write-Host "========================================================" -ForegroundColor Cyan
                    Write-Host "  🎉 外網專屬網址已成功建立！" -ForegroundColor Green
                    Write-Host "  🌐 外網網址： $tunnelUrl" -ForegroundColor Yellow
                    Write-Host "  📱 任何手機（4G/5G/其他Wi-Fi）掃碼皆可直接連線！" -ForegroundColor Green
                    Write-Host "========================================================" -ForegroundColor Cyan
                    Write-Host ""
                    
                    # 自動開啟立牌海報，並將外網網址傳入
                    Start-Process "http://localhost:8080/📱雙和醫院_智能問答QR_Code立牌與海報.html?url=$tunnelUrl"
                }
            }
            if ($line -match "error|failed") {
                Write-Host $line -ForegroundColor Red
            }
        }
    }
} finally {
    if (-not $process.HasExited) {
        $process.Kill()
    }
    Stop-Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job $serverJob -ErrorAction SilentlyContinue
}

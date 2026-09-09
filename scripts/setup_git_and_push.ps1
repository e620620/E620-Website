[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:Path = "C:\Users\ireg\AppData\Local\Programs\Git\cmd;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;" + [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$projectRoot = "C:\Users\ireg\Desktop\智能問答助手-勿刪"
$scriptDir = Join-Path $projectRoot "scripts"
$ghExe = Join-Path $scriptDir "gh.exe"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  >> 雙和醫院 智能問答助手 - GitHub 上傳 (E620-Website)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

Set-Location $projectRoot

# 1. 設定 Git 帳號
git config --global user.email "16270@s.tmu.edu.tw"
git config --global user.name "16270"
git config user.email "16270@s.tmu.edu.tw"
git config user.name "16270"

# 2. 確保 GitHub CLI 存在
if (-not (Test-Path $ghExe)) {
    Write-Host "正在下載 GitHub 工具..." -ForegroundColor Yellow
    $zipUrl = "https://github.com/cli/cli/releases/download/v2.45.0/gh_2.45.0_windows_amd64.zip"
    $zipPath = Join-Path $scriptDir "gh.zip"
    $extractDir = Join-Path $scriptDir "gh_temp"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    $found = Get-ChildItem -Path $extractDir -Filter "gh.exe" -Recurse | Select-Object -First 1
    Copy-Item -Path $found.FullName -Destination $ghExe -Force
    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
}

# 3. 提交本地所有變更
git add -A
$status = git status --porcelain
if ($status) {
    git commit -m "Update: E620-Website (16270@s.tmu.edu.tw)"
    Write-Host "本地代碼已封裝完成！" -ForegroundColor Green
} else {
    Write-Host "本地代碼已是最新狀態！" -ForegroundColor Green
}

# 4. 檢查 GitHub 登入狀態
Write-Host ""
Write-Host "正在檢測 GitHub 帳號狀態..." -ForegroundColor Yellow
$authLines = & $ghExe auth status 2>&1
$isLoggedIn = $false
$githubUser = ""

foreach ($line in $authLines) {
    $lineStr = "$line"
    if ($lineStr -like "*Logged in to github.com account*") {
        $parts = $lineStr -split "account "
        if ($parts.Length -ge 2) {
            $githubUser = ($parts[1] -split " ")[0].Trim()
            $isLoggedIn = $true
        }
    }
}

# 5. 若未登入，引導進行網頁登入授權
if (-not $isLoggedIn) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Yellow
    Write-Host "  請在彈出的瀏覽器視窗中登入您的帳號: 16270@s.tmu.edu.tw" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Yellow
    Write-Host "即將為您開啟 GitHub 授權網頁..." -ForegroundColor Yellow
    Write-Host ""
    
    & $ghExe auth login --web -p https -h github.com
    
    $authLines2 = & $ghExe auth status 2>&1
    foreach ($line2 in $authLines2) {
        $lineStr2 = "$line2"
        if ($lineStr2 -like "*Logged in to github.com account*") {
            $parts2 = $lineStr2 -split "account "
            if ($parts2.Length -ge 2) {
                $githubUser = ($parts2[1] -split " ")[0].Trim()
                $isLoggedIn = $true
            }
        }
    }
}

# 6. 建立遠端儲存庫並推送代碼
if ($isLoggedIn -and $githubUser) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  GitHub 帳號驗證成功: $githubUser" -ForegroundColor Green
    Write-Host "  目標專案儲存庫: $githubUser/E620-Website" -ForegroundColor Yellow
    Write-Host "========================================================" -ForegroundColor Cyan

    & $ghExe repo view "$githubUser/E620-Website" 2>&1 | Out-Null
    $repoExists = ($LASTEXITCODE -eq 0)

    if (-not $repoExists) {
        Write-Host "正在為您在 GitHub 建立全新公開儲存庫: $githubUser/E620-Website ..." -ForegroundColor Cyan
        & $ghExe repo create "E620-Website" --public --source=. --remote=origin --push
    } else {
        Write-Host "遠端儲存庫已存在，正在設定 remote 並推送最新代碼..." -ForegroundColor Cyan
        $remotes = git remote
        if ($remotes -contains "origin") {
            git remote set-url origin "https://github.com/$githubUser/E620-Website.git"
        } else {
            git remote add origin "https://github.com/$githubUser/E620-Website.git"
        }
        git branch -M main
        git push -u origin main --force
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================================" -ForegroundColor Green
        Write-Host "  上傳成功！所有網站檔案已成功發布至 GitHub！" -ForegroundColor Green
        Write-Host "  專案網址: https://github.com/$githubUser/E620-Website" -ForegroundColor Yellow
        Write-Host "========================================================" -ForegroundColor Green
        Start-Process "https://github.com/$githubUser/E620-Website"
    } else {
        Write-Host "上傳時遇到錯誤，請檢查網路連線或權限。" -ForegroundColor Red
    }
} else {
    Write-Host "尚未完成 GitHub 登入授權，請重新執行批次檔完成登入。" -ForegroundColor Red
}
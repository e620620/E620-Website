[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:Path = "C:\Users\ireg\AppData\Local\Programs\Git\cmd;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;" + [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$projectRoot = "C:\Users\ireg\Desktop\智能問答助手-勿刪"
$scriptDir = Join-Path $projectRoot "scripts"
$ghExe = Join-Path $scriptDir "gh.exe"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  🚀 雙和醫院 智能問答助手 - GitHub 專案上傳 (E620-Website)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

Set-Location $projectRoot

# 1. 確保 git 可用
Write-Host "Git 狀態: " -NoNewline -ForegroundColor Gray
git --version

# 2. 確保 gh 可用
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

# 3. 設定 Git 作者資訊並提交本地所有最新改動
git config user.email "16270@s.tmu.edu.tw"
git config user.name "16270"
git config --global user.email "16270@s.tmu.edu.tw"
git config --global user.name "16270"

git add -A
$status = git status --porcelain
if ($status) {
    git commit -m "Update: 雙和醫院智能問答助手最新代碼 (16270@s.tmu.edu.tw)"
    Write-Host "✅ 本地代碼已完成 Git Commit 封裝！" -ForegroundColor Green
} else {
    Write-Host "✅ 本地代碼已是最新提交狀態！" -ForegroundColor Green
}

# 4. 檢查 GitHub 登入狀態
Write-Host ""
Write-Host "正在檢測 GitHub 帳號登入狀態..." -ForegroundColor Yellow
$authOutput = & $ghExe auth status 2>&1
$isLoggedIn = $false
$githubUser = ""
foreach ($line in $authOutput) {
    if ($line -match "Logged in to github\.com account ([a-zA-Z0-9_\-]+)") {
        $isLoggedIn = $true
        $githubUser = $matches[1]
    }
}

# 5. 若未登入，引導進行瀏覽器授權登入
if (-not $isLoggedIn) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Yellow
    Write-Host "  ⚠️ 尚未登入 GitHub 帳號" -ForegroundColor Yellow
    Write-Host "  請在彈出的瀏覽器視窗中登入您的帳號：16270@s.tmu.edu.tw" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Yellow
    Write-Host "  即將為您開啟 GitHub 網頁授權..." -ForegroundColor Yellow
    Write-Host "  登入授權完成後，系統將自動建立並上傳至 E620-Website 專案！" -ForegroundColor White
    Write-Host ""
    
    & $ghExe auth login --web -p https -h github.com
    
    # 重新檢測登入
    $authOutput2 = & $ghExe auth status 2>&1
    foreach ($line in $authOutput2) {
        if ($line -match "Logged in to github\.com account ([a-zA-Z0-9_\-]+)") {
            $isLoggedIn = $true
            $githubUser = $matches[1]
        }
    }
}

# 6. 上傳至 GitHub
if ($isLoggedIn) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  已成功驗證 GitHub 帳號: $githubUser" -ForegroundColor Green
    Write-Host "  目標儲存庫: $githubUser/E620-Website" -ForegroundColor Yellow
    Write-Host "========================================================" -ForegroundColor Cyan

    $repoCheck = & $ghExe repo view "$githubUser/E620-Website" 2>&1
    $repoExists = ($LASTEXITCODE -eq 0)

    if (-not $repoExists) {
        Write-Host "正在為您在 GitHub 上自動建立全新儲存庫：$githubUser/E620-Website ..." -ForegroundColor Cyan
        & $ghExe repo create "E620-Website" --public --source=. --remote=origin --push
    } else {
        Write-Host "遠端儲存庫已存在，正在推送最新代碼..." -ForegroundColor Cyan
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
        Write-Host "  🎉 上傳成功！所有網站檔案已同步至 GitHub！" -ForegroundColor Green
        Write-Host "  🔗 您的 GitHub 專案網址: https://github.com/$githubUser/E620-Website" -ForegroundColor Yellow
        Write-Host "========================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "正在為您開啟 GitHub 專案頁面..." -ForegroundColor Gray
        Start-Process "https://github.com/$githubUser/E620-Website"
    } else {
        Write-Host "上傳過程中遇到問題，請確認網路連線與權限。" -ForegroundColor Red
    }
} else {
    Write-Host "登入未完成，請重新執行上傳程式。" -ForegroundColor Red
}
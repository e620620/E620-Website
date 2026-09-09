[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:Path = "C:\Program Files\Git\cmd;C:\Program Files\Git\bin;" + [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$projectRoot = "C:\Users\ireg\Desktop\智能問答助手-勿刪"
$scriptDir = Join-Path $projectRoot "scripts"
$ghExe = Join-Path $scriptDir "gh.exe"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  >> 智能問答助手 - GitHub 專案上傳 (E620-Website)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

# 1. 確保 git 可用
Write-Host "Git 狀態: " -NoNewline
git --version

# 2. 確保 gh 可用
if (-not (Test-Path $ghExe)) {
    Write-Host "正在準備 GitHub CLI 元件..." -ForegroundColor Yellow
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

Write-Host "GitHub CLI: " -NoNewline
& $ghExe --version | Select-Object -First 1

# 3. 建立 .gitignore
$gitignorePath = Join-Path $projectRoot ".gitignore"
$gitignoreContent = @"
scripts/cloudflared.exe
scripts/gh.exe
scripts/gh.zip
scripts/gh_temp/
.DS_Store
Thumbs.db
*.log
.system_generated/
"@
[System.IO.File]::WriteAllText($gitignorePath, $gitignoreContent, [System.Text.Encoding]::UTF8)

# 4. 檢查 GitHub 登入狀態
Write-Host ""
Write-Host "正在檢測 GitHub 登入狀態..." -ForegroundColor Yellow
$authOutput = & $ghExe auth status 2>&1
$isLoggedIn = $false
$githubUser = ""
foreach ($line in $authOutput) {
    Write-Host "  $line"
    if ($line -match "Logged in to github\.com account ([a-zA-Z0-9_\-]+)") {
        $isLoggedIn = $true
        $githubUser = $matches[1]
    }
}

# 5. Git 初始化與 Commit
Set-Location $projectRoot
if (-not (Test-Path ".git")) {
    Write-Host "正在初始化 Git 儲存庫..." -ForegroundColor Cyan
    git init
    git branch -M main
}

$gitUser = git config user.name
if (-not $gitUser) {
    git config user.name "ireg"
    git config user.email "ireg@shh.tmu.edu.tw"
}

git add -A
$status = git status --porcelain
if ($status) {
    git commit -m "Initial commit: E620-Website 雙和醫院智能問答助手"
    Write-Host "檔案已成功提交至本地 Git！" -ForegroundColor Green
} else {
    Write-Host "本地所有變更已是最新狀態。" -ForegroundColor Gray
}

Write-Host ""
if ($isLoggedIn) {
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  已登入 GitHub 帳號: $githubUser" -ForegroundColor Green
    Write-Host "  準備上傳至儲存庫: $githubUser/E620-Website" -ForegroundColor Yellow
    Write-Host "========================================================" -ForegroundColor Cyan

    $repoCheck = & $ghExe repo view "$githubUser/E620-Website" 2>&1
    $repoExists = ($LASTEXITCODE -eq 0)

    if (-not $repoExists) {
        Write-Host "正在建立 GitHub 遠端儲存庫: $githubUser/E620-Website ..." -ForegroundColor Cyan
        & $ghExe repo create "E620-Website" --public --source=. --remote=origin --push
    } else {
        Write-Host "遠端儲存庫已存在，正在推送最新代碼..." -ForegroundColor Cyan
        $remotes = git remote
        if ($remotes -contains "origin") {
            git remote set-url origin "https://github.com/$githubUser/E620-Website.git"
        } else {
            git remote add origin "https://github.com/$githubUser/E620-Website.git"
        }
        git push -u origin main --force
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================================" -ForegroundColor Green
        Write-Host "  上傳成功！" -ForegroundColor Green
        Write-Host "  GitHub 專案網址: https://github.com/$githubUser/E620-Website" -ForegroundColor Yellow
        Write-Host "========================================================" -ForegroundColor Green
    }
} else {
    Write-Host "========================================================" -ForegroundColor Yellow
    Write-Host "  尚未登入 GitHub 帳號" -ForegroundColor Yellow
    Write-Host "========================================================" -ForegroundColor Yellow
    Write-Host "請使用瀏覽器或 Personal Access Token 進行登入。"
}
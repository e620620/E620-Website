@echo off
title GitHub Uploader - E620-Website
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\setup_git_and_push.ps1"
echo.
pause
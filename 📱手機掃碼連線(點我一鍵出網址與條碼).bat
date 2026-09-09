@echo off
chcp 65001 >nul
title 雙和醫院 智慧諮詢服務 - 手機掃碼伺服器與條碼
echo ========================================================
echo   📱 正在啟動伺服器並產生手機掃碼專用條碼...
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_server.ps1"

pause

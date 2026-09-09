@echo off
chcp 65001 >nul
title 知識庫 Excel 自動同步工具
echo ========================================================
echo   🔄 正在將 database/知識庫_1150120.xlsx 同步至網頁資料庫...
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync_excel_to_db.ps1"

echo.
echo ========================================================
echo   🎉 同步完成！請重新整理網頁 (F5) 查看最新問答內容。
echo ========================================================
echo.
pause

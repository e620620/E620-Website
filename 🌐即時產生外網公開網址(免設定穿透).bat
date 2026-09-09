@echo off
chcp 65001 >nul
title 雙和醫院 智慧諮詢服務 - 即時外網公開連線
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_tunnel.ps1"
pause

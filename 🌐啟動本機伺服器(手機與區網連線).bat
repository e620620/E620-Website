@echo off
chcp 65001 >nul
title 雙和醫院 智慧諮詢服務 - 伺服器
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_server.ps1"
pause

@echo off
chcp 65001 >nul
title 雙和醫院 智能問答助手 - 一鍵上傳到 GitHub (E620-Website)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup_git_and_push.ps1"
echo.
pause

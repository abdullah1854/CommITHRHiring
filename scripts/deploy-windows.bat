@echo off
setlocal
REM Double-click or run from cmd. Pulls latest, builds API, reloads PM2.
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-windows.ps1" %*
if errorlevel 1 exit /b 1

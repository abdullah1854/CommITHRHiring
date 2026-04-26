@echo off
cd /d "%~dp0\.."
echo Starting deploy watcher ^(Ctrl+C to stop^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-watch.ps1" %*

@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."
REM Vite reads PORT and API_URL from env (see artifacts/hr-platform/vite.config.ts)
if not defined PORT set PORT=5500
if not defined API_URL set API_URL=http://127.0.0.1:8081
pnpm --filter @workspace/hr-platform run dev

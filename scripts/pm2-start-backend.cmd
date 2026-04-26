@echo off
setlocal EnableExtensions
REM PM2 runs this file with interpreter: cmd.exe /c — keeps cwd/env from ecosystem.config.cjs.
REM We deliberately keep cwd at the REPO ROOT so dotenv finds the workspace .env there.
cd /d "%~dp0\.."
if not exist "artifacts\api-server\dist\index.mjs" (
  echo [aihr-backend] ERROR: artifacts\api-server\dist\index.mjs not found. Run: pnpm --filter @workspace/api-server run build
  exit /b 1
)
if not defined NODE_ENV set NODE_ENV=production
if not defined PORT set PORT=8081
echo [aihr-backend] starting from %CD% on port %PORT% (NODE_ENV=%NODE_ENV%)
node artifacts\api-server\dist\index.mjs

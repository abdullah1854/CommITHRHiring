@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0.."
set "BRANCH=%~1"
if "%BRANCH%"=="" set "BRANCH=master"

echo.
echo ============================================================
echo  AIHRHiring Deploy Script (Windows)
echo  Root : %ROOT%
echo  Branch: %BRANCH%
echo ============================================================
echo.

:: ── 1. Pull latest code ─────────────────────────────────────
echo [1/5] Pulling latest from origin/%BRANCH%...
cd /d "%ROOT%"
git fetch origin
git checkout %BRANCH%
git pull --ff-only origin %BRANCH%
if errorlevel 1 (
    echo [ERROR] git pull failed. Resolve conflicts or local commits first.
    exit /b 1
)
echo Done.
echo.

:: ── 2. Install dependencies ──────────────────────────────────
echo [2/5] Installing dependencies...
call pnpm install --ignore-scripts
if errorlevel 1 (
    echo [ERROR] pnpm install failed.
    exit /b 1
)
echo Done.
echo.

:: ── 3. Generate Prisma client ────────────────────────────────
echo [3/5] Generating Prisma client...
cd /d "%ROOT%\lib\db"
call node_modules\.bin\prisma.CMD generate --schema .\prisma\schema.prisma
cd /d "%ROOT%"
echo Done.
echo.

:: ── 4. Restart PM2 apps ──────────────────────────────────────
echo [4/5] Restarting PM2 apps...
call pm2 restart aihr-backend aihr-frontend
if errorlevel 1 (
    echo [WARN] Restart failed - attempting fresh start...
    call pm2 start "%ROOT%\ecosystem.config.cjs"
)
echo Done.
echo.

:: ── 5. Save PM2 state ────────────────────────────────────────
echo [5/5] Saving PM2 process list...
call pm2 save
echo.

echo ============================================================
echo  Deploy complete!
echo  Frontend : http://localhost:5500
echo  Backend  : http://localhost:8081
echo ============================================================
echo.

@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0.."
set "BRANCH=%~1"
set "INTERVAL=%~2"
if "%BRANCH%"=="" set "BRANCH=master"
if "%INTERVAL%"=="" set "INTERVAL=180"

echo.
echo ============================================================
echo  AIHRHiring Auto-Deploy Watcher
echo  Branch  : %BRANCH%
echo  Interval: %INTERVAL%s
echo  Press Ctrl+C to stop.
echo ============================================================
echo.

cd /d "%ROOT%"

:loop
    echo [%date% %time%] Checking for new commits on origin/%BRANCH%...
    git fetch origin >nul 2>&1

    :: Count commits ahead of local
    for /f %%i in ('git rev-list HEAD..origin/%BRANCH% --count 2^>nul') do set "BEHIND=%%i"

    if "%BEHIND%"=="0" (
        echo [%date% %time%] Already up to date. Next check in %INTERVAL%s.
    ) else (
        echo [%date% %time%] %BEHIND% new commit(s) found - deploying...
        call "%ROOT%\scripts\deploy-windows.bat" %BRANCH%
    )

    timeout /t %INTERVAL% /nobreak >nul
goto loop

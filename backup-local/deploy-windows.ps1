param(
    [string]$Branch = "master"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path "$PSScriptRoot\.."

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  AIHRHiring Deploy Script (PowerShell)"                     -ForegroundColor Cyan
Write-Host "  Root  : $Root"                                              -ForegroundColor Cyan
Write-Host "  Branch: $Branch"                                            -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $Root

# ── 1. Pull latest code ──────────────────────────────────────
Write-Host "[1/5] Pulling latest from origin/$Branch..." -ForegroundColor Yellow
git fetch origin
git checkout $Branch
git pull --ff-only origin $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] git pull failed. Resolve conflicts or local commits first." -ForegroundColor Red
    exit 1
}
Write-Host "Done." -ForegroundColor Green
Write-Host ""

# ── 2. Install dependencies ──────────────────────────────────
Write-Host "[2/5] Installing dependencies..." -ForegroundColor Yellow
pnpm install --ignore-scripts
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] pnpm install failed." -ForegroundColor Red
    exit 1
}
Write-Host "Done." -ForegroundColor Green
Write-Host ""

# ── 3. Generate Prisma client ────────────────────────────────
Write-Host "[3/5] Generating Prisma client..." -ForegroundColor Yellow
Set-Location "$Root\lib\db"
& ".\node_modules\.bin\prisma.CMD" generate --schema .\prisma\schema.prisma
Set-Location $Root
Write-Host "Done." -ForegroundColor Green
Write-Host ""

# ── 4. Restart PM2 apps ─────────────────────────────────────
Write-Host "[4/5] Restarting PM2 apps..." -ForegroundColor Yellow
pm2 restart aihr-backend aihr-frontend
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Restart failed - attempting fresh start..." -ForegroundColor DarkYellow
    pm2 start "$Root\ecosystem.config.cjs"
}
Write-Host "Done." -ForegroundColor Green
Write-Host ""

# ── 5. Save PM2 state ────────────────────────────────────────
Write-Host "[5/5] Saving PM2 process list..." -ForegroundColor Yellow
pm2 save
Write-Host "Done." -ForegroundColor Green
Write-Host ""

Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Deploy complete!"                                            -ForegroundColor Green
Write-Host "  Frontend : http://localhost:5500"                           -ForegroundColor Green
Write-Host "  Backend  : http://localhost:8081"                           -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

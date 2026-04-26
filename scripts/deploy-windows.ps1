<#
.SYNOPSIS
  Git pull, install dependencies, build API, reload PM2 (Windows).

.DESCRIPTION
  Run from the repo root (or pass -RepoPath). Requires Git, Node, pnpm, PM2.
  Typical: after pushing to GitHub, RDP to the server and run:
    .\scripts\deploy-windows.ps1

.PARAMETER Branch
  Remote branch to pull (default: main).

.PARAMETER RepoPath
  Absolute path to AIHRHiring clone (default: parent of this script's directory).

.PARAMETER SkipInstall
  Skip pnpm install (faster when deps did not change — still runs build).

.PARAMETER RepoPath
  Absolute path to repo root (default: one level above scripts/).

.EXAMPLE
  .\scripts\deploy-windows.ps1 -Branch main
#>

[CmdletBinding()]
param(
  [string]$Branch = "main",
  [string]$RepoPath = "",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

if (-not $RepoPath) {
  $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
Set-Location $RepoPath

Write-Host "=== AIHRHiring deploy ===" -ForegroundColor Cyan
Write-Host "Repo: $RepoPath"
Write-Host "Branch: $Branch"

# Git — pull latest from origin
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }
$before = git rev-parse HEAD
git checkout $Branch
if ($LASTEXITCODE -ne 0) { throw "git checkout $Branch failed" }
git pull --ff-only origin $Branch
if ($LASTEXITCODE -ne 0) {
  Write-Host "git pull --ff-only failed — try resolving conflicts locally, then pull again." -ForegroundColor Red
  throw "git pull aborted"
}
$after = git rev-parse HEAD
if ($before -eq $after) {
  Write-Host "Already up to date at $($after.Substring(0, 12))" -ForegroundColor Yellow
} else {
  Write-Host "Updated $($before.Substring(0,12)) -> $($after.Substring(0,12))" -ForegroundColor Green
}

# Dependencies
if (-not $SkipInstall) {
  Write-Host "`n[pnpm install]" -ForegroundColor Cyan
  pnpm install
}

# Prisma client (schema changes)
Write-Host "`n[prisma generate]" -ForegroundColor Cyan
pnpm --filter @workspace/db run generate

# API production bundle
Write-Host "`n[build api-server]" -ForegroundColor Cyan
pnpm --filter @workspace/api-server run build

# Optional: full monorepo build (runs typecheck + all package builds) — uncomment if you need static frontend build
# pnpm run build

# PM2
Write-Host "`n[pm2 reload]" -ForegroundColor Cyan
$eco = Join-Path $RepoPath "ecosystem.config.cjs"
if (-not (Test-Path $eco)) {
  throw "Missing ecosystem.config.cjs at $eco"
}

pm2 startOrReload $eco --update-env
pm2 save

Write-Host "`n=== Done ===" -ForegroundColor Green
pm2 list

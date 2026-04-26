<#
.SYNOPSIS
  Polls Git and runs deploy-windows.ps1 only when origin/<Branch> is ahead of HEAD.

.DESCRIPTION
  For "auto deploy after push" without GitHub webhooks: run at logon via Task Scheduler,
  or in a persistent window. Assumes the server does not keep unpushed local commits on
  that branch.

.PARAMETER IntervalSeconds
  Seconds between checks (default: 120).

.PARAMETER Branch
  Branch to track (default: main).

.PARAMETER RepoPath
  Repo root (default: parent of scripts/).
#>

[CmdletBinding()]
param(
  [string]$Branch = "main",
  [int]$IntervalSeconds = 120,
  [string]$RepoPath = ""
)

$ErrorActionPreference = "Continue"
if (-not $RepoPath) {
  $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$deployScript = Join-Path $PSScriptRoot "deploy-windows.ps1"

Write-Host "[deploy-watch] Repo=$RepoPath branch=$Branch every ${IntervalSeconds}s — Ctrl+C to stop" -ForegroundColor Cyan

while ($true) {
  try {
    Set-Location $RepoPath
    git fetch origin $Branch 2>$null | Out-Null
    git checkout $Branch 2>$null | Out-Null
    $behind = 0
    $revList = git rev-list "HEAD..origin/$Branch" --count 2>$null
    if ($revList -match '^\d+$') { $behind = [int]$revList }

    if ($behind -gt 0) {
      Write-Host "`n[$(Get-Date -Format o)] origin/$Branch is $behind commit(s) ahead — deploying..." -ForegroundColor Yellow
      & powershell -NoProfile -ExecutionPolicy Bypass -File $deployScript -Branch $Branch -RepoPath $RepoPath
      if ($LASTEXITCODE -ne 0) {
        Write-Host "[deploy-watch] Deploy failed (exit $LASTEXITCODE)" -ForegroundColor Red
      }
    }
  } catch {
    Write-Host "[deploy-watch] Error: $_" -ForegroundColor Red
  }
  Start-Sleep -Seconds $IntervalSeconds
}

# Automate the final-results data process:
# 1. Settle pending cards (ESPN box scores -> outcomes in results.db)
# 2. Export results_summary.json (Day/Week/Month/LT/Past + legStats)
# 3. Optionally copy results_summary.json into web-dashboard/public/data for next deploy
#
# Usage (from repo root):
#   .\scripts\run_final_results.ps1                    # settle today's cards, export, copy to dashboard data
#   .\scripts\run_final_results.ps1 -AllPending       # settle all pending cards
#   .\scripts\run_final_results.ps1 -Date "2026-03-06" # settle cards from that date
#   .\scripts\run_final_results.ps1 -DryRun            # settle dry-run only (no DB write)
#   .\scripts\run_final_results.ps1 -NoCopy            # do not copy results_summary.json to web-dashboard

param(
    [switch] $AllPending,
    [string] $Date,
    [switch] $DryRun,
    [switch] $NoCopy
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot   # repo root (parent of scripts/)
Set-Location $root

# 1) Settle
$settleArgs = @()
if ($DryRun) { $settleArgs += "--dry-run" }
if ($AllPending) { $settleArgs += "--all-pending" }
elseif ($Date) { $settleArgs += "--date"; $settleArgs += $Date }

Write-Host "=== 1. Settle results ===" -ForegroundColor Cyan
& python scripts/settle_results.py @settleArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "Settle failed (exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 2) Export summary
Write-Host "`n=== 2. Export results summary ===" -ForegroundColor Cyan
& python scripts/export_results_summary.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "Export failed (exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 3) Copy to dashboard data (so next build/deploy has latest)
if (-not $NoCopy) {
    $src = Join-Path $root "web-dashboard\public\data\results_summary.json"
    if (Test-Path $src) {
        Write-Host "`n=== 3. results_summary.json is in web-dashboard/public/data (ready for build/deploy) ===" -ForegroundColor Cyan
    } else {
        Write-Host "`n(results_summary.json not found at $src)" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n(Skipping copy; -NoCopy specified)" -ForegroundColor Gray
}

Write-Host "`nDone. Run 'npm run deploy:ftp' or push to deploy dashboard with latest results." -ForegroundColor Green

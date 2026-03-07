# run_odds_api_preview.ps1 — Preview Odds API output vs current pipeline (safe mode)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "`n=== ODDS API PREVIEW (safe mode) ===" -ForegroundColor Cyan
Write-Host "  USE_ODDS_API is NOT activated — this is comparison-only." -ForegroundColor Yellow

$envFile = Join-Path $root "config\.env"
$hasKey = $false
if (Test-Path $envFile) {
  $content = Get-Content $envFile -Encoding UTF8 -Raw
  if ($content -match "ODDS_API_KEY=\S+") { $hasKey = $true }
}

if (-not $hasKey) {
  Write-Host "`n  No ODDS_API_KEY found in config/.env" -ForegroundColor Red
  Write-Host "  Set ODDS_API_KEY in config/.env to enable preview." -ForegroundColor Yellow
  Write-Host "  Get a key at: https://the-odds-api.com/" -ForegroundColor Cyan
  exit 1
}

$fetchOdds = Join-Path $root "src\fetch_odds_api.ts"
if (-not (Test-Path $fetchOdds)) {
  Write-Host "  src/fetch_odds_api.ts not found — scaffold missing" -ForegroundColor Red
  exit 1
}

Write-Host "`n  Odds API scaffold exists and key is configured."
Write-Host "  To enable in pipeline: set USE_ODDS_API=true in config/.env"
Write-Host "  Current status: PREVIEW ONLY (no pipeline changes)"
Write-Host "`n  Next steps:"
Write-Host "    1. Run: node -e ""require('ts-node').register({transpileOnly:true}); require('./src/fetch_odds_api')"""
Write-Host "    2. Compare output with SGO odds in merge_report*.csv"
Write-Host "    3. When satisfied, set USE_ODDS_API=true" -ForegroundColor Green
exit 0

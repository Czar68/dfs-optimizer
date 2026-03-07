# run_fresh_local.ps1 — Fresh data only (no build, no deploy)
# Generates fresh CSVs from live sources and copies to dashboard public/data

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "`n=== FRESH DATA (local only) ===" -ForegroundColor Cyan
Push-Location $root
cmd /c "node scripts/run-generate.js --platform both --bankroll 600 --volume --no-require-alt-lines 2>&1"
$genExit = $LASTEXITCODE
Pop-Location

if ($genExit -ne 0) {
  Write-Host "FAIL: Generator exited $genExit" -ForegroundColor Red
  exit $genExit
}

$publicData = Join-Path $root "web-dashboard\public\data"
New-Item $publicData -ItemType Directory -Force | Out-Null
$names = @("prizepicks-cards.csv","prizepicks-legs.csv","underdog-cards.csv","underdog-legs.csv")
foreach ($n in $names) {
  $src = Join-Path $root $n
  $dst = Join-Path $publicData $n
  if (Test-Path $src) { Copy-Item $src $dst -Force; Write-Host "  $n -> public/data/" }
  else { Write-Host "  MISSING: $n" -ForegroundColor Yellow }
}

Write-Host "`nDONE — fresh data in root + web-dashboard/public/data" -ForegroundColor Green
exit 0

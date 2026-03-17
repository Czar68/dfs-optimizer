# scripts/track-results.ps1
# Scrape/update recent dates and refresh perf tracker (append result + scrape_stat).
# After successful scrape, runs post-results model refresh (CLV, correlation matrix, true-prob model).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $root) { $root = (Get-Location).Path }
Set-Location $root

$script = Join-Path $root "dist\scrape_nba_leg_results.js"
if (Test-Path $script) {
  & node $script
} else {
  Write-Host "Run 'npm run compile' first, or: npx ts-node src/scrape_nba_leg_results.ts"
  & npx ts-node (Join-Path $root "src\scrape_nba_leg_results.ts")
}

$scrapeExit = $LASTEXITCODE
if ($scrapeExit -ne 0) {
  Write-Error "[TRACK-RESULTS] Scrape failed (exit $scrapeExit). Post-results model refresh is skipped."
  exit $scrapeExit
}

Write-Host "[TRACK-RESULTS] Scrape succeeded. Running post-results model refresh..."
$refreshExit = 0
try {
  npx ts-node (Join-Path $root "scripts\run_post_results_model_refresh.ts") 2>&1
  $refreshExit = $LASTEXITCODE
} catch {
  Write-Warning "[TRACK-RESULTS] Post-results refresh failed (non-fatal for track-results): $($_.Exception.Message)"
  $refreshExit = 1
}

if ($refreshExit -ne 0) {
  Write-Warning "[TRACK-RESULTS] Model refresh exited $refreshExit. Check artifacts/post-results-model-refresh.json"
}
exit $scrapeExit

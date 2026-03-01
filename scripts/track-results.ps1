# scripts/track-results.ps1
# Scrape/update recent dates and refresh perf tracker (append result + scrape_stat).

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

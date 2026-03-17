# Step 3: Odds bucket calibration report.
# Reads data/perf_tracker.jsonl (rows with result + impliedProb/odds), prints table by bucket and side.
# Usage: .\scripts\odds-calibration-report.ps1 [-ByBook] [-NoCompile]

param([switch]$ByBook, [switch]$NoCompile)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $NoCompile) {
  npx tsc -p . 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Error "Compile failed"; exit 1 }
}

$nodeArgs = @("dist/src/odds_calibration_report.js")
if ($ByBook) { $nodeArgs += "--by-book" }
& node $nodeArgs
exit $LASTEXITCODE

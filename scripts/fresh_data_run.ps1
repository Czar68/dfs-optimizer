# fresh_data_run.ps1 — Full fresh production data build + validation
# 1) Delete stale CSV outputs (not source). 2) Run generator. 3) Copy CSVs to dashboard data. 4) Build dashboard. 5) Validate.

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-CsvRowCount($path) {
  if (-not (Test-Path $path)) { return -1, $null }
  $lines = Get-Content $path -Encoding UTF8
  $header = $lines[0]
  $dataRows = [Math]::Max(0, $lines.Count - 1)
  return $dataRows, $header
}

Write-Host "`n=== 1) CLEAN STALE OUTPUTS ===" -ForegroundColor Cyan
$toRemove = @(
  (Join-Path $root "prizepicks-cards.csv"),
  (Join-Path $root "prizepicks-legs.csv"),
  (Join-Path $root "underdog-cards.csv"),
  (Join-Path $root "underdog-legs.csv"),
  (Join-Path $root "web-dashboard\dist\data\prizepicks-cards.csv"),
  (Join-Path $root "web-dashboard\dist\data\prizepicks-legs.csv"),
  (Join-Path $root "web-dashboard\dist\data\underdog-cards.csv"),
  (Join-Path $root "web-dashboard\dist\data\underdog-legs.csv")
)
foreach ($f in $toRemove) {
  if (Test-Path $f) { Remove-Item $f -Force; Write-Host "  removed $f" }
}
$publicData = Join-Path $root "web-dashboard\public\data"
if (Test-Path $publicData) {
  Get-ChildItem $publicData -Filter "*.csv" | Remove-Item -Force
  Write-Host "  cleared web-dashboard/public/data/*.csv"
}
Write-Host "  done.`n"

Write-Host "=== 2) RUN PRODUCTION PIPELINE ===" -ForegroundColor Cyan
Push-Location $root
# Use cmd.exe to avoid PowerShell treating Node stderr as errors
cmd /c "node scripts/run-generate.js --platform both --bankroll 600 --volume --no-require-alt-lines 2>&1"
$genExit = $LASTEXITCODE
Pop-Location
if ($genExit -ne 0) {
  Write-Host "`nFAIL: Generator exited $genExit" -ForegroundColor Red
  exit $genExit
}

Write-Host "`n=== 3) COPY ROOT CSVs TO DASHBOARD DATA ===" -ForegroundColor Cyan
$names = @("prizepicks-cards.csv","prizepicks-legs.csv","underdog-cards.csv","underdog-legs.csv")
New-Item (Join-Path $root "web-dashboard\public\data") -ItemType Directory -Force | Out-Null
foreach ($n in $names) {
  $src = Join-Path $root $n
  $dst = Join-Path $root "web-dashboard\public\data" $n
  if (Test-Path $src) { Copy-Item $src $dst -Force; Write-Host "  $n -> public/data/" }
  else { Write-Host "  MISSING (root): $n" -ForegroundColor Yellow }
}

Write-Host "`n=== 4) BUILD DASHBOARD ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "web-dashboard")
npm run build 2>&1 | Out-Null
Pop-Location
Write-Host "  built web-dashboard/dist`n"

Write-Host "=== 5) VALIDATE FOUR CSVs (dist/data) ===" -ForegroundColor Cyan
$required = @(
  "underdog-cards.csv",
  "underdog-legs.csv",
  "prizepicks-cards.csv",
  "prizepicks-legs.csv"
)
$fail = $false
foreach ($name in $required) {
  $path = Join-Path $root "web-dashboard\dist\data" $name
  $rows, $header = Get-CsvRowCount $path
  $headerOnly = ($rows -eq 0)
  Write-Host "  $name"
  Write-Host "    path:   $path"
  Write-Host "    rows:   $rows"
  Write-Host "    header: $($header.Substring(0, [Math]::Min(80, $header.Length)))..."
  if ($rows -lt 0) {
    Write-Host "    status: MISSING" -ForegroundColor Red
    $fail = $true
  } elseif ($headerOnly) {
    Write-Host "    status: HEADER-ONLY (fail)" -ForegroundColor Red
    $fail = $true
  } else {
    Write-Host "    status: OK" -ForegroundColor Green
  }
}
if ($fail) {
  Write-Host "`nFAIL: One or more CSVs missing or header-only. Fix generator first." -ForegroundColor Red
  exit 1
}
Write-Host "`nPASS: All four CSVs exist and have data rows." -ForegroundColor Green
exit 0

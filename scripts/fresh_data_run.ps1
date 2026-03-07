# fresh_data_run.ps1 — Full fresh production data build + validation
# 1) Delete stale CSV outputs. 2) Run generator. 3) Copy CSVs to dashboard.
# 4) Write manifest. 5) Build dashboard. 6) Copy manifest to dist. 7) Validate.

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
  $mf = Join-Path $publicData "last_fresh_run.json"
  if (Test-Path $mf) { Remove-Item $mf -Force }
  Write-Host "  cleared web-dashboard/public/data/"
}
Write-Host "  done.`n"

Write-Host "=== 2) RUN PRODUCTION PIPELINE ===" -ForegroundColor Cyan
Push-Location $root
cmd /c "node scripts/run-generate.js --platform both --bankroll 600 --volume --no-require-alt-lines 2>&1"
$genExit = $LASTEXITCODE
Pop-Location
if ($genExit -ne 0) {
  Write-Host "`nFAIL: Generator exited $genExit" -ForegroundColor Red
  exit $genExit
}

Write-Host "`n=== 3) COPY ROOT CSVs TO DASHBOARD DATA ===" -ForegroundColor Cyan
$names = @("prizepicks-cards.csv","prizepicks-legs.csv","underdog-cards.csv","underdog-legs.csv")
New-Item $publicData -ItemType Directory -Force | Out-Null
foreach ($n in $names) {
  $src = Join-Path $root $n
  $dst = Join-Path $publicData $n
  if (Test-Path $src) { Copy-Item $src $dst -Force; Write-Host "  $n -> public/data/" }
  else { Write-Host "  MISSING (root): $n" -ForegroundColor Yellow }
}

Write-Host "`n=== 4) WRITE MANIFEST ===" -ForegroundColor Cyan
$artifactsDir = Join-Path $root "artifacts"
New-Item $artifactsDir -ItemType Directory -Force | Out-Null
$csvStats = @{}
foreach ($n in $names) {
  $csvPath = Join-Path $root $n
  if (Test-Path $csvPath) {
    $f = Get-Item $csvPath
    $rowCount = [Math]::Max(0, (Get-Content $csvPath -Encoding UTF8).Count - 1)
    $csvStats[$n] = @{ rows = $rowCount; modified = $f.LastWriteTime.ToString("o"); size = $f.Length }
  }
}
$manifest = @{
  fresh_run_completed_at = (Get-Date).ToString("o")
  bankroll = 600
  csv_stats = $csvStats
} | ConvertTo-Json -Depth 4
$manifestPath = Join-Path $artifactsDir "last_fresh_run.json"
Set-Content $manifestPath $manifest -Encoding UTF8
Copy-Item $manifestPath (Join-Path $publicData "last_fresh_run.json") -Force
Write-Host "  Manifest: $manifestPath + public/data/"

Write-Host "`n=== 5) BUILD DASHBOARD ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "web-dashboard")
npm run build 2>&1 | Out-Null
Pop-Location
Write-Host "  built web-dashboard/dist"

# Add build asset hashes to manifest and copy to dist
$distData = Join-Path $root "web-dashboard\dist\data"
$distAssetsDir = Join-Path $root "web-dashboard\dist\assets"
$jsHash = ""; $cssHash = ""
if (Test-Path $distAssetsDir) {
  $jsFile = Get-ChildItem $distAssetsDir -Filter "*.js" | Select-Object -First 1
  $cssFile = Get-ChildItem $distAssetsDir -Filter "*.css" | Select-Object -First 1
  if ($jsFile) { $jsHash = $jsFile.Name }
  if ($cssFile) { $cssHash = $cssFile.Name }
}
$manifestObj = Get-Content $manifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
$manifestObj | Add-Member -NotePropertyName "build_assets" -NotePropertyValue @{ js = $jsHash; css = $cssHash } -Force
$manifestObj | ConvertTo-Json -Depth 4 | Set-Content $manifestPath -Encoding UTF8
Copy-Item $manifestPath (Join-Path $distData "last_fresh_run.json") -Force
Write-Host "  Updated manifest with build hashes`n"

Write-Host "=== 6) VALIDATE FOUR CSVs (dist/data) ===" -ForegroundColor Cyan
$required = @("underdog-cards.csv","underdog-legs.csv","prizepicks-cards.csv","prizepicks-legs.csv")
$fail = $false
foreach ($name in $required) {
  $path = Join-Path $distData $name
  $rows, $header = Get-CsvRowCount $path
  $headerOnly = ($rows -eq 0)
  Write-Host "  $name"
  Write-Host "    rows:   $rows"
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
  Write-Host "`nFAIL: One or more CSVs missing or header-only." -ForegroundColor Red
  exit 1
}
Write-Host "`nPASS: All four CSVs exist and have data rows." -ForegroundColor Green
exit 0

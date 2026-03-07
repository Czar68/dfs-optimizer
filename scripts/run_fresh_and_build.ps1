# run_fresh_and_build.ps1 — Fresh data + dashboard build + manifest
# Full local pipeline: generate -> copy -> build -> validate -> manifest

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$startTime = Get-Date

# 1) Run the fresh pipeline (generate + copy + build + validate)
Write-Host "`n=== STEP 1: Run fresh pipeline ===" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "fresh_data_run.ps1")
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAIL: fresh_data_run.ps1 exited $LASTEXITCODE" -ForegroundColor Red
  exit $LASTEXITCODE
}

# 2) Write manifest
Write-Host "`n=== STEP 2: Write manifest ===" -ForegroundColor Cyan
$artifactsDir = Join-Path $root "artifacts"
New-Item $artifactsDir -ItemType Directory -Force | Out-Null

$csvNames = @("prizepicks-cards.csv","prizepicks-legs.csv","underdog-cards.csv","underdog-legs.csv")
$csvStats = @{}
foreach ($n in $csvNames) {
  $p = Join-Path $root $n
  if (Test-Path $p) {
    $f = Get-Item $p
    $lines = (Get-Content $p -Encoding UTF8).Count
    $csvStats[$n] = @{ rows = [Math]::Max(0, $lines - 1); modified = $f.LastWriteTime.ToString("o"); size = $f.Length }
  } else {
    $csvStats[$n] = @{ rows = 0; modified = $null; size = 0 }
  }
}

$distAssets = Join-Path $root "web-dashboard\dist\assets"
$jsHash = ""; $cssHash = ""
if (Test-Path $distAssets) {
  $jsFile = Get-ChildItem $distAssets -Filter "*.js" | Select-Object -First 1
  $cssFile = Get-ChildItem $distAssets -Filter "*.css" | Select-Object -First 1
  if ($jsFile) { $jsHash = $jsFile.Name }
  if ($cssFile) { $cssHash = $cssFile.Name }
}

$manifest = @{
  fresh_run_completed_at = (Get-Date).ToString("o")
  elapsed_seconds = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
  bankroll = 600
  csv_stats = $csvStats
  build_assets = @{ js = $jsHash; css = $cssHash }
} | ConvertTo-Json -Depth 4

$manifestPath = Join-Path $artifactsDir "last_fresh_run.json"
Set-Content $manifestPath $manifest -Encoding UTF8
Write-Host "  Manifest: $manifestPath" -ForegroundColor Green

Write-Host "`nDONE — fresh + build + manifest complete" -ForegroundColor Green
exit 0

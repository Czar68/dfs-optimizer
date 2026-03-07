# health_check.ps1 -- Full system health check (no data regeneration)
$ErrorActionPreference = "Continue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-CsvRowCount($path) {
  if (-not (Test-Path $path)) { return -1 }
  return [Math]::Max(0, (Get-Content $path -Encoding UTF8).Count - 1)
}

Write-Host ""
Write-Host "=============== DFS OPTIMIZER HEALTH CHECK ===============" -ForegroundColor Cyan

# 1) Node / ts-node
Write-Host ""
Write-Host "--- Runtime ---"
$nodeVer = & node -v 2>$null
Write-Host "  Node: $nodeVer"
$tsNode = & node -e "try{require('ts-node');console.log('OK')}catch(e){console.log('MISSING')}" 2>$null
Write-Host "  ts-node: $tsNode"

# 2) node_modules
Write-Host ""
Write-Host "--- Dependencies ---"
$nm = Test-Path (Join-Path $root "node_modules")
$wnm = Test-Path (Join-Path $root "web-dashboard\node_modules")
if ($nm) { Write-Host "  root node_modules: OK" } else { Write-Host "  root node_modules: MISSING" -ForegroundColor Red }
if ($wnm) { Write-Host "  web-dashboard node_modules: OK" } else { Write-Host "  web-dashboard node_modules: MISSING" -ForegroundColor Red }

# 3) Root CSVs
Write-Host ""
Write-Host "--- Root CSVs ---"
$csvNames = @("prizepicks-cards.csv","prizepicks-legs.csv","underdog-cards.csv","underdog-legs.csv")
foreach ($n in $csvNames) {
  $p = Join-Path $root $n
  $rows = Get-CsvRowCount $p
  if ($rows -lt 0) {
    Write-Host "  $n : MISSING" -ForegroundColor Red
  } elseif ($rows -eq 0) {
    Write-Host "  $n : HEADER-ONLY" -ForegroundColor Yellow
  } else {
    $mod = (Get-Item $p).LastWriteTime.ToString("yyyy-MM-dd HH:mm")
    Write-Host "  $n : $rows rows | modified $mod" -ForegroundColor Green
  }
}

# 4) Dashboard dist
Write-Host ""
Write-Host "--- Dashboard dist ---"
$distDataDir = Join-Path $root "web-dashboard\dist\data"
if (-not (Test-Path $distDataDir)) {
  Write-Host "  dist/data/: MISSING - dashboard has no data!" -ForegroundColor Red
} else {
  foreach ($n in $csvNames) {
    $dp = Join-Path $distDataDir $n
    $drows = Get-CsvRowCount $dp
    if ($drows -lt 0) {
      Write-Host "  dist/data/$n : MISSING" -ForegroundColor Red
    } else {
      Write-Host "  dist/data/$n : $drows rows" -ForegroundColor Green
    }
  }
}
$distAssets = Join-Path $root "web-dashboard\dist\assets"
if (Test-Path $distAssets) {
  $jsFile = Get-ChildItem $distAssets -Filter "*.js" -ErrorAction SilentlyContinue | Select-Object -First 1
  $cssFile = Get-ChildItem $distAssets -Filter "*.css" -ErrorAction SilentlyContinue | Select-Object -First 1
  $jsName = "MISSING"; if ($jsFile) { $jsName = $jsFile.Name }
  $cssName = "MISSING"; if ($cssFile) { $cssName = $cssFile.Name }
  Write-Host "  JS:  $jsName"
  Write-Host "  CSS: $cssName"
}

# 5) Manifest
Write-Host ""
Write-Host "--- Manifest ---"
$manifestPath = Join-Path $root "artifacts\last_fresh_run.json"
if (Test-Path $manifestPath) {
  $m = Get-Content $manifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
  Write-Host "  Last run: $($m.fresh_run_completed_at)"
  Write-Host "  Bankroll: $($m.bankroll)"
} else {
  Write-Host "  No manifest - run run_fresh_and_build.ps1 first" -ForegroundColor Yellow
}

# 6) Results DB
Write-Host ""
Write-Host "--- Results DB ---"
$dbPath = Join-Path $root "results\results.db"
if (Test-Path $dbPath) {
  $dbFile = Get-Item $dbPath
  Write-Host "  DB: $($dbFile.Length) bytes | $($dbFile.LastWriteTime)" -ForegroundColor Green
} else {
  Write-Host "  DB: not created yet" -ForegroundColor Yellow
}

# 7) Kelly config
Write-Host ""
Write-Host "--- Kelly Config ---"
$kellyFile = Join-Path $root "src\kelly_staking.ts"
if (Test-Path $kellyFile) {
  $lines = Get-Content $kellyFile -Encoding UTF8
  foreach ($line in $lines) {
    if ($line -match 'CONSERVATIVE_KELLY_DIVISOR') { Write-Host "  $($line.Trim())" }
    if ($line -match 'MAX_STAKE_PER_CARD') { Write-Host "  $($line.Trim())" }
    if ($line -match 'MAX_BANKROLL_PCT_PER_CARD') { Write-Host "  $($line.Trim())" }
    if ($line -match 'MIN_STAKE\s') { Write-Host "  $($line.Trim())" }
  }
}

Write-Host ""
Write-Host "=============== HEALTH CHECK COMPLETE ===============" -ForegroundColor Cyan
Write-Host ""

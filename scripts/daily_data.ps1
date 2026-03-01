# 6PM daily data: SGO NBA props by date + PrizePicks/Underdog imports
# Task Scheduler: NBA-Data-6PM daily 18:00
# SGO v2/events: https://api.sportsgameodds.com/v2/events (apiKey + sportID=BASKETBALL, leagueID=NBA, oddsAvailable=true)
# Expected JSON: { "data": [ { "eventID", "sportID", "leagueID", "teams", "status", "players", "odds" }, ... ], "nextCursor"?: "..." }
# Test curl: curl -s "https://api.sportsgameodds.com/v2/events?apiKey=d53cf705adaac1b1e81f442545b45eae&sportID=BASKETBALL&leagueID=NBA&oddsAvailable=true"
param([switch]$DryRun)
$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { Get-Location }
Set-Location $root

$sgoKey = if ($env:SGO_API_KEY) { $env:SGO_API_KEY } else { $env:SGO_KEY }
if (-not $sgoKey) { Write-Warning "Set `$env:SGO_KEY or `$env:SGO_API_KEY"; return }
$date = Get-Date -Format "yyyy-MM-dd"
$ts = Get-Date -Format "yyyyMMdd_HHmm"
$cacheDir = "cache"
if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }

try {
    $uri = "https://api.sportsgameodds.com/v2/events?apiKey=$sgoKey&sportID=BASKETBALL&leagueID=NBA&oddsAvailable=true"
    Write-Host "Fetching SGO: $uri"
    $sgo = (Invoke-WebRequest -Uri $uri -UseBasicParsing).Content | ConvertFrom-Json
    $sgo | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $cacheDir "sgo_nba_$ts.json") -Encoding utf8
} catch { Write-Warning "SGO fetch failed: $_" }

if (Test-Path "$PSScriptRoot\import_prizepicks.ps1") {
    & "$PSScriptRoot\import_prizepicks.ps1" -DryRun:$DryRun
}
if (Test-Path "$PSScriptRoot\import_underdog.ps1") {
    & "$PSScriptRoot\import_underdog.ps1" -DryRun:$DryRun
}

Write-Host "6PM DATA COMPLETE -> cache updated"

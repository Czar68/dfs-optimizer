# scripts/perf-report.ps1
# Table: top edges + live edge Telegram push
# Usage:
#   .\scripts\perf-report.ps1              # perf table + live edges (no Telegram)
#   .\scripts\perf-report.ps1 -Telegram    # perf table + live edges + Telegram push
#   .\scripts\perf-report.ps1 -TopN 30     # show top 30

param(
    [int]$TopN = 20,
    [switch]$Telegram
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $ScriptDir
if (-not $root) { $root = (Get-Location).Path }
Set-Location $root

# Load .env
$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        $line = $line.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
            [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
        }
    }
}

# Step 1: Perf calibration table (existing)
Write-Host "`n=== Perf Tracker: Calibration Buckets ===" -ForegroundColor Cyan
$perfScript = Join-Path $root "dist\perf_report.js"
if (Test-Path $perfScript) {
    node $perfScript $TopN
} else {
    Write-Host "dist/ not compiled -- using ts-node fallback"
    npx ts-node (Join-Path $root "src\perf_report.ts") $TopN
}

# Step 2: Live edges + Kelly sizing (+ optional Telegram)
Write-Host "`n=== Live Edges + Kelly Staking ===" -ForegroundColor Cyan

$ppCards = 0; $udCards = 0; $ppMaxEv = "n/a"
if (Test-Path "prizepicks-cards.csv") {
    $ppCards = (Import-Csv "prizepicks-cards.csv").Count
    $allCards = Import-Csv "prizepicks-cards.csv"
    if ($allCards.Count -gt 0 -and $allCards[0].PSObject.Properties.Name -contains "cardEv") {
        $maxVal = ($allCards | ForEach-Object { [double]$_.cardEv } | Measure-Object -Maximum).Maximum
        $ppMaxEv = "{0:N2}%" -f ($maxVal * 100)
    }
}
if (Test-Path "underdog-cards.csv") {
    $udCards = (Import-Csv "underdog-cards.csv").Count
}

$bankroll = 1000
if ($env:BANKROLL) { $bankroll = [int]$env:BANKROLL }

$liveScript = Join-Path $root "dist\live_edge_pusher.js"
$liveArgs = @($liveScript, "--top", $TopN, "--bankroll", $bankroll,
              "--pp-cards", $ppCards, "--ud-cards", $udCards, "--pp-max-ev", $ppMaxEv)
if ($Telegram) { $liveArgs += "--telegram" }

if (Test-Path $liveScript) {
    node @liveArgs
} else {
    Write-Host "dist/ not compiled -- using ts-node fallback"
    npx ts-node (Join-Path $root "src\live_edge_pusher.ts") @liveArgs
}

Write-Host "`nDone." -ForegroundColor Green

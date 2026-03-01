# Canonical full pipeline: compile + SGO/PP/UD/TRD + legs/cards + tier1/2 + sheets + telegram. Writes artifacts.
param([switch]$Force, [switch]$DryRun, [double]$bankroll = 700)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

. "$PSScriptRoot\_auto_window.ps1"
if (-not (Test-AutoWindow -Force:$Force) -and -not $DryRun) {
  Write-Output "Outside window. Use -Force."
  exit 0
}

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path "artifacts","artifacts\logs" | Out-Null

if ($DryRun) {
  '{"flow":"nba_optimizer","status":"dry_run_ok","ts":"' + $ts + '"}' | Out-File "artifacts\last_run.json" -Encoding utf8
  "Dry run OK ($ts)" | Out-File "artifacts\nba_optimizer_$ts.md" -Encoding utf8
  Write-Output "Dry run OK; artifacts\last_run.json written."
  exit 0
}

$env:BANKROLL = [string]$bankroll
$logPath = "artifacts\logs\run_$ts.txt"

# 1) Compile
try {
  npx tsc -p . 2>&1 | Tee-Object -FilePath $logPath -Append
  if ($LASTEXITCODE -ne 0) { throw "Compile failed" }
} catch {
  "Build failed" | Out-File "artifacts\logs\build_$ts.failed.txt"
  '{"flow":"nba_optimizer","status":"failed","ts":"' + $ts + '","error":"compile"}' | Out-File "artifacts\last_run.json" -Encoding utf8
  throw
}

# 2) Full pipeline: platform both, innovative, telegram, providers PP,UD,TRD
$nodeArgs = @(
  "dist/run_optimizer.js",
  "--platform", "both",
  "--innovative",
  "--telegram",
  "--bankroll", [string]$bankroll,
  "--providers", "PP,UD,TRD",
  "--sports", "NBA"
)
try {
  & node $nodeArgs 2>&1 | Tee-Object -FilePath $logPath -Append
  if ($LASTEXITCODE -ne 0) { throw "Optimizer exited $LASTEXITCODE" }
} catch {
  "Run failed" | Out-File "artifacts\logs\run_$ts.failed.txt"
  '{"flow":"nba_optimizer","status":"failed","ts":"' + $ts + '","error":"optimizer"}' | Out-File "artifacts\last_run.json" -Encoding utf8
  throw
}

# 3) Extract metrics from run log and output files
$logContent = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
$ppLegs = 0
$udCards = 0
$sheetsPushed = $false
$telegramSent = $false

if (Test-Path "prizepicks-legs.csv") { $ppLegs = (Get-Content "prizepicks-legs.csv" | Measure-Object -Line).Lines - 1; if ($ppLegs -lt 0) { $ppLegs = 0 } }
if (Test-Path "underdog-cards.csv") { $udCards = (Get-Content "underdog-cards.csv" | Measure-Object -Line).Lines - 1; if ($udCards -lt 0) { $udCards = 0 } }
if ($logContent -match "Pushed \d+ rows") { $sheetsPushed = $true }
if ($logContent -match "DONE:") { $sheetsPushed = $true }
if ($logContent -match "message sent|Telegram.*sent|UD top-5 message sent") { $telegramSent = $true }

$t1 = 0
$t2 = 0
if (Test-Path "tier1.csv") { $t1 = (Get-Content "tier1.csv" | Measure-Object -Line).Lines - 1; if ($t1 -lt 0) { $t1 = 0 } }
if (Test-Path "tier2.csv") { $t2 = (Get-Content "tier2.csv" | Measure-Object -Line).Lines - 1; if ($t2 -lt 0) { $t2 = 0 } }

# 4) Write artifacts contract
$json = @{
  flow = "nba_optimizer"
  status = "success"
  ts = $ts
  metrics = @{
    pp_legs = $ppLegs
    ud_cards = $udCards
    tier1 = $t1
    tier2 = $t2
    sheets_pushed = $sheetsPushed
    telegram_sent = $telegramSent
  }
} | ConvertTo-Json -Compress
$json | Out-File "artifacts\last_run.json" -Encoding utf8

$report = @"
# NBA Optimizer Run $ts

| Metric | Value |
|--------|-------|
| PP legs | $ppLegs |
| UD cards | $udCards |
| Tier1 | $t1 |
| Tier2 | $t2 |
| Sheets pushed | $sheetsPushed |
| Telegram sent | $telegramSent |

Logs: artifacts\logs\run_$ts.txt
Machine: artifacts\last_run.json
"@
$report | Out-File "artifacts\nba_optimizer_$ts.md" -Encoding utf8

Write-Output "Wrote artifacts\last_run.json (status=success) and artifacts\nba_optimizer_$ts.md"

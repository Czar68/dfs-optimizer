# scripts/init_perf_tracker.ps1
# Ensure data/ and perf_tracker.jsonl exist; optionally backfill from tier1/tier2 + legs (last run).
# Usage: .\scripts\init_perf_tracker.ps1 [-SkipBackfill]

param([switch]$SkipBackfill)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $root) { $root = (Get-Location).Path }
Set-Location $root

$dataDir = Join-Path $root "data"
$trackerPath = Join-Path $dataDir "perf_tracker.jsonl"

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
    Write-Host "[PerfTracker] Created data/"
}

$samples = @'
# perf_tracker.jsonl - one JSON object per line: date, leg_id, player, stat, line, book, trueProb, projectedEV, playedEV, kelly, card_tier, opp?, scrape_stat?, result?, hist_mult?
{"date":"2026-02-22","leg_id":"sample-rebounds-5.5","player":"GG Jackson","stat":"rebounds","line":5.5,"book":"fanduel","trueProb":0.532,"projectedEV":0.032,"playedEV":0.032,"kelly":0.18,"card_tier":2,"scrape_stat":6,"result":1,"hist_mult":null}
{"date":"2026-02-22","leg_id":"sample-assists-1.5","player":"Devin Vassell","stat":"assists","line":1.5,"book":"fanduel","trueProb":0.528,"projectedEV":0.028,"playedEV":0.028,"kelly":0.15,"card_tier":2,"scrape_stat":1,"result":0,"hist_mult":null}
{"date":"2026-02-22","leg_id":"sample-points-8.5","player":"Ausar Thompson","stat":"points","line":8.5,"book":"fanduel","trueProb":0.528,"projectedEV":0.028,"playedEV":0.028,"kelly":0.12,"card_tier":1,"scrape_stat":11,"result":1,"hist_mult":null}
'@

if (-not (Test-Path $trackerPath)) {
    Set-Content -Path $trackerPath -Value $samples -Encoding UTF8
    Write-Host "[PerfTracker] Created perf_tracker.jsonl with sample rows"
}

if (-not $SkipBackfill) {
    $distScript = Join-Path $root "dist\backfill_perf_tracker.js"
    if (Test-Path $distScript) {
        & node $distScript
    } else {
        Write-Host "[PerfTracker] Run 'npm run compile' then re-run this script to backfill from tier CSVs, or use -SkipBackfill"
    }
}

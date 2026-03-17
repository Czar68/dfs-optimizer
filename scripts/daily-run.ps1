# daily-run.ps1
# Cron-like daily driver: run-both -Fresh + telegram + quota log
# Usage: .\scripts\daily-run.ps1 [-Sport NBA|NCAAB|All]
# Schedule via Task Scheduler or cron to run once per day (e.g. morning before slate lock).

param(
    [Parameter(Mandatory=$false)]
    [double]$bankroll = 600,

    [Parameter(Mandatory=$false)]
    [ValidateSet("NBA", "NCAAB", "All")]
    [string]$Sport = "NBA"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

$logFile = Join-Path $PSScriptRoot "daily-run.log"
function Write-Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

Write-Log "[DAILY] ========== Run started =========="

if ($env:USE_MOCK_ODDS -eq "1") {
    Write-Error "[SAFETY] USE_MOCK_ODDS=1 is set in the environment. Refusing to run daily pipeline with mock data. Unset USE_MOCK_ODDS and retry."
    exit 1
}

$env:BANKROLL = [string]$bankroll
$logDir = "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$dateStr = Get-Date -Format "yyyyMMdd-HHmm"
$runLogFile = Join-Path $logDir "daily-run-$dateStr.log"

Write-Log "Sport: $Sport | Bankroll: $env:BANKROLL ($bankroll)"

# Use run_optimizer.ps1 (not run-both): writes last_run.json, match_rate_history, and auto-deploys.
# run-both.ps1 does not update artifacts or deploy, so the site would stay stale.
$ErrorActionPreferenceSave = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& "$ScriptDir\run_optimizer.ps1" -Force -bankroll $bankroll 2>&1 | Tee-Object -FilePath $runLogFile -Append
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $ErrorActionPreferenceSave

if (Test-Path "quota_log.txt") {
    Get-Content "quota_log.txt" -Tail 5 | Out-File -FilePath $runLogFile -Append
    Write-Log "Quota log tail appended."
}

# Post-run steps (only after optimizer succeeded); all non-fatal
# Note: run_optimizer.ps1 already writes last_run.json, match_rate_history, archives, and runs web:deploy.
# These steps run only when using run-both.ps1; with run_optimizer.ps1 they are redundant but kept for backfill/scrape.
if ($exitCode -eq 0) {
    $datestamp = Get-Date -Format "yyyyMMdd"
    $outputDir = Join-Path $ProjectRoot "data\output_logs"
    $legsArchive = Join-Path $ProjectRoot "data\legs_archive"
    $tierArchive = Join-Path $ProjectRoot "data\tier_archive"

    # (b) Archive legs + tiers (run_optimizer.ps1 also archives; this backs up if different structure)
    try {
        New-Item -ItemType Directory -Force -Path $legsArchive | Out-Null
        New-Item -ItemType Directory -Force -Path $tierArchive | Out-Null
        $archives = @(
            @{ src = Join-Path $outputDir "prizepicks-legs.csv"; dst = Join-Path $legsArchive "prizepicks-legs-$datestamp.csv" },
            @{ src = Join-Path $outputDir "underdog-legs.csv";   dst = Join-Path $legsArchive "underdog-legs-$datestamp.csv" },
            @{ src = Join-Path $outputDir "tier1.csv";           dst = Join-Path $tierArchive "tier1-$datestamp.csv" },
            @{ src = Join-Path $outputDir "tier2.csv";           dst = Join-Path $tierArchive "tier2-$datestamp.csv" }
        )
        foreach ($a in $archives) {
            if (Test-Path $a.src) { Copy-Item $a.src $a.dst -Force; Write-Log "[DAILY] Archived $($a.src) -> $($a.dst)" }
        }
    } catch {
        Write-Log "[DAILY] WARNING: archive step failed (non-fatal): $($_.Exception.Message)"
    }

    # (e) Deploy: run_optimizer.ps1 already runs web:deploy; run again here as safety (idempotent)
    Write-Log "[DAILY] Deploying dashboard (web:deploy)..."
    npm run web:deploy 2>&1 | Tee-Object -FilePath $runLogFile -Append
    if ($LASTEXITCODE -ne 0) {
        Write-Log "[DAILY] WARNING: Dashboard deploy failed (non-fatal)"
    } else {
        Write-Log "[DAILY] Dashboard deployed successfully."
    }

    # (c) Backfill tracker
    Write-Log "[DAILY] Running backfill tracker..."
    npx ts-node src/backfill_perf_tracker.ts 2>&1 | Tee-Object -FilePath $runLogFile -Append
    if ($LASTEXITCODE -ne 0) { Write-Log "[DAILY] WARNING: backfill tracker failed (non-fatal)" }

    # (d) Scrape prior-day results
    Write-Log "[DAILY] Scraping prior-day results..."
    npx ts-node src/scrape_nba_leg_results.ts 2>&1 | Tee-Object -FilePath $runLogFile -Append
    if ($LASTEXITCODE -ne 0) { Write-Log "[DAILY] WARNING: scrape results failed (non-fatal)" }
}

Write-Log "Daily run finished at $(Get-Date -Format 'o') | exit $exitCode"
Write-Log "[DAILY] ========== Run complete (exit $exitCode) =========="
exit $exitCode

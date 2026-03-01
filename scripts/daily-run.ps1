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

$env:BANKROLL = [string]$bankroll
$logDir = "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$dateStr = Get-Date -Format "yyyyMMdd-HHmm"
$logFile = Join-Path $logDir "daily-run-$dateStr.log"

function Write-Log { param($msg) Write-Host $msg; $msg | Out-File -FilePath $logFile -Append }

Write-Log "=========================================="
Write-Log "Daily run started at $(Get-Date -Format 'o')"
Write-Log "Sport: $Sport | Bankroll: $env:BANKROLL ($bankroll)"
Write-Log "=========================================="

# Prevent PowerShell from treating node stderr (e.g. console.warn) as script failure
$ErrorActionPreferenceSave = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& "$ScriptDir\run-both.ps1" -Fresh -Sport $Sport -bankroll $bankroll 2>&1 | Tee-Object -FilePath $logFile -Append
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $ErrorActionPreferenceSave

if (Test-Path "quota_log.txt") {
    Get-Content "quota_log.txt" -Tail 5 | Out-File -FilePath $logFile -Append
    Write-Log "Quota log tail appended."
}

Write-Log "Daily run finished at $(Get-Date -Format 'o') | exit $exitCode"
exit $exitCode

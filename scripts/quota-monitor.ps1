# quota-monitor.ps1
# SGO quota: hits today, hits this month, alert when >80% of monthly quota (2500).
# Usage: .\scripts\quota-monitor.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

$SGO_MONTHLY_QUOTA = 2500
$ALERT_PCT = 80

$usagePath = Join-Path $ProjectRoot ".cache\provider-usage.json"
$todayHits = 0
$todayTrd = 0
$usageDate = ""
if (Test-Path $usagePath) {
    $u = Get-Content $usagePath -Raw | ConvertFrom-Json
    $todayHits = [int]$u.sgoCallCount
    $todayTrd = [int]$u.rundownDataPointsUsed
    $usageDate = $u.date
}

$quotaLog = Join-Path $ProjectRoot "quota_log.txt"
$monthHits = 0
$monthTrd = 0
$currentMonth = Get-Date -Format "yyyy-MM"
if (Test-Path $quotaLog) {
    $lines = Get-Content $quotaLog
    foreach ($line in $lines) {
        if ($line -match "(\d{4})-(\d{2})-\d{2}T") {
            $logMonth = $Matches[1] + "-" + $Matches[2]
            if ($logMonth -eq $currentMonth) {
                if ($line -match "SGO HARVEST") { $monthHits++ }
                if ($line -match "TRD HARVEST") { $monthTrd++ }
            }
        }
    }
}

$pctUsed = if ($SGO_MONTHLY_QUOTA -gt 0) { [math]::Round(100 * $monthHits / $SGO_MONTHLY_QUOTA, 1) } else { 0 }
$alert = $pctUsed -ge $ALERT_PCT

Write-Host "=========================================="
Write-Host "Quota Monitor (SGO + TRD)"
Write-Host "=========================================="
Write-Host "SGO today (provider-usage): $todayHits hits (date: $usageDate)"
Write-Host "SGO this month (quota_log): $monthHits / $SGO_MONTHLY_QUOTA ($pctUsed%)"
Write-Host "TRD today (provider-usage): $todayTrd data points"
Write-Host "TRD this month (quota_log): $monthTrd harvests"
if ($alert) {
    Write-Host ""
    Write-Host "ALERT: SGO usage >= $ALERT_PCT% of monthly quota." -ForegroundColor Red
}
Write-Host "=========================================="

if ($alert) { exit 1 }
exit 0

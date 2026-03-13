# quota-monitor.ps1
# OddsAPI quota monitor: reads remaining from data/odds_cache.json (written by fetch_oddsapi_props.ts).
# OddsAPI quota only (legacy SGO/TRD quota tracking removed).
# Usage: .\scripts\quota-monitor.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

$ALERT_THRESHOLD = 500
$cachePath = Join-Path $ProjectRoot "data\odds_cache.json"

Write-Host "=========================================="
Write-Host "Quota Monitor (OddsAPI)"
Write-Host "=========================================="

if (-not (Test-Path $cachePath)) {
    Write-Host "data/odds_cache.json not found — run fetch_oddsapi_props once to populate."
    Write-Host "=========================================="
    exit 0
}

try {
    $cache = Get-Content $cachePath -Raw | ConvertFrom-Json
    $remaining = [int]$cache.remaining
    $tsMs = [long]$cache.ts
    $ttlMs = [long]$cache.ttl
    $ageMin = [math]::Round(($([long](Get-Date -UFormat %s) * 1000) - $tsMs) / 60000, 1)
    $ttlH = [math]::Round($ttlMs / 3600000, 1)
    $cacheStatus = if (($([long](Get-Date -UFormat %s) * 1000) - $tsMs) -lt $ttlMs) { "FRESH" } else { "STALE" }

    Write-Host "Remaining requests: $remaining"
    Write-Host "Cache age:          ${ageMin}m (TTL=${ttlH}h, status=$cacheStatus)"
    Write-Host "Guard threshold:    $ALERT_THRESHOLD"
    if ($remaining -lt $ALERT_THRESHOLD) {
        Write-Host ""
        Write-Host "ALERT: remaining ($remaining) < threshold ($ALERT_THRESHOLD) — live fetches blocked." -ForegroundColor Red
    } else {
        Write-Host "Status: OK (above guard threshold)" -ForegroundColor Green
    }
} catch {
    Write-Host "Error reading odds_cache.json: $_" -ForegroundColor Red
}
Write-Host "=========================================="
exit 0

# Token Usage Analysis Based on Available Data

Write-Host "=== TOKEN USAGE ANALYSIS ===" -ForegroundColor Green
Write-Host ""

# Check cache TTL settings
Write-Host "CACHE ANALYSIS:" -ForegroundColor Yellow
Write-Host ""

# Check odds cache file
$cacheFile = "cache\oddsapi_props_cache_basketball_nba.json"
if (Test-Path $cacheFile) {
    $cacheContent = Get-Content $cacheFile | ConvertFrom-Json
    $fetchedAt = $cacheContent.fetchedAt
    $dataCount = $cacheContent.data.Count
    $ageMinutes = [math]::Round((Date.now - $fetchedAt) / 60000, 1)
    
    Write-Host "Cache file: $cacheFile" -ForegroundColor Cyan
    Write-Host "Cached props: $dataCount" -ForegroundColor Cyan
    Write-Host "Cache age: $ageMinutes minutes" -ForegroundColor Cyan
    Write-Host "Cache timestamp: $(Get-Date -Date $fetchedAt -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
} else {
    Write-Host "Cache file not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "OPTIMIZER RUN ANALYSIS:" -ForegroundColor Yellow
Write-Host ""

# Check latest run logs for odds source
$latestLog = Get-ChildItem -Path "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latestLog) {
    Write-Host "Latest log: $($latestLog.Name)" -ForegroundColor Cyan
    
    # Extract odds source info
    $oddsSource = Select-String -Path $latestLog.Name -Pattern "ODDS_SOURCE.*source=oddsapi"
    if ($oddsSource) {
        Write-Host "Odds source: $($oddsSource.Line)" -ForegroundColor Green
    }
    
    # Extract snapshot info
    $snapshotInfo = Select-String -Path $latestLog.Name -Pattern "ODDS_SNAPSHOT.*ageMin"
    if ($snapshotInfo) {
        Write-Host "Snapshot age: $($snapshotInfo.Line)" -ForegroundColor Green
    }
    
    # Check if fresh fetch occurred
    $freshFetch = Select-String -Path $latestLog.Name -Pattern "refreshMode=fresh"
    if ($freshFetch) {
        Write-Host "Fresh fetch: YES" -ForegroundColor Green
    } else {
        Write-Host "Fresh fetch: NO (using cache)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "TOKEN ESTIMATION:" -ForegroundColor Yellow
Write-Host ""

# Based on the log analysis
$games = 9  # From direct odds fetch
$bookmakers = 15  # From direct odds fetch
$markets = 12  # Approximate from REQUEST_MARKET_KEYS

Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Games: $games" -ForegroundColor White
Write-Host "  Bookmakers: $bookmakers" -ForegroundColor White
Write-Host "  Markets: $markets" -ForegroundColor White
Write-Host ""

# Calculate token cost
$eventsRequests = $games  # 1 request per game
$initialRequest = 1      # 1 request to get event list
$totalRequests = $eventsRequests + $initialRequest

# OddsAPI token cost model
# Typically: 1 token per request endpoint
$estimatedTokens = $totalRequests

Write-Host "Token Cost Model:" -ForegroundColor Cyan
Write-Host "  Events list request: 1 token" -ForegroundColor White
Write-Host "  Event odds requests: $games tokens" -ForegroundColor White
Write-Host "  Total estimated: $estimatedTokens tokens per fresh fetch" -ForegroundColor Green
Write-Host ""

Write-Host "CACHE TTL IMPACT:" -ForegroundColor Yellow
Write-Host ""

# Check cache TTL from odds_cache.ts
$cacheTtlMinutes = 15  # Default from odds_cache.ts
Write-Host "Default cache TTL: $cacheTtlMinutes minutes" -ForegroundColor Cyan
Write-Host ""

if ($ageMinutes -and $ageMinutes -lt $cacheTtlMinutes) {
    Write-Host "CURRENT STATUS: Using cache (age $ageMinutes min < TTL $cacheTtlMinutes min)" -ForegroundColor Green
    Write-Host "Token cost for this run: 0 tokens (cached)" -ForegroundColor Green
} else {
    Write-Host "CURRENT STATUS: Would fetch fresh odds" -ForegroundColor Yellow
    Write-Host "Token cost for this run: $estimatedTokens tokens" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "RECOMMENDATIONS:" -ForegroundColor Yellow
Write-Host ""

if ($estimatedTokens -gt 100) {
    Write-Host "❌ HIGH TOKEN USAGE: $estimatedTokens > 100 tokens" -ForegroundColor Red
    Write-Host "   Consider reducing bookmakers or markets" -ForegroundColor Red
} elseif ($estimatedTokens -gt 50) {
    Write-Host "⚠️  MODERATE TOKEN USAGE: $estimatedTokens tokens" -ForegroundColor Yellow
    Write-Host "   Monitor usage closely" -ForegroundColor Yellow
} else {
    Write-Host "✅ EFFICIENT TOKEN USAGE: $estimatedTokens tokens" -ForegroundColor Green
    Write-Host "   Current usage is acceptable" -ForegroundColor Green
}

Write-Host ""
Write-Host "OPTIMIZATION SUGGESTIONS:" -ForegroundColor Cyan
Write-Host "1. Increase cache TTL to 30-60 minutes if line movement isn't critical" -ForegroundColor White
Write-Host "2. Reduce bookmakers to top 8-10 most reliable ones" -ForegroundColor White
Write-Host "3. Consider caching odds for longer periods during off-hours" -ForegroundColor White
Write-Host "4. Single odds fetch per run (already implemented via OddsSnapshotManager)" -ForegroundColor Green

Write-Host ""
Write-Host "=== ANALYSIS COMPLETE ===" -ForegroundColor Green

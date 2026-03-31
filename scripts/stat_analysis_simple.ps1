# Simple Stat Coverage Analysis

Write-Host "=== STAT COVERAGE ANALYSIS ===" -ForegroundColor Green

# OddsAPI Stats
$oddsapiStats = @("assists","blocks","points","points_assists","points_rebounds","pra","rebounds","rebounds_assists","steals","stocks","threes","turnovers")

# PP Stats
$ppHeaders = (Get-Content "prizepicks_imported.csv" | Select-Object -First 1).Split(',')
$ppStatIndex = [Array]::IndexOf($ppHeaders, "stat")
$ppStats = (Get-Content "prizepicks_imported.csv" | Select-Object -Skip 1 | ForEach-Object { $_.Split(',')[$ppStatIndex] } | Sort-Object -Unique)

# UD Stats  
$udHeaders = (Get-Content "underdog_imported.csv" | Select-Object -First 1).Split(',')
$udStatIndex = [Array]::IndexOf($udHeaders, "stat")
$udStats = (Get-Content "underdog_imported.csv" | Select-Object -Skip 1 | ForEach-Object { $_.Split(',')[$udStatIndex] } | Sort-Object -Unique)

Write-Host "COVERAGE MATRIX:" -ForegroundColor Yellow
Write-Host "Stat                    OddsAPI  PP  UD" -ForegroundColor White
Write-Host "----                    --------  --  --" -ForegroundColor White

foreach ($stat in $oddsapiStats) {
    $hasPP = if ($stat -in $ppStats) { "✅" } else { "❌" }
    $hasUD = if ($stat -in $udStats) { "✅" } else { "❌" }
    Write-Host ("{0,-23} ✅        {1,-2} {2,-2}" -f $stat, $hasPP, $hasUD)
}

Write-Host ""
Write-Host "KEY ISSUES:" -ForegroundColor Red
Write-Host "1. UD missing: threes, points_assists, points_rebounds, pra, rebounds_assists, stocks, blocks, turnovers" -ForegroundColor Red
Write-Host "2. Alt lines: OddsAPI has 232 alt lines but fetchOddsApi.ts hardcodes isMainLine=true" -ForegroundColor Red
Write-Host "3. STAT_MAP in merge_odds.ts is complete - the issue is in API data fetching" -ForegroundColor Red

Write-Host ""
Write-Host "FIXES NEEDED:" -ForegroundColor Yellow
Write-Host "1. Update oddsLegToSgo to use leg.isMainLine instead of hardcoded true" -ForegroundColor Cyan
Write-Host "2. Debug UD API response to see what stats it actually returns" -ForegroundColor Cyan
Write-Host "3. Add alt line second pass for PP (currently only UD has it)" -ForegroundColor Cyan

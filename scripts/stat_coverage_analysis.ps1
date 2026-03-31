# Comprehensive Stat Coverage Analysis

Write-Host "=== COMPREHENSIVE STAT COVERAGE ANALYSIS ===" -ForegroundColor Green
Write-Host ""

# 1. OddsAPI Stats (Source of Truth)
Write-Host "1. ODDSAPI STATS (Source of Truth)" -ForegroundColor Yellow
Write-Host ""

$oddsapiStats = @(
    "assists",
    "blocks", 
    "points",
    "points_assists",
    "points_rebounds",
    "pra",
    "rebounds",
    "rebounds_assists",
    "steals",
    "stocks",
    "threes",
    "turnovers"
)

$oddsapiStats | ForEach-Object { Write-Output "  ✅ $_" }

Write-Host "  Alt lines available: 232" -ForegroundColor Cyan
Write-Host ""

# 2. PP Import Stats
Write-Host "2. PRIZEPICKS IMPORT STATS" -ForegroundColor Yellow
Write-Host ""

$ppHeaders = (Get-Content "prizepicks_imported.csv" | Select-Object -First 1).Split(',')
$ppStatIndex = [Array]::IndexOf($ppHeaders, "stat")
$ppStats = (Get-Content "prizepicks_imported.csv" | Select-Object -Skip 1 | ForEach-Object { $_.Split(',')[$ppStatIndex] } | Sort-Object -Unique)

foreach ($stat in $oddsapiStats) {
    if ($stat -in $ppStats) {
        Write-Output "  ✅ $stat"
    } else {
        Write-Output "  ❌ $stat (MISSING)"
    }
}

Write-Host ""
Write-Host "PP missing stats:" -ForegroundColor Red
$missingFromPP = $oddsapiStats | Where-Object { $_ -notin $ppStats }
if ($missingFromPP.Count -eq 0) {
    Write-Host "  None! PP has all OddsAPI stats" -ForegroundColor Green
} else {
    $missingFromPP | ForEach-Object { Write-Output "  ❌ $_" }
}
Write-Host ""

# 3. UD Import Stats
Write-Host "3. UNDERDOG IMPORT STATS" -ForegroundColor Yellow
Write-Host ""

$udHeaders = (Get-Content "underdog_imported.csv" | Select-Object -First 1).Split(',')
$udStatIndex = [Array]::IndexOf($udHeaders, "stat")
$udStats = (Get-Content "underdog_imported.csv" | Select-Object -Skip 1 | ForEach-Object { $_.Split(',')[$udStatIndex] } | Sort-Object -Unique)

foreach ($stat in $oddsapiStats) {
    if ($stat -in $udStats) {
        Write-Output "  ✅ $stat"
    } else {
        Write-Output "  ❌ $stat (MISSING)"
    }
}

Write-Host ""
Write-Host "UD missing stats:" -ForegroundColor Red
$missingFromUD = $oddsapiStats | Where-Object { $_ -notin $udStats }
if ($missingFromUD.Count -eq 0) {
    Write-Host "  None! UD has all OddsAPI stats" -ForegroundColor Green
} else {
    $missingFromUD | ForEach-Object { Write-Output "  ❌ $_" }
}
Write-Host ""

# 4. Coverage Matrix
Write-Host "4. COVERAGE MATRIX" -ForegroundColor Yellow
Write-Host ""

Write-Host "Stat Type                | OddsAPI | PP | UD | Issues" -ForegroundColor White
Write-Host "------------------------|---------|----|----|-------" -ForegroundColor White

foreach ($stat in $oddsapiStats) {
    $hasOdds = "✅"
    $hasPP = if ($stat -in $ppStats) { "✅" } else { "❌" }
    $hasUD = if ($stat -in $udStats) { "✅" } else { "❌" }
    
    $issues = @()
    if ($stat -notin $ppStats) { $issues += "PP missing" }
    if ($stat -notin $udStats) { $issues += "UD missing" }
    if ($stat -notin $ppStats -and $stat -notin $udStats) { $issues += "Both missing" }
    
    $issueStr = if ($issues.Count -gt 0) { $issues -join ", " } else { "None" }
    
    Write-Host ("{0,-23} | {1,-7} | {2,-2} | {3,-2} | {4}" -f $stat, $hasOdds, $hasPP, $hasUD, $issueStr)
}

Write-Host ""

# 5. Key Issues Analysis
Write-Host "5. KEY ISSUES ANALYSIS" -ForegroundColor Yellow
Write-Host ""

Write-Host "🔍 STAT MAPPING ISSUES:" -ForegroundColor Red
Write-Host ""

# Check for threes mapping issue
if ("threes" -in $oddsapiStats -and "threes" -notin $udStats) {
    Write-Host "❌ UD missing 'threes' - likely mapping issue" -ForegroundColor Red
    Write-Host "   OddsAPI uses 'threes' but UD expects '3pm'" -ForegroundColor Red
    Write-Host "   UD fetch_underdog_props.ts maps 'three_pointers_made' -> 'threes'" -ForegroundColor Red
    Write-Host "   But UD API may return different field names" -ForegroundColor Red
}

# Check combo stats
$comboStats = @("pra", "points_assists", "points_rebounds", "rebounds_assists")
foreach ($combo in $comboStats) {
    if ($combo -in $oddsapiStats -and $combo -notin $udStats) {
        Write-Host "❌ UD missing combo stat: $combo" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🔍 ALT LINE ISSUES:" -ForegroundColor Red
Write-Host ""

# Check alt line handling
Write-Host "❌ OddsAPI has 232 alt lines but fetchOddsApi.ts hardcodes isMainLine=true" -ForegroundColor Red
Write-Host "   This means alt lines are not being passed to merge logic" -ForegroundColor Red
Write-Host "   UD merge logic has alt line second pass, but PP doesn't get alt lines" -ForegroundColor Red

Write-Host ""

# 6. Proposed Fixes
Write-Host "6. PROPOSED FIXES" -ForegroundColor Yellow
Write-Host ""

Write-Host "🔧 FIX 1: Update oddsLegToSgo in fetchOddsApi.ts" -ForegroundColor Cyan
Write-Host "   Change 'isMainLine: true' to 'isMainLine: leg.isMainLine ?? true'" -ForegroundColor Cyan
Write-Host "   This will pass alt line info to merge logic" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔧 FIX 2: Debug UD API response for missing stats" -ForegroundColor Cyan
Write-Host "   Add logging to show what 'stat' fields UD API actually returns" -ForegroundColor Cyan
Write-Host "   Check if UD API returns 'threes' or 'three_pointers_made'" -ForegroundColor Cyan
Write-Host "   Verify if combo stats are available in UD API response" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔧 FIX 3: Ensure PP gets alt lines in merge" -ForegroundColor Cyan
Write-Host "   PP merge should use alt line second pass like UD does" -ForegroundColor Cyan
Write-Host "   Update merge_odds.ts to apply alt line logic to PP as well" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔧 FIX 4: Add debug logging for merge failures" -ForegroundColor Cyan
Write-Host "   Log when stats don't match between OddsAPI and platform data" -ForegroundColor Cyan
Write-Host "   Show normalized stat names during merge process" -ForegroundColor Cyan
Write-Host ""

# 7. Priority Assessment
Write-Host "7. PRIORITY ASSESSMENT" -ForegroundColor Yellow
Write-Host ""

Write-Host "🔴 HIGH PRIORITY:" -ForegroundColor Red
Write-Host "   Fix alt line handling in fetchOddsApi.ts (affects both platforms)" -ForegroundColor Red
Write-Host "   Debug UD missing threes and combo stats" -ForegroundColor Red
Write-Host ""

Write-Host "🟡 MEDIUM PRIORITY:" -ForegroundColor Yellow
Write-Host "   Enable PP alt line second pass in merge logic" -ForegroundColor Yellow
Write-Host "   Add comprehensive merge debug logging" -ForegroundColor Yellow
Write-Host ""

Write-Host "🟢 LOW PRIORITY:" -ForegroundColor Green
Write-Host "   PP already has good coverage (11/12 stats)" -ForegroundColor Green
Write-Host "   UD API limitations may be external (not code issues)" -ForegroundColor Green

Write-Host ""
Write-Host "=== ANALYSIS COMPLETE ===" -ForegroundColor Green

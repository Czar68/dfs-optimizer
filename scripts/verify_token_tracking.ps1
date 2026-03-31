# Verify Token Tracking Implementation

Write-Host "=== TOKEN TRACKING VERIFICATION ===" -ForegroundColor Green
Write-Host ""

# Check 1: Bookmaker List Updated
Write-Host "1. BOOKMAKER LIST VERIFICATION:" -ForegroundColor Yellow
$fetchFile = "src\fetch_oddsapi_props.ts"
if (Test-Path $fetchFile) {
    $content = Get-Content $fetchFile
    $bookmakerSection = $content | Select-String -Pattern "DEFAULT_SELECTED_BOOKMAKERS" -Context 0,5
    Write-Host "Found bookmaker list:" -ForegroundColor Cyan
    $bookmakerSection.Context.PostContext | ForEach-Object { Write-Output "  $_" }
    
    # Count bookmakers
    $bookmakerCount = ($content | Select-String -Pattern "'[^']*'" | Select-String -Pattern "draftkings|fanduel|pinnacle|betmgm|espnbet|lowvig|prizepicks|underdog|pointsbetus|caesars").Count
    Write-Host "Bookmaker count: $bookmakerCount" -ForegroundColor $(if($bookmakerCount -eq 10) {"Green"} else {"Red"})
} else {
    Write-Host "❌ fetch_oddsapi_props.ts not found" -ForegroundColor Red
}

Write-Host ""

# Check 2: Token Tracker File Created
Write-Host "2. TOKEN TRACKER FILE:" -ForegroundColor Yellow
$trackerFile = "src\token_tracker.ts"
if (Test-Path $trackerFile) {
    Write-Host "✅ token_tracker.ts exists" -ForegroundColor Green
    $trackerContent = Get-Content $trackerFile
    $hasLoadState = $trackerContent -match "loadTokenState"
    $hasSaveState = $trackerContent -match "saveTokenState"
    Write-Host "  loadTokenState: $(if($hasLoadState) {'✅'} else {'❌'})" -ForegroundColor $(if($hasLoadState) {"Green"} else {"Red"})
    Write-Host "  saveTokenState: $(if($hasSaveState) {'✅'} else {'❌'})" -ForegroundColor $(if($hasSaveState) {"Green"} else {"Red"})
} else {
    Write-Host "❌ token_tracker.ts not found" -ForegroundColor Red
}

Write-Host ""

# Check 3: Token Tracking Integration
Write-Host "3. INTEGRATION IN fetch_oddsapi_props.ts:" -ForegroundColor Yellow
if (Test-Path $fetchFile) {
    $content = Get-Content $fetchFile
    $checks = @{
        "Token variables" = $content -match "tokensUsedThisRun.*lastRemaining"
        "updateTokenStats function" = $content -match "function updateTokenStats"
        "getTokenUsage export" = $content -match "export function getTokenUsage"
        "Token tracker import" = $content -match "import.*token_tracker"
        "Load previous state" = $content -match "loadTokenState\(\)"
        "Save token state" = $content -match "saveTokenState\(lastRemaining\)"
        "Final token summary" = $content -match "Total tokens used this run"
        "Bookmaker count logging" = $content -match "Requesting bookmakers.*count"
    }
    
    foreach($check in $checks.GetEnumerator()) {
        $status = if($check.Value) {"✅"} else {"❌"}
        $color = if($check.Value) {"Green"} else {"Red"}
        Write-Host "  $($check.Key): $status" -ForegroundColor $color
    }
}

Write-Host ""

# Check 4: Startup Token Logging
Write-Host "4. STARTUP TOKEN LOGGING:" -ForegroundColor Yellow
$runFile = "src\run_optimizer.ts"
if (Test-Path $runFile) {
    $content = Get-Content $runFile
    $hasStartupLogging = $content -match "STARTUP.*OddsAPI tokens remaining"
    Write-Host "  Startup token logging: $(if($hasStartupLogging) {'✅'} else {'❌'})" -ForegroundColor $(if($hasStartupLogging) {"Green"} else {"Red"})
} else {
    Write-Host "❌ run_optimizer.ts not found" -ForegroundColor Red
}

Write-Host ""

# Check 5: Compilation
Write-Host "5. COMPILATION CHECK:" -ForegroundColor Yellow
try {
    $compileResult = npx tsc 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ TypeScript compilation successful" -ForegroundColor Green
    } else {
        Write-Host "❌ TypeScript compilation failed" -ForegroundColor Red
        Write-Host $compileResult -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Compilation check failed: $_" -ForegroundColor Red
}

Write-Host ""

# Check 6: Token Tracker State File
Write-Host "6. PERSISTENT STATE FILE:" -ForegroundColor Yellow
$stateFile = "token_tracker.json"
if (Test-Path $stateFile) {
    Write-Host "✅ token_tracker.json exists" -ForegroundColor Green
    try {
        $state = Get-Content $stateFile | ConvertFrom-Json
        Write-Host "  Last remaining: $($state.lastRemaining)" -ForegroundColor Cyan
        Write-Host "  Last updated: $($state.lastUpdated)" -ForegroundColor Cyan
    } catch {
        Write-Host "⚠️  token_tracker.json exists but may be corrupted" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ️  token_tracker.json not created yet (will be created on first odds fetch)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== VERIFICATION COMPLETE ===" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Run optimizer with --force-refresh-odds to test token tracking" -ForegroundColor White
Write-Host "2. Check logs for [TOKEN] messages" -ForegroundColor White
Write-Host "3. Verify token_tracker.json is created with remaining tokens" -ForegroundColor White

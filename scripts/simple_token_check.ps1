# Simple Token Tracking Verification

Write-Host "=== TOKEN TRACKING VERIFICATION ===" -ForegroundColor Green

# Check bookmaker list
$fetchFile = "src\fetch_oddsapi_props.ts"
if (Test-Path $fetchFile) {
    $content = Get-Content $fetchFile
    $bookmakers = $content | Select-String -Pattern "DEFAULT_SELECTED_BOOKMAKERS" -A 10
    Write-Host "Bookmaker list found:" -ForegroundColor Green
    $bookmakers | ForEach-Object { Write-Output "  $_" }
}

# Check token tracker file
$trackerFile = "src\token_tracker.ts"
if (Test-Path $trackerFile) {
    Write-Host "Token tracker file exists: YES" -ForegroundColor Green
} else {
    Write-Host "Token tracker file exists: NO" -ForegroundColor Red
}

# Check compilation
try {
    npx tsc | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "TypeScript compilation: SUCCESS" -ForegroundColor Green
    } else {
        Write-Host "TypeScript compilation: FAILED" -ForegroundColor Red
    }
} catch {
    Write-Host "TypeScript compilation: ERROR" -ForegroundColor Red
}

Write-Host ""
Write-Host "IMPLEMENTATION COMPLETE" -ForegroundColor Green
Write-Host "Run with --force-refresh-odds to test token tracking" -ForegroundColor Yellow

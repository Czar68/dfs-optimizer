# Run optimizer and deploy to IONOS
# This script runs the optimizer CLI and then deploys the results to IONOS
# Intended to be called by Windows Task Scheduler

param(
    [switch]$Force,
    [switch]$NoPause
)

Write-Host "=== Running optimizer and deploying to IONOS ===" -ForegroundColor Green
$startTime = Get-Date

# Step 1: Run the optimizer
Write-Host "Step 1: Running optimizer CLI..." -ForegroundColor Yellow
Set-Location "C:\Dev\Projects\dfs-optimizer"

try {
    Write-Host "Executing: npm run generate:production" -ForegroundColor Cyan
    npm run generate:production
    
    if ($LASTEXITCODE -ne 0) {
        throw "Optimizer run failed with exit code $LASTEXITCODE"
    }
    
    $optimizerTime = Get-Date
    $duration = $optimizerTime - $startTime
    Write-Host "✓ Optimizer completed successfully in $($duration.TotalMinutes.ToString('F2')) minutes" -ForegroundColor Green
    
} catch {
    Write-Host "✗ Optimizer run failed: $_" -ForegroundColor Red
    Write-Host "Deployment aborted due to optimizer failure." -ForegroundColor Red
    
    if (-not $NoPause) {
        Write-Host "Press any key to exit..." -ForegroundColor Yellow
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
    
    exit 1
}

# Step 2: Deploy to IONOS
Write-Host "Step 2: Deploying to IONOS..." -ForegroundColor Yellow

try {
    $deployScript = "C:\Dev\Projects\dfs-optimizer\scripts\deploy_to_ionos.ps1"
    
    if (-not (Test-Path $deployScript)) {
        throw "Deploy script not found at $deployScript"
    }
    
    # Call the deploy script with the same Force parameter if passed
    $deployArgs = @()
    if ($Force) { $deployArgs += "-Force" }
    
    & $deployScript @deployArgs
    
    if ($LASTEXITCODE -ne 0) {
        throw "Deployment failed with exit code $LASTEXITCODE"
    }
    
    $endTime = Get-Date
    $totalDuration = $endTime - $startTime
    Write-Host "✓ Deployment completed successfully!" -ForegroundColor Green
    Write-Host "Total time: $($totalDuration.TotalMinutes.ToString('F2')) minutes" -ForegroundColor Cyan
    
} catch {
    Write-Host "✗ Deployment failed: $_" -ForegroundColor Red
    Write-Host "Total time elapsed: $(((Get-Date) - $startTime).TotalMinutes.ToString('F2')) minutes" -ForegroundColor Yellow
    
    if (-not $NoPause) {
        Write-Host "Press any key to exit..." -ForegroundColor Yellow
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
    
    exit 1
}

Write-Host "=== Run and deploy completed successfully! ===" -ForegroundColor Green
Write-Host "Your optimizer results are now live at: https://dfs.gamesmoviesmusic.com" -ForegroundColor Cyan

if (-not $NoPause) {
    Write-Host "Press any key to exit..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

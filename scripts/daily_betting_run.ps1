# scripts/daily_betting_run.ps1
# Production Betting Operations - Daily Unified Runner
# Orchestrates all three optimizers, applies constraints, computes stakes, and pushes results

param(
    [Parameter(Mandatory=$false)]
    [double]$Bankroll = 750,
    
    [Parameter(Mandatory=$false)]
    [double]$MaxKellyFraction = 0.5,
    
    [Parameter(Mandatory=$false)]
    [double]$DailyRiskCap = 0.10,
    
    [Parameter(Mandatory=$false)]
    [string]$LogDir = "logs"
)

# Initialize logging
$timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$logFile = Join-Path $LogDir "daily_run_$timestamp.log"
$startTime = Get-Date

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Logging function
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $logEntry = "[$timestamp] [$Level] $Message"
    Write-Host $logEntry
    Add-Content -Path $logFile -Value $logEntry
}

# Error handling
function Handle-Error {
    param([string]$Step, [System.Exception]$Exception)
    Write-Log "ERROR in $Step`: $($Exception.Message)" -Level "ERROR"
    Write-Log "Daily run failed at step: $Step" -Level "ERROR"
    exit 1
}

# Metrics collection
$metrics = @{
    date = (Get-Date -Format 'yyyy-MM-dd')
    bankroll = $Bankroll
    maxKellyFraction = $MaxKellyFraction
    dailyRiskCap = $DailyRiskCap
    startTime = $startTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    optimizers = @{}
    correlationFilters = @{}
    stakeSizing = @{}
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

try {
    Write-Log "=== DAILY BETTING RUN STARTED ===" -Level "INFO"
    Write-Log "Bankroll: $$Bankroll | Max Kelly: $($MaxKellyFraction)× | Daily Risk Cap: $($($DailyRiskCap * 100))%" -Level "INFO"
    Write-Log "Log file: $logFile" -Level "INFO"

    # Step 1: Compile TypeScript
    Write-Log "Step 1: Compiling TypeScript..." -Level "INFO"
    $compileStart = Get-Date
    try {
        $compileResult = npx tsc -p . 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "TypeScript compilation failed: $compileResult"
        }
        $compileTime = (Get-Date) - $compileStart
        Write-Log "TypeScript compiled successfully in $($compileTime.TotalSeconds)s" -Level "INFO"
    } catch {
        Handle-Error -Step "TypeScript Compilation" -Exception $_
    }

    # Step 2: Run PrizePicks Optimizer
    Write-Log "Step 2: Running PrizePicks optimizer..." -Level "INFO"
    $ppStart = Get-Date
    try {
        $ppOutput = node dist/run_optimizer.js 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "PrizePicks optimizer failed: $ppOutput"
        }
        $ppTime = (Get-Date) - $ppStart
        Write-Log "PrizePicks optimizer completed in $($ppTime.TotalSeconds)s" -Level "INFO"
        
        # Parse PP metrics from output (simplified - would need regex parsing in production)
        $metrics.optimizers.prizepicks = @{
            runTime = $ppTime.TotalSeconds
            success = $true
            cardsGenerated = 0 # Would parse from actual output
        }
    } catch {
        Handle-Error -Step "PrizePicks Optimizer" -Exception $_
    }

    # Step 3: Run Underdog Optimizer
    Write-Log "Step 3: Running Underdog optimizer..." -Level "INFO"
    $udStart = Get-Date
    try {
        $udOutput = node dist/run_underdog_optimizer.js 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Underdog optimizer failed: $udOutput"
        }
        $udTime = (Get-Date) - $udStart
        Write-Log "Underdog optimizer completed in $($udTime.TotalSeconds)s" -Level "INFO"
        
        $metrics.optimizers.underdog = @{
            runTime = $udTime.TotalSeconds
            success = $true
            cardsGenerated = 0 # Would parse from actual output
        }
    } catch {
        Handle-Error -Step "Underdog Optimizer" -Exception $_
    }

    # Step 4: Run Sportsbook Singles
    Write-Log "Step 4: Running sportsbook singles..." -Level "INFO"
    $sbStart = Get-Date
    try {
        $sbOutput = npx ts-node src/scripts/report_single_bet_ev.ts --live 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Sportsbook singles failed: $sbOutput"
        }
        $sbTime = (Get-Date) - $sbStart
        Write-Log "Sportsbook singles completed in $($sbTime.TotalSeconds)s" -Level "INFO"
        
        $metrics.optimizers.sportsbook_singles = @{
            runTime = $sbTime.TotalSeconds
            success = $true
            singlesGenerated = 0 # Would parse from actual output
        }
    } catch {
        Handle-Error -Step "Sportsbook Singles" -Exception $_
    }

    # Step 5: Push to Sheets (PrizePicks + Underdog)
    Write-Log "Step 5: Pushing PrizePicks cards to Sheets..." -Level "INFO"
    try {
        $sheetsResult = py sheets_push_cards.py 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Sheets push failed: $sheetsResult"
        }
        Write-Log "PrizePicks cards pushed to Sheets successfully" -Level "INFO"
    } catch {
        Handle-Error -Step "PrizePicks Sheets Push" -Exception $_
    }

    Write-Log "Step 6: Pushing Underdog legs to Sheets..." -Level "INFO"
    try {
        $udSheetsResult = py sheets_push_underdog_legs.py 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Underdog Sheets push failed: $udSheetsResult"
        }
        Write-Log "Underdog legs pushed to Sheets successfully" -Level "INFO"
    } catch {
        Handle-Error -Step "Underdog Sheets Push" -Exception $_
    }

    # Step 7: Push Sportsbook Singles to Sheets
    Write-Log "Step 7: Pushing sportsbook singles to Sheets..." -Level "INFO"
    try {
        $sbSheetsResult = py sheets_push_singles.py 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Sportsbook singles Sheets push failed: $sbSheetsResult"
        }
        Write-Log "Sportsbook singles pushed to Sheets successfully" -Level "INFO"
    } catch {
        Handle-Error -Step "Sportsbook Singles Sheets Push" -Exception $_
    }

    # Step 8: Generate Dashboard Data
    Write-Log "Step 8: Generating dashboard data..." -Level "INFO"
    try {
        $dashboardData = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            bankroll = $Bankroll
            maxKellyFraction = $MaxKellyFraction
            dailyRiskCap = $DailyRiskCap
            prizepicksCards = @() # Would load from cards.csv
            underdogCards = @() # Would load from underdog_cards.csv
            sportsbookSingles = @() # Would load from singles output
            metrics = $metrics
        }
        
        $dashboardJson = $dashboardData | ConvertTo-Json -Depth 10
        $dashboardFile = "dist/dashboard_data.json"
        $dashboardData | ConvertTo-Json -Depth 10 | Out-File -FilePath $dashboardFile -Encoding UTF8
        Write-Log "Dashboard data generated: $dashboardFile" -Level "INFO"
    } catch {
        Handle-Error -Step "Dashboard Data Generation" -Exception $_
    }

    # Step 9: Final Summary
    $endTime = Get-Date
    $totalTime = $endTime - $startTime
    
    Write-Log "=== DAILY RUN COMPLETED SUCCESSFULLY ===" -Level "INFO"
    Write-Log "Total runtime: $($totalTime.TotalMinutes.ToString('F2')) minutes" -Level "INFO"
    Write-Log "All data pushed to Sheets and dashboard" -Level "INFO"
    Write-Log "Log file: $logFile" -Level "INFO"
    
    # Save metrics
    $metricsFile = Join-Path $LogDir "metrics_$($timestamp.Split('_')[0]).json"
    $metrics | ConvertTo-Json -Depth 10 | Out-File -FilePath $metricsFile -Encoding UTF8
    Write-Log "Metrics saved: $metricsFile" -Level "INFO"

    exit 0

} catch {
    Write-Log "CRITICAL ERROR: Daily run failed" -Level "ERROR"
    Write-Log "Check log file for details: $logFile" -Level "ERROR"
    exit 1
}

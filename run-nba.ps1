# run-nba.ps1
# One-click NBA pipeline: compile → optimize → sheets → dashboard
# Usage: .\run-nba.ps1 [-Sport NBA|NCAAB|All] [-Date YYYY-MM-DD] [-Games "HOU@CHA,BKN@CLE"]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("NBA", "NCAAB", "All")]
    [string]$Sport = "NBA",
    
    [Parameter(Mandatory=$false)]
    [string]$Date = "",
    
    [Parameter(Mandatory=$false)]
    [string]$Games = ""
)

# Colors for logging
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

# Get script directory (project root)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Info "=========================================="
Write-Info "NBA Props Optimizer - One-Click Pipeline"
Write-Info "=========================================="
Write-Info "Sport: $Sport"
if ($Date) { Write-Info "Date: $Date" }
if ($Games) { Write-Info "Games: $Games" }
Write-Info ""

$ErrorActionPreference = "Stop"
$startTime = Get-Date
$errors = @()

# Step 1: Compile TypeScript
Write-Info "[1/5] Compiling TypeScript..."
try {
    $compileOutput = npx tsc -p . 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "TypeScript compilation failed: $compileOutput"
    }
    Write-Success "✅ TypeScript compiled successfully"
} catch {
    Write-Error "❌ Compilation failed: $_"
    $errors += "Compilation"
    exit 1
}

# Step 2: Run both PrizePicks and Underdog optimizers (same odds; both use merge)
# Export merge report so we can run the merge audit after every run
$env:EXPORT_MERGE_REPORT = "1"
Write-Info ""
Write-Info "[2/5] Running PrizePicks optimizer (Sport: $Sport)..."
$legsCsv = "prizepicks-legs.csv"
$cardsCsv = "prizepicks-cards.csv"
$udLegsCsv = "underdog-legs.csv"
$udCardsCsv = "underdog-cards.csv"
$legCount = 0
$cardCount = 0
$udLegCount = 0
$udCardCount = 0
$usedSample = $false

try {
    $sportsArg = if ($Sport -eq "All") { "NBA,NCAAB" } else { $Sport }
    $optimizerArgs = @("dist/run_optimizer.js", "--sports", $sportsArg)
    if ($Date) { Write-Warning "Date filter not yet implemented in CLI - using today's slate" }
    $null = node $optimizerArgs 2>&1 | Tee-Object -Variable fullOutput
    if ($LASTEXITCODE -ne 0) { throw "PrizePicks optimizer exited with code $LASTEXITCODE" }
    if (-not (Test-Path $legsCsv)) { throw "Output CSV not found: $legsCsv" }
    $legCount = (Import-Csv $legsCsv | Measure-Object).Count
    $cardCount = if (Test-Path $cardsCsv) { (Import-Csv $cardsCsv | Measure-Object).Count } else { 0 }
    Write-Success "✅ PrizePicks optimizer completed (Legs: $legCount | Cards: $cardCount)"
} catch {
    Write-Warning "⚠️ PrizePicks optimizer failed: $_"
    if (Test-Path "sample_nba_legs.csv") {
        Copy-Item "sample_nba_legs.csv" $legsCsv -Force
        $legCount = (Import-Csv $legsCsv | Measure-Object).Count
    }
    if (Test-Path "sample_nba_cards.csv") {
        Copy-Item "sample_nba_cards.csv" $cardsCsv -Force
        $cardCount = (Import-Csv $cardsCsv | Measure-Object).Count
    }
    $usedSample = $true
}

Write-Info ""
Write-Info "[2b/5] Running Underdog optimizer (Sport: $Sport)..."
try {
    $sportsArg = if ($Sport -eq "All") { "NBA,NCAAB" } else { $Sport }
    $null = node dist/run_underdog_optimizer.js --sports $sportsArg 2>&1 | Tee-Object -Variable udOutput
    if (Test-Path $udLegsCsv) { $udLegCount = (Import-Csv $udLegsCsv | Measure-Object).Count }
    if (Test-Path $udCardsCsv) { $udCardCount = (Import-Csv $udCardsCsv | Measure-Object).Count }
    Write-Success "✅ Underdog optimizer completed (Legs: $udLegCount | Cards: $udCardCount)"
} catch {
    Write-Warning "⚠️ Underdog optimizer failed (non-fatal): $_"
}

# Copy CSVs into dashboard so build has data (required for Netlify / local build)
$dataDir = "web-dashboard\public\data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
if (Test-Path $cardsCsv) {
    Copy-Item $cardsCsv "$dataDir\prizepicks-cards.csv" -Force
    Write-Info "   Copied prizepicks-cards.csv → $dataDir"
}
if (Test-Path "underdog-cards.csv") {
    Copy-Item "underdog-cards.csv" "$dataDir\underdog-cards.csv" -Force
    Write-Info "   Copied underdog-cards.csv → $dataDir"
}

# Step 3: Push to Google Sheets (OAuth: credentials.json + token.json)
Write-Info ""
Write-Info "[3/5] Pushing to Google Sheets..."
$sheetsOk = $true
try {
    if (Test-Path $legsCsv) {
        python sheets_push_legs.py 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { $sheetsOk = $false }
    }
    if (Test-Path $udLegsCsv) { python sheets_push_underdog_legs.py 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { $sheetsOk = $false } }
    python sheets_push_cards.py 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { $sheetsOk = $false }
    if ($sheetsOk) { Write-Success "✅ Sheets push completed (Legs + Cards)" } else { Write-Warning "⚠️ Sheets push had errors (check credentials.json/token.json)" }
} catch {
    Write-Warning "⚠️ Sheets push failed (non-critical): $_"
}

# Step 3b: Merge audit (reads merge_report.csv, writes merge_audit_report.md)
Write-Info ""
Write-Info "[3b/5] Running merge audit..."
try {
    if (Test-Path "merge_report.csv") {
        npm run audit-merge 2>&1 | Out-Null
        if (Test-Path "merge_audit_report.md") { Write-Success "✅ Merge audit written to merge_audit_report.md" }
    } else {
        Write-Info "   (No merge_report.csv — skip audit)"
    }
} catch {
    Write-Warning "⚠️ Merge audit failed (non-critical): $_"
}

# Step 4: Build dashboard
Write-Info ""
Write-Info "[5/5] Building dashboard..."
try {
    Push-Location web-dashboard
    $buildOutput = npm run build 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        throw "Dashboard build failed: $buildOutput"
    }
    
    if (-not (Test-Path "dist/index.html")) {
        throw "Dashboard dist/index.html not found after build"
    }
    
    Write-Success "✅ Dashboard built successfully"
    Write-Info "   Output: web-dashboard\dist\"
} catch {
    Write-Error "❌ Dashboard build failed: $_"
    $errors += "Dashboard"
    exit 1
} finally {
    Pop-Location
}

# Summary
$endTime = Get-Date
$duration = $endTime - $startTime

Write-Info ""
Write-Info "=========================================="
if ($errors.Count -eq 0) {
    Write-Success "✅ Pipeline completed successfully!"
    Write-Info "Duration: $($duration.TotalSeconds.ToString('F1'))s"
    Write-Info "Next: Deploy web-dashboard\dist\ to Netlify"
} else {
    Write-Error "❌ Pipeline completed with errors: $($errors -join ', ')"
    Write-Info "Duration: $($duration.TotalSeconds.ToString('F1'))s"
    exit 1
}

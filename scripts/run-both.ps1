# run-both.ps1
# Production one-shot: tsc + unified both (PP + UD) + auto sheets + Telegram (bankroll=600)
# Usage: .\scripts\run-both.ps1 [-Fresh] [-Sport NBA|NCAAB|All]

param(
    [Parameter(Mandatory=$false)]
    [switch]$Fresh,

    [Parameter(Mandatory=$false)]
    [switch]$ExactLine,

    [Parameter(Mandatory=$false)]
    [double]$bankroll = 600,

    [Parameter(Mandatory=$false)]
    [string]$Providers = "PP,UD",

    [Parameter(Mandatory=$false)]
    [ValidateSet("NBA", "NCAAB", "All")]
    [string]$Sport = "NBA"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

$ErrorActionPreference = "Stop"
$startTime = Get-Date

# Bankroll for prod (used by optimizer + sheets_push.py)
$env:BANKROLL = [string]$bankroll

Write-Info "=========================================="
Write-Info "NBA Props - E2E BOTH (PP + UD + Sheets + Telegram)"
Write-Info "=========================================="
Write-Info "Bankroll: $env:BANKROLL | Providers: $Providers | Sport: $Sport"
if ($Fresh) { Write-Info 'Fresh: --fresh (no cache)' }
if ($ExactLine) { Write-Info 'Strict lines: --exact-line' }
Write-Info ""

# Step 1: Compile
Write-Info "[1/2] Compiling TypeScript..."
$compileOutput = npx tsc -p . 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "FAIL: TypeScript compilation failed: $compileOutput"
    exit 1
}
Write-Success "OK Compiled"

# Step 2: Run unified optimizer (both + innovative + telegram -> auto sheets + PP/UD Telegram)
Write-Info ""
Write-Info '[2/2] Running optimizer (--platform both --innovative --telegram)...'
$optimizerArgs = @(
    "dist/src/run_optimizer.js",
    "--platform", "both",
    "--innovative",
    "--telegram",
    "--bankroll", [string]$bankroll,
    "--providers", $Providers,
    "--sports", $Sport,
    "--no-require-alt-lines"
)
if ($Fresh) { $optimizerArgs += "--fresh" }
if ($ExactLine) { $optimizerArgs += "--exact-line" }

$ErrorActionPreferenceSave = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& node $optimizerArgs
$ErrorActionPreference = $ErrorActionPreferenceSave
if ($LASTEXITCODE -ne 0) {
    Write-Error "FAIL: Optimizer exited with code $LASTEXITCODE"
    if (Test-Path Env:BANKROLL) { Remove-Item Env:BANKROLL -ErrorAction SilentlyContinue }
    exit 1
}
if (Test-Path Env:BANKROLL) { Remove-Item Env:BANKROLL -ErrorAction SilentlyContinue }

$duration = (Get-Date) - $startTime
Write-Info ""
Write-Info "=========================================="
Write-Success "OK E2E both completed in $([math]::Round($duration.TotalSeconds, 1))s"
Write-Info '   PP/UD cards -> Sheets pushed; Telegram: PP Tier1 + UD Top 5 (if env set)'
Write-Info "=========================================="

# scripts/refresh.ps1
# Quick data refresh: compile -> generate CSVs -> push to Sheets -> Telegram.
# PS5.1 compatible. Typical runtime: ~30-60 seconds.
#
# Usage:
#   .\scripts\refresh.ps1                    # NBA (default, uses cache if <6h old)
#   .\scripts\refresh.ps1 -Fresh             # FORCE fresh data (deletes raw SGO cache)
#   .\scripts\refresh.ps1 -Sport NCAAB
#   .\scripts\refresh.ps1 -SkipUD            # PP only
#   .\scripts\refresh.ps1 -SkipSheets        # CSVs only, no push
#   .\scripts\refresh.ps1 -SkipCompile       # Skip tsc (use if you just compiled)
#   .\scripts\refresh.ps1 -SkipTelegram      # Skip Telegram push

param(
    [string]$Sport     = "NBA",
    [switch]$Fresh,
    [switch]$SkipUD,
    [switch]$SkipSheets,
    [switch]$SkipCompile,
    [switch]$SkipTelegram
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root      = Split-Path -Parent $ScriptDir
Set-Location $Root

# Load .env into session
$envFile = Join-Path $Root ".env"
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        $line = $line.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
            [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
        }
    }
}

function Write-Step  { param([string]$n, [string]$msg) Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Write-OK    { param([string]$msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "  WARN $msg" -ForegroundColor Yellow }
function Write-Fail  { param([string]$msg) Write-Host "  ERR  $msg" -ForegroundColor Red }

# PS5.1 null-coalesce helper
function IfNull { param($a, $b) if ($null -ne $a -and $a -ne "") { $a } else { $b } }

$ErrorActionPreference = "Stop"
$t0 = Get-Date
$errors = New-Object System.Collections.Generic.List[string]

$freshLabel = ""
if ($Fresh) { $freshLabel = " [FRESH -- cache bypass]" }
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " DFS Optimizer -- Quick Refresh ($Sport)$freshLabel" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# ── Step 0 (Fresh only): Delete stale SGO raw cache ───────────────────────
if ($Fresh) {
    Write-Step "0" "Deleting stale SGO raw cache files (-Fresh)..."
    $cacheDir = Join-Path $Root "cache"
    $deleted  = 0
    foreach ($pattern in @("*_sgo_props_cache.json", "sgo_full_cache_*.json")) {
        Get-ChildItem -Path $cacheDir -Filter $pattern -ErrorAction SilentlyContinue |
            ForEach-Object { Remove-Item $_.FullName -Force; $deleted++ }
    }
    if ($deleted -gt 0) { Write-OK "Deleted $deleted stale cache file(s)" }
    else                { Write-OK "No stale cache files found (will fetch fresh anyway)" }
}

# ── Step 1: Compile ────────────────────────────────────────────────────────
if (-not $SkipCompile) {
    Write-Step "1" "Compiling TypeScript..."
    try {
        $out = npx tsc -p . 2>&1
        if ($LASTEXITCODE -ne 0) { throw "tsc failed: $out" }
        Write-OK "TypeScript compiled"
    } catch {
        Write-Fail "Compilation failed: $_"
        exit 1
    }
} else {
    Write-Step "1" "Compile skipped (--SkipCompile)"
}

# ── Step 2a: PrizePicks optimizer ──────────────────────────────────────────
Write-Step "2a" "Running PrizePicks optimizer..."
$env:EXPORT_MERGE_REPORT = "1"
$todayStr = (Get-Date).ToString("yyyy-MM-dd")
$ppCards = 0; $ppLegs = 0; $udCards = 0; $udLegs = 0; $ppMaxEv = "n/a"
try {
    $sportsArg = $Sport
    if ($Sport -eq "All") { $sportsArg = "NBA,NCAAB" }
    $baseArgs = @("dist/run_optimizer.js", "--sports", $sportsArg,
                  "--innovative", "--bankroll", "5000",
                  "--kelly-fraction", "0.5", "--min-card-ev", "0.015")
    if ($Fresh) { $baseArgs += "--fresh" }
    node @baseArgs 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "exit code $LASTEXITCODE" }

    if (Test-Path "prizepicks-legs.csv")  { $ppLegs  = (Import-Csv "prizepicks-legs.csv").Count }
    if (Test-Path "prizepicks-cards.csv") { $ppCards = (Import-Csv "prizepicks-cards.csv").Count }

    if (Test-Path "prizepicks-cards.csv") {
        $firstRow  = Import-Csv "prizepicks-cards.csv" | Select-Object -First 1
        $firstDate = IfNull $firstRow.runTimestamp (IfNull $firstRow.Date "(unknown)")
        $dateOk    = $firstDate -like "$todayStr*"
        $dateFlag  = "OK"
        if (-not $dateOk) { $dateFlag = "STALE -- expected $todayStr" }
        Write-OK "PrizePicks: $ppLegs legs | $ppCards cards | date=$firstDate [$dateFlag]"
        if (-not $dateOk) { $errors.Add("PP-stale-date") }

        $allCards = Import-Csv "prizepicks-cards.csv"
        if ($allCards.Count -gt 0 -and $allCards[0].PSObject.Properties.Name -contains "cardEv") {
            $maxEvVal = ($allCards | ForEach-Object { [double]$_.cardEv } | Measure-Object -Maximum).Maximum
            $ppMaxEv  = "{0:N2}%" -f ($maxEvVal * 100)
        }
    } else {
        Write-Warn "prizepicks-cards.csv not found after run"
        $errors.Add("PP-optimizer")
    }
} catch {
    Write-Fail "PrizePicks optimizer failed: $_"
    $errors.Add("PP-optimizer")
}

# ── Step 2b: Underdog optimizer ────────────────────────────────────────────
if (-not $SkipUD) {
    Write-Step "2b" "Running Underdog optimizer..."
    try {
        $sportsArg = $Sport
        if ($Sport -eq "All") { $sportsArg = "NBA,NCAAB" }
        $udArgs = @("dist/run_underdog_optimizer.js", "--sports", $sportsArg)
        if ($Fresh) { $udArgs += "--fresh" }
        node @udArgs 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "exit code $LASTEXITCODE" }

        if (Test-Path "underdog-legs.csv")  { $udLegs  = (Import-Csv "underdog-legs.csv").Count }
        if (Test-Path "underdog-cards.csv") { $udCards = (Import-Csv "underdog-cards.csv").Count }
        Write-OK "Underdog: $udLegs legs | $udCards cards"
    } catch {
        Write-Warn "Underdog optimizer failed (non-fatal): $_"
    }
} else {
    Write-Step "2b" "Underdog skipped (-SkipUD)"
}

# ── Step 3: Copy CSVs to dashboard public folder ───────────────────────────
$dataDir = Join-Path $Root "web-dashboard\public\data"
if (Test-Path $dataDir) {
    foreach ($f in @("prizepicks-cards.csv","prizepicks-legs.csv","underdog-cards.csv","underdog-legs.csv")) {
        if (Test-Path $f) { Copy-Item $f (Join-Path $dataDir $f) -Force }
    }
    Write-OK "CSVs copied to $dataDir"
}

# ── Step 4: Push to Google Sheets (unified script) ────────────────────────
if (-not $SkipSheets) {
    Write-Step "3" "Pushing to Google Sheets (unified)..."
    try {
        python sheets_push.py --bankroll 5000 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "sheets_push.py exited $LASTEXITCODE"
        } else {
            Write-OK "Sheets push complete (Legs + Cards + Tiers + formulas + colors)"
        }
    } catch {
        Write-Warn "sheets_push.py failed: $_"
    }
} else {
    Write-Step "3" "Sheets push skipped (-SkipSheets)"
}

# ── Step 5: Merge audit (lightweight, 0 API hits) ─────────────────────────
Write-Step "4" "Running merge audit..."
try {
    npx ts-node scripts/audit_merge_report.ts 2>&1 | Out-Null
    if (Test-Path "merge_audit_report.md") { Write-OK "merge_audit_report.md updated" }
} catch {
    Write-Warn "Merge audit failed (non-fatal): $_"
}

# ── Step 6: Live Edges + Kelly + Telegram ─────────────────────────────────
if (-not $SkipTelegram) {
    Write-Step "5" "Computing live edges + Kelly sizing + Telegram push..."
    $tgToken  = $env:TELEGRAM_BOT_TOKEN
    $tgChatId = $env:TELEGRAM_CHAT_ID
    if ($tgToken -and $tgChatId) {
        try {
            $bankroll = 1000
            if ($env:BANKROLL) { $bankroll = [int]$env:BANKROLL }
            $liveArgs = @("dist/live_edge_pusher.js",
                          "--top", "5", "--bankroll", $bankroll,
                          "--telegram",
                          "--pp-cards", $ppCards, "--ud-cards", $udCards,
                          "--pp-max-ev", $ppMaxEv)
            node @liveArgs 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-OK "LIVE EDGES sent to Telegram"
            } else {
                Write-Warn "Live edge pusher returned exit code $LASTEXITCODE"
            }
        } catch {
            Write-Warn "Live edge push failed: $_"
        }
    } else {
        Write-Warn "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env"
    }
} else {
    Write-Step "5" "Telegram skipped (-SkipTelegram)"
}

# ── Summary ────────────────────────────────────────────────────────────────
$elapsed = [int]((Get-Date) - $t0).TotalSeconds
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
if ($errors.Count -eq 0) {
    Write-Host " Refresh complete in ${elapsed}s" -ForegroundColor Green
    Write-Host " SGO -> cards -> sheets_push" -ForegroundColor Green
} else {
    Write-Host " Refresh done with errors: $($errors -join ', ')" -ForegroundColor Yellow
    Write-Host " Duration: ${elapsed}s" -ForegroundColor Yellow
}
Write-Host "======================================" -ForegroundColor Cyan

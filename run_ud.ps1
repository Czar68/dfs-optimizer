#!/usr/bin/env pwsh
# Underdog-only run: build, optimize, push to Sheets (mirrors run_pp.ps1 for PrizePicks)
# Generates 2-6 pick Standard and 3-8 pick Flex (all structures from config).
# Usage: .\run_ud.ps1 [-Sport NBA|NCAAB|All]
param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("NBA", "NCAAB", "All")]
    [string]$Sport = "NBA"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Push-Location $PSScriptRoot
try {
    Write-Host "=== Building TypeScript ===" -ForegroundColor Cyan
    npx tsc -p .

    $sportsArg = if ($Sport -eq "All") { "NBA,NCAAB" } else { $Sport }
    Write-Host "=== Running Underdog Optimizer (Sport: $Sport) ===" -ForegroundColor Cyan
    node dist/run_underdog_optimizer.js --sports $sportsArg

    Write-Host "=== Pushing UD-Legs to Sheets ===" -ForegroundColor Cyan
    python sheets_push_underdog_legs.py

    Write-Host "=== Pushing Cards to Sheets ===" -ForegroundColor Cyan
    python sheets_push_cards.py

    Write-Host "`n=== Underdog run complete ===" -ForegroundColor Green
} finally {
    Pop-Location
}

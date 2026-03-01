#!/usr/bin/env pwsh
# Full session: run optimizer using TheRundown only, then push legs + cards to Google Sheets.
# Usage: .\run-nba-rundown.ps1
# Requires: THERUNDOWN_API_KEY, Google Sheets credentials (token.json / credentials.json)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Push-Location $PSScriptRoot
try {
    Write-Host "=== Building TypeScript ===" -ForegroundColor Cyan
    npx tsc -p .

    Write-Host "=== Running Optimizer (TheRundown only) ===" -ForegroundColor Cyan
    node dist/run_optimizer.js --rundown-only --force-rundown --sports NBA

    if (-not (Test-Path "prizepicks-legs.csv")) {
        Write-Host "No prizepicks-legs.csv produced (0 legs). Skipping Sheets push." -ForegroundColor Yellow
        exit 0
    }

    Write-Host "=== Pushing Legs to Sheets ===" -ForegroundColor Cyan
    python sheets_push_legs.py

    Write-Host "=== Pushing Cards to Sheets ===" -ForegroundColor Cyan
    python sheets_push_cards.py

    Write-Host "`n=== Rundown + Sheets session complete ===" -ForegroundColor Green
} finally {
    Pop-Location
}

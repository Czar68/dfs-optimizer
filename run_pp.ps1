#!/usr/bin/env pwsh
# PrizePicks-only run: build, optimize, push to Sheets
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Push-Location $PSScriptRoot
try {
    Write-Host "=== Building TypeScript ===" -ForegroundColor Cyan
    npx tsc -p .

    Write-Host "=== Running PrizePicks Optimizer ===" -ForegroundColor Cyan
    node dist/run_optimizer.js

    Write-Host "=== Pushing Legs to Sheets ===" -ForegroundColor Cyan
    python sheets_push_legs.py

    Write-Host "=== Pushing Cards to Sheets ===" -ForegroundColor Cyan
    python sheets_push_cards.py

    Write-Host "`n=== PrizePicks run complete ===" -ForegroundColor Green
} finally {
    Pop-Location
}

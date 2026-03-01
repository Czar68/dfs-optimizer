#!/usr/bin/env pwsh
# Combined run: build, run both optimizers, push all to Sheets
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Push-Location $PSScriptRoot
try {
    Write-Host "=== Building TypeScript ===" -ForegroundColor Cyan
    npx tsc -p .

    Write-Host "=== Running PrizePicks Optimizer ===" -ForegroundColor Cyan
    node dist/run_optimizer.js

    Write-Host "=== Running Underdog Optimizer ===" -ForegroundColor Cyan
    node dist/run_underdog_optimizer.js

    Write-Host "=== Pushing PP Legs to Sheets ===" -ForegroundColor Cyan
    python sheets_push_legs.py

    Write-Host "=== Pushing UD Legs to Sheets ===" -ForegroundColor Cyan
    python sheets_push_underdog_legs.py

    Write-Host "=== Pushing Cards to Sheets ===" -ForegroundColor Cyan
    python sheets_push_cards.py

    Write-Host "`n=== Combined run complete ===" -ForegroundColor Green
} finally {
    Pop-Location
}

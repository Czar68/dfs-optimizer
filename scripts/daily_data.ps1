# 6PM daily data: PrizePicks/Underdog imports
# Task Scheduler: NBA-Data-6PM daily 18:00
# Odds data from OddsAPI (fetch_oddsapi_props.ts).
param([switch]$DryRun)
$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { Get-Location }
Set-Location $root

$date = Get-Date -Format "yyyy-MM-dd"

if (Test-Path "$PSScriptRoot\import_prizepicks.ps1") {
    & "$PSScriptRoot\import_prizepicks.ps1" -DryRun:$DryRun
}
if (Test-Path "$PSScriptRoot\import_underdog.ps1") {
    & "$PSScriptRoot\import_underdog.ps1" -DryRun:$DryRun
}

Write-Host "6PM DATA COMPLETE -> cache updated ($date)"

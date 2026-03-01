# verify_wiring.ps1 - Verification contract: dry-run produces last_run.json, then assert
param([ValidateSet("all","optimizer")] [string]$Flow = "all", [switch]$DryRun)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
function Assert-Path($p) { if (-not (Test-Path $p)) { throw "Missing required path: $p" } }
if ($DryRun) {
    & "$PSScriptRoot\run_optimizer.ps1" -DryRun; Assert-Path "artifacts\last_run.json"
    Write-Output "verify_wiring passed (DryRun)"
    return
}
if ($Flow -in @("all","optimizer")) { & "$PSScriptRoot\run_optimizer.ps1" -DryRun; Assert-Path "artifacts\last_run.json" }
Write-Output "verify_wiring passed for $Flow"

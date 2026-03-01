# Single entry: nightly, optimizer, verify, or all. Optional master orchestrator.
param([ValidateSet("nightly","optimizer","verify","all")] [string]$Mode = "nightly", [switch]$Force)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$master = "C:\Users\Media-Czar Desktop\Dev\master_auto\scripts\master_auto.ps1"
if (Test-Path $master) { & $master -Mode $Mode -Projects (Convert-Path ".") -Force:$Force; exit $LASTEXITCODE }

switch ($Mode) {
  "nightly"   { & "$PSScriptRoot\nightly_maint.ps1" -Force:$Force }
  "optimizer" { & "$PSScriptRoot\run_optimizer.ps1" -Force:$Force }
  "verify"    { & "$PSScriptRoot\verify_wiring.ps1" -Flow all }
  "all"       { & "$PSScriptRoot\nightly_maint.ps1" -Force:$Force; & "$PSScriptRoot\run_optimizer.ps1" -Force:$Force; & "$PSScriptRoot\verify_wiring.ps1" -Flow all }
}
Write-Output "Done."

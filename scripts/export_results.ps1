# export_results.ps1 — Wrapper to export today's cards to results DB + CSV archive
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $root
python scripts/export_results.py @args
$exitCode = $LASTEXITCODE
Pop-Location
exit $exitCode

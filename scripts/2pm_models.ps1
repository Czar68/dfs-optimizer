# 2PM: Fresh midday data + XGB/LSTM retrain + EV>1.05 legs. Task: NBA-Models-2PM daily 14:00
$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { Get-Location }
Set-Location $root

. "$PSScriptRoot\_paths.ps1"
& "$PSScriptRoot\daily_data.ps1"
& "$PSScriptRoot\train_models.ps1" -Backtest
# [DEPRECATED] Python legacy logic moved to legacy/python_archive/. Do not re-enable.
# if (Test-Path "src\ev_parlay.py") {
#     & python src/ev_parlay.py --generate 2>&1
# }

$sentinel = Join-Path $root (Join-Path $ArtifactsDir "train_models_done.txt")
if (-not (Test-Path $sentinel)) { throw "CRITICAL: Pipeline output missing. Expected: $sentinel" }
Write-Host "2PM: Models retrained, EV legs generated"

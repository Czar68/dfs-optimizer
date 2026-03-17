# Model training pipeline: Historical XGB (NBA) + LSTM EV (sportsbook data)
# Run from dfs-optimizer root
param([switch]$Backtest)
$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { Get-Location }
Set-Location $root

# [DEPRECATED] Python legacy logic moved to legacy/python_archive/. Do not re-enable.
# Write-Host "Historical XGB (nba)"
# $args = @("src/historical_model.py", "--sport", "nba", "--model", "xgb")
# if ($Backtest) { $args += "--backtest" }
# & python $args 2>&1
#
# if (Test-Path "src/lstm_ev.py") {
#     Write-Host "LSTM EV (sportsbook)"
#     & python src/lstm_ev.py --sharpe 1.2 2>&1
# }

# Sentinel so 2pm_models.ps1 can fail-fast if this step is required (no-op pipeline still writes sentinel)
New-Item -ItemType Directory -Force -Path "artifacts" | Out-Null
(Get-Date -Format "yyyyMMdd-HHmmss") | Out-File "artifacts\train_models_done.txt" -Encoding utf8

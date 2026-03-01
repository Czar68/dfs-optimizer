# Model training pipeline: Historical XGB (NBA) + LSTM EV (sportsbook data)
# Run from dfs-optimizer root
param([switch]$Backtest)
$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { Get-Location }
Set-Location $root

Write-Host "Historical XGB (nba)"
$args = @("src/historical_model.py", "--sport", "nba", "--model", "xgb")
if ($Backtest) { $args += "--backtest" }
& python $args 2>&1

if (Test-Path "src/lstm_ev.py") {
    Write-Host "LSTM EV (sportsbook)"
    $dataPath = "cache/sgo_historical_30d.json"
    if (Test-Path $dataPath) {
        & python src/lstm_ev.py --data $dataPath --sharpe 1.2 2>&1
    } else { Write-Host "Skip LSTM: $dataPath not found" }
}

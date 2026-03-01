# 6PM: Final pre-tipoff data + 5-leg Kelly parlays + Telegram. Task: NBA-Cards-6PM daily 18:00
$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { Get-Location }
Set-Location $root

& "$PSScriptRoot\daily_data.ps1"
$legs = 0
$cards = 0
if (Test-Path "src\parlay_builder.py") {
    $out = & python src/parlay_builder.py --kelly 2>&1 | Out-String
    if ($out -match "legs=(\d+)") { $legs = [int]$Matches[1] }
    if ($out -match "cards=(\d+)") { $cards = [int]$Matches[1] }
}
$telegramScript = Join-Path $root "..\master_auto\scripts\telegram_bot.py"
if ($env:TELEGRAM_TOKEN -and (Test-Path $telegramScript)) {
    & python $telegramScript "NBA Cards Ready" $legs $cards 2>$null
}

Write-Host "6PM: Final cards ready (legs=$legs cards=$cards)"

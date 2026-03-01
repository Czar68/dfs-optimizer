# 9AM: Opening lines + PrizePicks/Underdog import. Task: NBA-Data-9AM daily 09:00
$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { Get-Location }
Set-Location $root

if (-not $env:SGO_KEY) { Write-Warning "Set `$env:SGO_KEY"; return }
$cacheDir = "cache"
if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }

try {
    $sgo = (Invoke-WebRequest -Uri "https://api.sportsgameodds.com/nba/opening_lines?key=$env:SGO_KEY" -UseBasicParsing).Content | ConvertFrom-Json
    $ts = Get-Date -Format "yyyyMMdd_HHmm"
    $sgo | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $cacheDir "sgo_opening_$ts.json") -Encoding utf8
} catch { Write-Warning "SGO opening_lines failed: $_" }

if (Test-Path "$PSScriptRoot\import_prizepicks.ps1") { & "$PSScriptRoot\import_prizepicks.ps1" }
if (Test-Path "$PSScriptRoot\import_underdog.ps1") { & "$PSScriptRoot\import_underdog.ps1" }

Write-Host "9AM: Opening lines captured"

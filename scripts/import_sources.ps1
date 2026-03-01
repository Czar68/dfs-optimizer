# SGO + Rundown import -> shared-cache (run from project root or scripts/)
# Requires: $env:SGO_KEY, $env:RUNDOWN_KEY
# Symlink from project: mklink /d shared-cache ..\shared-cache  (run from project root as Admin)
$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { Get-Location }
$sharedCache = Join-Path $root "..\shared-cache"
if (-not (Test-Path $sharedCache)) { New-Item -ItemType Directory -Path $sharedCache -Force | Out-Null }

if (-not $env:SGO_KEY) { Write-Warning "SGO_KEY not set"; exit 1 }
if (-not $env:RUNDOWN_KEY) { Write-Warning "RUNDOWN_KEY not set"; exit 1 }

$sgoUrl = "https://api.sportsgameodds.com/nba?key=$env:SGO_KEY"
$rundownUrl = "https://api.therundown.io/nba_props?key=$env:RUNDOWN_KEY"

try {
    $sgoJson = (Invoke-WebRequest -Uri $sgoUrl -UseBasicParsing).Content
    $sgoJson | Out-File (Join-Path $sharedCache "sgo_nba.json") -Encoding utf8
    Write-Output "Wrote shared-cache\sgo_nba.json"
} catch { Write-Warning "SGO fetch failed: $_" }

try {
    $rundownJson = (Invoke-WebRequest -Uri $rundownUrl -UseBasicParsing).Content
    $rundownJson | Out-File (Join-Path $sharedCache "rundown.json") -Encoding utf8
    Write-Output "Wrote shared-cache\rundown.json"
} catch { Write-Warning "Rundown fetch failed: $_" }

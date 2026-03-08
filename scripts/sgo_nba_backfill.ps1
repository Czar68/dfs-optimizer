# SGO NBA backfill: fetch historical NBA games from SportsGameOdds API into CSV.
# Fix: pass SGO_API_KEY to Python (env or .env); no 401 from placeholder key.
# Usage: .\scripts\sgo_nba_backfill.ps1 [-Days 7] [-MaxGames 50]
#        npm run sgo-nba-backfill -- --days 7
#        Nightly / auto (50/day): npm run sgo-nba-backfill -- --days 1 --max-games 50
param(
    [int] $Days = 7,
    [int] $MaxGames = 100
)
# Parse npm-style args: --days 7 --max-games 50
for ($i = 0; $i -lt $args.Count; $i++) {
    if ($args[$i] -eq "--days" -and $i + 1 -lt $args.Count) { $Days = [int]$args[$i + 1]; $i++ }
    elseif ($args[$i] -eq "--max-games" -and $i + 1 -lt $args.Count) { $MaxGames = [int]$args[$i + 1]; $i++ }
}

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 1) Resolve SGO_API_KEY: env first, then .env fallback
$apiKey = $env:SGO_API_KEY
if (-not $apiKey) { $apiKey = $env:SGOAPIKEY }
if (-not $apiKey) {
    $envFile = Join-Path $root ".env"
    if (Test-Path $envFile) {
        Get-Content $envFile -Encoding UTF8 | ForEach-Object {
            if ($_ -match '^\s*SGO_API_KEY\s*=\s*(.+)\s*$') {
                $apiKey = $matches[1].Trim().Trim('"').Trim("'")
            }
            if ($_ -match '^\s*SGOAPIKEY\s*=\s*(.+)\s*$' -and -not $apiKey) {
                $apiKey = $matches[1].Trim().Trim('"').Trim("'")
            }
        }
    }
}

if (-not $apiKey -or $apiKey -match 'sk-your|your_real') {
    Write-Warning "SGO_API_KEY not set or still placeholder. Set in .env (SGO_API_KEY=...) or `$env:SGO_API_KEY"
    exit 1
}

# 2) Pass key to Python via environment (subprocess inherits)
$env:SGO_API_KEY = $apiKey

# 3) Invoke Python with args
$pyScript = Join-Path $PSScriptRoot "sgo_nba_historical.py"
if (-not (Test-Path $pyScript)) {
    Write-Error "Missing $pyScript"
    exit 1
}

& python $pyScript --days $Days --max-games $MaxGames --out "cache/sgo_nba_games.csv"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "SGO NBA backfill done: $Days days, max $MaxGames games -> cache/sgo_nba_games.csv" -ForegroundColor Green

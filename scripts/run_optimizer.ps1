# Canonical full pipeline: compile + OddsAPI-backed merge (PP/UD) + legs/cards + tier1/2 + sheets + telegram. Writes artifacts.
param([switch]$Force, [switch]$DryRun, [double]$bankroll = 700)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

. "$PSScriptRoot\_auto_window.ps1"
if (-not (Test-AutoWindow -Force:$Force) -and -not $DryRun) {
  Write-Output "Outside window. Use -Force."
  exit 0
}

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path "artifacts","artifacts\logs" | Out-Null

if ($DryRun) {
  npx ts-node scripts/write_dry_run_canonical_status.ts "--runTimestamp=$ts" | Out-Null
  $runHealth = "degraded_success"
  $runOutcome = "full_success"
  $degradationReasons = @("dry_run_no_live_execution")
  $missingExpectedArtifacts = @()
  if (Test-Path "data\reports\latest_run_status.json") {
    try {
      $status = Get-Content "data\reports\latest_run_status.json" -Raw | ConvertFrom-Json
      if ($null -ne $status.runHealth -and [string]::IsNullOrWhiteSpace([string]$status.runHealth) -eq $false) {
        $runHealth = [string]$status.runHealth
      }
      if ($null -ne $status.outcome -and [string]::IsNullOrWhiteSpace([string]$status.outcome) -eq $false) {
        $runOutcome = [string]$status.outcome
      }
      if ($null -ne $status.degradationReasons) {
        $degradationReasons = @($status.degradationReasons)
      }
      if ($null -ne $status.missingExpectedArtifacts) {
        $missingExpectedArtifacts = @($status.missingExpectedArtifacts)
      }
    } catch {
      Write-Warning "Could not parse data\reports\latest_run_status.json for dry-run artifact status."
    }
  }

  $json = @{
    flow = "nba_optimizer"
    status = $runHealth
    ts = $ts
    run_outcome = $runOutcome
    degradation_reasons = $degradationReasons
    missing_expected_artifacts = $missingExpectedArtifacts
    metrics = @{
      pp_legs = 0
      ud_cards = 0
      tier1 = 0
      tier2 = 0
      sheets_pushed = $false
      telegram_sent = $false
    }
  } | ConvertTo-Json -Compress
  $json | Out-File "artifacts\last_run.json" -Encoding utf8

  $report = @"
# NBA Optimizer Run $ts

| Metric | Value |
|--------|-------|
| PP legs | 0 |
| UD cards | 0 |
| Tier1 | 0 |
| Tier2 | 0 |
| Sheets pushed | False |
| Telegram sent | False |
| Run health | $runHealth |
| Run outcome | $runOutcome |
| Degradation reasons | $($degradationReasons -join '; ') |
| Missing expected artifacts | $($missingExpectedArtifacts -join '; ') |

Machine: artifacts\last_run.json
Canonical status: data\reports\latest_run_status.json
"@
  $report | Out-File "artifacts\nba_optimizer_$ts.md" -Encoding utf8
  Write-Output "Dry run canonical status emitted; artifacts\last_run.json written."
  exit 0
}

$env:BANKROLL = [string]$bankroll
$logPath = "artifacts\logs\run_$ts.txt"

# 1) Compile (Continue: tsc may write diagnostics to stderr without failing; we trust $LASTEXITCODE)
try {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  npx tsc -p . 2>&1 | Tee-Object -FilePath $logPath -Append
  $tscExit = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  if ($tscExit -ne 0) { throw "Compile failed" }
} catch {
  "Build failed" | Out-File "artifacts\logs\build_$ts.failed.txt"
  '{"flow":"nba_optimizer","status":"failed","ts":"' + $ts + '","error":"compile"}' | Out-File "artifacts\last_run.json" -Encoding utf8
  throw
}

# 2) Full pipeline: platform both, innovative, telegram, providers PP,UD,TRD
$nodeArgs = @(
  "dist/src/run_optimizer.js",
  "--platform", "both",
  "--innovative",
  "--telegram",
  "--bankroll", [string]$bankroll,
  "--providers", "PP,UD",
  "--sports", "NBA"
)
try {
  # Continue: Node uses stderr for console.warn; with Stop + 2>&1 that can terminate the pipeline before we read $LASTEXITCODE.
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & node $nodeArgs 2>&1 | Tee-Object -FilePath $logPath -Append
  $nodeExit = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  if ($nodeExit -ne 0) { throw "Optimizer exited $nodeExit" }
} catch {
  "Run failed" | Out-File "artifacts\logs\run_$ts.failed.txt"
  '{"flow":"nba_optimizer","status":"failed","ts":"' + $ts + '","error":"optimizer"}' | Out-File "artifacts\last_run.json" -Encoding utf8
  throw
}

# 4) Sync optimizer output to web-dashboard/dist/data/
$distData = "web-dashboard\dist\data"
if (!(Test-Path $distData)) { New-Item -ItemType Directory -Path $distData -Force }

Copy-Item "prizepicks-cards.csv"  "$distData\prizepicks-cards.csv"  -Force -ErrorAction SilentlyContinue
Copy-Item "prizepicks-legs.csv"   "$distData\prizepicks-legs.csv"   -Force -ErrorAction SilentlyContinue
Copy-Item "underdog-cards.csv"    "$distData\underdog-cards.csv"    -Force -ErrorAction SilentlyContinue
Copy-Item "underdog-legs.csv"     "$distData\underdog-legs.csv"     -Force -ErrorAction SilentlyContinue

if (Test-Path "data\last_fresh_run.json") {
    Copy-Item "data\last_fresh_run.json" "$distData\last_fresh_run.json" -Force
}

Write-Host "[Sync] Copied optimizer output -> web-dashboard/dist/data/"

# Load .env into PowerShell environment
$envFile = Join-Path $PSScriptRoot "..\\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
    Write-Host "[ENV] Loaded .env into PowerShell environment"
}

# SFTP deploy to Ionos
$sftpHost   = $env:SFTP_SERVER
$sftpUser   = $env:FTP_USERNAME
$sftpPass   = $env:FTP_PASSWORD
$remotePath = $env:REMOTE_PATH
$localData  = Resolve-Path "web-dashboard\dist\data"

if ($sftpHost -and $sftpUser -and $sftpPass -and $remotePath) {
    try {
        if (!(Get-Module -ListAvailable -Name Posh-SSH)) {
            Write-Host "[SFTP] Installing Posh-SSH (one-time)..."
            Install-Module -Name Posh-SSH -Force -Scope CurrentUser -AllowClobber
        }
        Import-Module Posh-SSH -Force

        $secPass = ConvertTo-SecureString $sftpPass -AsPlainText -Force
        $cred    = New-Object System.Management.Automation.PSCredential($sftpUser, $secPass)
        $sess    = New-SFTPSession -ComputerName $sftpHost -Credential $cred -AcceptKey -Force

        foreach ($file in @("last_fresh_run.json","prizepicks-cards.csv","prizepicks-legs.csv","underdog-cards.csv","underdog-legs.csv")) {
            $local = Join-Path $localData $file
            if (Test-Path $local) {
                try {
                    Set-SFTPItem -SessionId $sess.SessionId -Path $local -Destination "dfs/data" -Force
                    Write-Host "[SFTP] $file -> dfs/data/"
                } catch {
                    Write-Host "[SFTP] Failed to upload $file to dfs/data/ : $_"
                    # Try root directory as fallback
                    try {
                        Set-SFTPItem -SessionId $sess.SessionId -Path $local -Destination "dfs" -Force
                        Write-Host "[SFTP] $file -> dfs/ (fallback)"
                    } catch {
                        Write-Host "[SFTP] Failed to upload $file to dfs/ : $_"
                    }
                }
            }
        }

        Remove-SFTPSession -SessionId $sess.SessionId
        Write-Host "[SFTP] Deploy complete -> $sftpHost"
    } catch {
        Write-Host "[SFTP] ERROR: $_"
    }
} else {
    Write-Host "[SFTP] Skipped - missing credentials in .env"
}

# 6) Extract metrics from run log and output files
$logContent = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
$ppLegs = 0
$udCards = 0
$sheetsPushed = $false
$telegramSent = $false

if (Test-Path "prizepicks-legs.csv") { $ppLegs = (Get-Content "prizepicks-legs.csv" | Measure-Object -Line).Lines - 1; if ($ppLegs -lt 0) { $ppLegs = 0 } }
if (Test-Path "underdog-cards.csv") { $udCards = (Get-Content "underdog-cards.csv" | Measure-Object -Line).Lines - 1; if ($udCards -lt 0) { $udCards = 0 } }
if ($logContent -match "Pushed \d+ rows") { $sheetsPushed = $true }
if ($logContent -match "DONE:") { $sheetsPushed = $true }
if ($logContent -match "message sent|Telegram.*sent|UD top-5 message sent") { $telegramSent = $true }

$t1 = 0
$t2 = 0
if (Test-Path "tier1.csv") { $t1 = (Get-Content "tier1.csv" | Measure-Object -Line).Lines - 1; if ($t1 -lt 0) { $t1 = 0 } }
if (Test-Path "tier2.csv") { $t2 = (Get-Content "tier2.csv" | Measure-Object -Line).Lines - 1; if ($t2 -lt 0) { $t2 = 0 } }

$runHealth = "success"
$runOutcome = "full_success"
$degradationReasons = @()
$missingExpectedArtifacts = @()
if (Test-Path "data\reports\latest_run_status.json") {
  try {
    $status = Get-Content "data\reports\latest_run_status.json" -Raw | ConvertFrom-Json
    if ($null -ne $status.runHealth -and [string]::IsNullOrWhiteSpace([string]$status.runHealth) -eq $false) {
      $runHealth = [string]$status.runHealth
    } elseif ($null -ne $status.outcome -and [string]$status.outcome -eq "early_exit") {
      $runHealth = "partial_completion"
    } elseif ($null -ne $status.success -and -not [bool]$status.success) {
      $runHealth = "hard_failure"
    }
    if ($null -ne $status.outcome -and [string]::IsNullOrWhiteSpace([string]$status.outcome) -eq $false) {
      $runOutcome = [string]$status.outcome
    }
    if ($null -ne $status.degradationReasons) {
      $degradationReasons = @($status.degradationReasons)
    }
    if ($null -ne $status.missingExpectedArtifacts) {
      $missingExpectedArtifacts = @($status.missingExpectedArtifacts)
    }
  } catch {
    Write-Warning "Could not parse data\reports\latest_run_status.json for artifact status."
  }
}

# 4) Write artifacts contract
$json = @{
  flow = "nba_optimizer"
  status = $runHealth
  ts = $ts
  run_outcome = $runOutcome
  degradation_reasons = $degradationReasons
  missing_expected_artifacts = $missingExpectedArtifacts
  metrics = @{
    pp_legs = $ppLegs
    ud_cards = $udCards
    tier1 = $t1
    tier2 = $t2
    sheets_pushed = $sheetsPushed
    telegram_sent = $telegramSent
  }
} | ConvertTo-Json -Compress
$json | Out-File "artifacts\last_run.json" -Encoding utf8

$report = @"
# NBA Optimizer Run $ts

| Metric | Value |
|--------|-------|
| PP legs | $ppLegs |
| UD cards | $udCards |
| Tier1 | $t1 |
| Tier2 | $t2 |
| Sheets pushed | $sheetsPushed |
| Telegram sent | $telegramSent |
| Run health | $runHealth |
| Run outcome | $runOutcome |
| Degradation reasons | $($degradationReasons -join '; ') |
| Missing expected artifacts | $($missingExpectedArtifacts -join '; ') |

Logs: artifacts\logs\run_$ts.txt
Machine: artifacts\last_run.json
"@
$report | Out-File "artifacts\nba_optimizer_$ts.md" -Encoding utf8

Write-Output "Wrote artifacts\last_run.json (status=success) and artifacts\nba_optimizer_$ts.md"

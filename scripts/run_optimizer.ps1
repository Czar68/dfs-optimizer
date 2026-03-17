# Canonical full pipeline: compile + PP/UD (OddsAPI) + legs/cards + tier1/2 + sheets + telegram. Writes artifacts.
# -NoGuardrails: forward --no-guardrails to node (for validation or when PP merge ratio is below 12%).
param([switch]$Force, [switch]$DryRun, [switch]$NoGuardrails, [switch]$Recalculate, [double]$bankroll = 700)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
. "$PSScriptRoot\_assert_compiled.ps1"
. "$PSScriptRoot\_paths.ps1"
Assert-Compiled -Root "$root" -RequiredArtifacts @('dist\src\run_optimizer.js')
Set-Location "$root"

. "$PSScriptRoot\_auto_window.ps1"
if (-not (Test-AutoWindow -Force:$Force) -and -not $DryRun) {
  Write-Output "Outside window. Use -Force."
  exit 0
}

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path "artifacts","artifacts\logs" | Out-Null

if ($DryRun) {
  '{"flow":"nba_optimizer","status":"dry_run_ok","ts":"' + $ts + '"}' | Out-File "artifacts\last_run.json" -Encoding utf8
  "Dry run OK ($ts)" | Out-File "artifacts\nba_optimizer_$ts.md" -Encoding utf8
  Write-Output "Dry run OK; artifacts\last_run.json written."
  exit 0
}

$logPath = "artifacts\logs\run_$ts.txt"

if ($env:USE_MOCK_ODDS -eq "1") {
  Write-Error "[SAFETY] USE_MOCK_ODDS=1 is set in the environment. Refusing to run daily pipeline with mock data. Unset USE_MOCK_ODDS and retry."
  exit 1
}

# Environment isolation: set only for this run, log before/after, clear after
$env:BANKROLL = [string]$bankroll
$env:EXPORT_MERGE_REPORT = "1"  # Required for merge_report_prizepicks.csv, merge_report_underdog.csv (metrics + dashboard)
"ENV before run: BANKROLL=$($env:BANKROLL) EXPORT_MERGE_REPORT=$($env:EXPORT_MERGE_REPORT)" | Add-Content -Path "$logPath" -Encoding utf8

# Helper: run a command, capture stdout and stderr separately, log both, and fail only on exit code (not on stderr).
# Avoids NativeCommandError from stderr and Tee-Object pipeline; real errors still appear in log and on host.
function Invoke-NativeWithLogging {
  param([string]$Command, [string[]]$ArgumentList, [string]$LogPath, [string]$FailureFilePath)
  $stdoutFile = [System.IO.Path]::GetTempFileName()
  $stderrFile = [System.IO.Path]::GetTempFileName()
  try {
    # All path variables in double quotes so paths with spaces (e.g. Media-Czar Desktop) are not fragmented.
    $p = Start-Process -FilePath "$Command" -ArgumentList $ArgumentList -WorkingDirectory "$root" `
      -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$stdoutFile" -RedirectStandardError "$stderrFile"
    $stdout = Get-Content -Path "$stdoutFile" -Raw -ErrorAction SilentlyContinue
    $stderr = Get-Content -Path "$stderrFile" -Raw -ErrorAction SilentlyContinue
    if ($stdout) { $stdout | Add-Content -Path "$LogPath" -Encoding utf8 }
    if ($stderr) {
      $stderr | Add-Content -Path "$LogPath" -Encoding utf8
      Write-Host $stderr -ForegroundColor Yellow
    }
    if ($p.ExitCode -ne 0) {
      if ($FailureFilePath) { "Exit code $($p.ExitCode)" | Out-File "$FailureFilePath" -Encoding utf8 }
      throw "Exit code $($p.ExitCode)"
    }
    return $p.ExitCode
  } finally {
    if (Test-Path "$stdoutFile") { Remove-Item "$stdoutFile" -Force -ErrorAction SilentlyContinue }
    if (Test-Path "$stderrFile") { Remove-Item "$stderrFile" -Force -ErrorAction SilentlyContinue }
  }
}

# 1) Compile
try {
  Invoke-NativeWithLogging -Command "npx" -ArgumentList @("tsc", "-p", ".") -LogPath "$logPath" -FailureFilePath "artifacts\logs\build_$ts.failed.txt" | Out-Null
} catch {
  '{"flow":"nba_optimizer","status":"failed","ts":"' + $ts + '","error":"compile"}' | Out-File "artifacts\last_run.json" -Encoding utf8
  throw
}

# 2) Full pipeline: platform both, innovative, telegram, providers PP,UD
# Script path quoted so spaces (e.g. C:\Users\Media-Czar Desktop\...) do not fragment the command.
$scriptPath = Join-Path -Path "$root" -ChildPath "dist\src\run_optimizer.js"
# Quote script path so paths with spaces (e.g. Media-Czar Desktop) are one argument to node.
$nodeArgs = @(
  "`"$scriptPath`"",
  "--platform", "both",
  "--innovative",
  "--telegram",
  "--bankroll", ([string]$bankroll),
  "--providers", "PP,UD",
  "--sports", "NBA"
)
if ($NoGuardrails) { $nodeArgs += "--no-guardrails" }
if ($Recalculate) { $nodeArgs += "--recalculate" }
try {
  Invoke-NativeWithLogging -Command "node" -ArgumentList $nodeArgs -LogPath "$logPath" -FailureFilePath "artifacts\logs\run_$ts.failed.txt" | Out-Null
} catch {
  # Node exited non-zero (e.g. no live odds, ODDSAPI_KEY invalid): record failure for artifacts/last_run.json
  '{"flow":"nba_optimizer","status":"failed","ts":"' + $ts + '","error":"optimizer"}' | Out-File "artifacts\last_run.json" -Encoding utf8
  throw
} finally {
  # Clear env to prevent leakage into subsequent runs
  if (Test-Path Env:BANKROLL) { Remove-Item Env:BANKROLL -ErrorAction SilentlyContinue }
  if (Test-Path Env:EXPORT_MERGE_REPORT) { Remove-Item Env:EXPORT_MERGE_REPORT -ErrorAction SilentlyContinue }
  if (Test-Path Env:USE_MOCK_ODDS) { Remove-Item Env:USE_MOCK_ODDS -ErrorAction SilentlyContinue }
  "ENV after run: BANKROLL cleared, EXPORT_MERGE_REPORT cleared, USE_MOCK_ODDS cleared" | Add-Content -Path "$logPath" -Encoding utf8
}
try {
  # Fail-fast: pipeline must produce at least one critical output
  $ppLegsFile = Join-Path $root (Join-Path $OutputDir $FileNamePpLegsCsv)
  $udCardsFile = Join-Path $root (Join-Path $OutputDir $FileNameUdCardsCsv)
  if (-not (Test-Path "$ppLegsFile") -and -not (Test-Path "$udCardsFile")) {
    throw "CRITICAL: Pipeline output missing. Expected at least one of: $ppLegsFile or $udCardsFile"
  }
} catch {
  '{"flow":"nba_optimizer","status":"failed","ts":"' + $ts + '","error":"optimizer"}' | Out-File "artifacts\last_run.json" -Encoding utf8
  throw
}

# 3) Extract metrics from run log and output files
$logContent = Get-Content "$logPath" -Raw -ErrorAction SilentlyContinue
$ppLegs = 0
$udCards = 0
$sheetsPushed = $false
$telegramSent = $false

$ppLegsFile = Join-Path $root (Join-Path $OutputDir $FileNamePpLegsCsv)
$udLegsFile = Join-Path $root (Join-Path $OutputDir $FileNameUdLegsCsv)
$udCardsFile = Join-Path $root (Join-Path $OutputDir $FileNameUdCardsCsv)
$tier1File = Join-Path $root (Join-Path $OutputDir $FileNameTier1Csv)
$tier2File = Join-Path $root (Join-Path $OutputDir $FileNameTier2Csv)

if (Test-Path "$ppLegsFile") { $ppLegs = (Get-Content "$ppLegsFile" | Measure-Object -Line).Lines - 1; if ($ppLegs -lt 0) { $ppLegs = 0 } }
if (Test-Path "$udCardsFile") { $udCards = (Get-Content "$udCardsFile" | Measure-Object -Line).Lines - 1; if ($udCards -lt 0) { $udCards = 0 } }
if ($logContent -match "Pushed \d+ rows") { $sheetsPushed = $true }
if ($logContent -match "DONE:") { $sheetsPushed = $true }
if ($logContent -match "message sent|Telegram.*sent|UD top-5 message sent") { $telegramSent = $true }

$t1 = 0
$t2 = 0
if (Test-Path "$tier1File") { $t1 = (Get-Content "$tier1File" | Measure-Object -Line).Lines - 1; if ($t1 -lt 0) { $t1 = 0 } }
if (Test-Path "$tier2File") { $t2 = (Get-Content "$tier2File" | Measure-Object -Line).Lines - 1; if ($t2 -lt 0) { $t2 = 0 } }

# 3b) Extract and log match rate summary from merge_report CSV(s)
$mergeReportPp = Join-Path $root (Join-Path $OutputDir "merge_report_prizepicks.csv")
$mergeReportUd = Join-Path $root (Join-Path $OutputDir "merge_report_underdog.csv")
$matchHistoryPath = Join-Path $root (Join-Path $ArtifactsDir "match_rate_history.csv")
$pp_total = 0; $pp_matched = 0; $ud_total = 0; $ud_matched = 0; $ud_fallback_hits = 0; $ud_fallback_attempts = 0
$fallbackLine = $null
if ($logContent) {
  $logLines = $logContent -split "`n"
  $fallbackLine = $logLines | Where-Object { $_ -match '\[MERGE\] fallback matches' } | Select-Object -Last 1
}
if ($fallbackLine -match 'UD=(\d+).*of (\d+) total') {
  $ud_fallback_hits = [int]$Matches[1]
  $ud_fallback_attempts = [int]$Matches[2]
}
if (Test-Path $mergeReportPp) {
  $ppRows = Import-Csv $mergeReportPp -ErrorAction SilentlyContinue
  if ($ppRows) {
    $pp_total = @($ppRows).Count
    $pp_matched = @($ppRows | Where-Object { $_.matched -eq "Y" }).Count
  }
}
if (Test-Path $mergeReportUd) {
  $udRows = Import-Csv $mergeReportUd -ErrorAction SilentlyContinue
  if ($udRows) {
    $ud_total = @($udRows).Count
    $ud_matched = @($udRows | Where-Object { $_.matched -eq "Y" }).Count
    if ($ud_fallback_hits -eq 0) {
      $udFb = @($udRows | Where-Object { $_.reason -eq "ok_fallback" -or $_.matchType -eq "fallback_ud" })
      $ud_fallback_hits = $udFb.Count
    }
  }
}
if ($pp_total -gt 0 -or $ud_total -gt 0) {
  $pp_rate = if ($pp_total -gt 0) { [math]::Round(100 * $pp_matched / $pp_total, 1) } else { 0 }
  $ud_rate = if ($ud_total -gt 0) { [math]::Round(100 * $ud_matched / $ud_total, 1) } else { 0 }
  $ud_fb_rate = if ($ud_fallback_attempts -gt 0) { [math]::Round(100 * $ud_fallback_hits / $ud_fallback_attempts, 1) } else { 0 }
  Write-Output "[METRICS] PP: $pp_matched/$pp_total matched ($pp_rate%) | UD: $ud_matched/$ud_total matched ($ud_rate%) | UD fallback hits: $ud_fallback_hits/$ud_fallback_attempts"
  $csvHeader = "run_ts,pp_total,pp_matched,pp_rate,ud_total,ud_matched,ud_rate,ud_fallback_attempts,ud_fallback_hits,ud_fallback_rate"
  $csvRow = "$ts,$pp_total,$pp_matched,$pp_rate,$ud_total,$ud_matched,$ud_rate,$ud_fallback_attempts,$ud_fallback_hits,$ud_fb_rate"
  if (-not (Test-Path $matchHistoryPath)) {
    $csvHeader | Out-File $matchHistoryPath -Encoding utf8
  }
  $csvRow | Add-Content $matchHistoryPath -Encoding utf8
  $historyRows = @(Get-Content $matchHistoryPath -ErrorAction SilentlyContinue | Select-Object -Skip 1)
  if ($historyRows.Count -ge 3) {
    $rates = @($historyRows | ForEach-Object {
      $cols = $_ -split ","
      if ($cols.Length -ge 10) { [double]$cols[9] } else { $null }
    } | Where-Object { $null -ne $_ })
    $ratesBelow30 = @($rates | Where-Object { $_ -lt 30 })
    $allBelow = $ratesBelow30.Count -eq $rates.Count -and $rates.Count -gt 0
    if ($allBelow) {
      Write-Warning "[WARN] UD fallback hit rate consistently below 30% across $($rates.Count) slates - audit recommended."
    }
  }
}

# 4) Write artifacts contract
$json = @{
  flow = "nba_optimizer"
  status = "success"
  ts = $ts
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

$report = "# NBA Optimizer Run $ts`n`nMetric / Value`nPP legs: $ppLegs`nUD cards: $udCards`nTier1: $t1`nTier2: $t2`nSheets pushed: $sheetsPushed`nTelegram sent: $telegramSent`n`nLogs: artifacts\logs\run_$ts.txt`nMachine: artifacts\last_run.json"
$report | Out-File "artifacts\nba_optimizer_$ts.md" -Encoding utf8

# 5) Archive legs + tier CSVs for future calibration/backfill (date-stamped copies)
try {
  $runDate = $ts.Substring(0,8)  # YYYYMMDD from ts

  $legsArchiveDir = Join-Path $root "data\legs_archive"
  New-Item -ItemType Directory -Force -Path $legsArchiveDir | Out-Null
  if (Test-Path "$ppLegsFile") {
    Copy-Item "$ppLegsFile" (Join-Path $legsArchiveDir ("prizepicks-legs-{0}.csv" -f $runDate)) -Force
  }
  if (Test-Path "$udLegsFile") {
    Copy-Item "$udLegsFile" (Join-Path $legsArchiveDir ("underdog-legs-{0}.csv" -f $runDate)) -Force
  }

  $tierArchiveDir = Join-Path $root "data\tier_archive"
  New-Item -ItemType Directory -Force -Path $tierArchiveDir | Out-Null
  if (Test-Path "$tier1File") {
    Copy-Item "$tier1File" (Join-Path $tierArchiveDir ("tier1-{0}.csv" -f $runDate)) -Force
  }
  if (Test-Path "$tier2File") {
    Copy-Item "$tier2File" (Join-Path $tierArchiveDir ("tier2-{0}.csv" -f $runDate)) -Force
  }
} catch {
  Write-Warning "Archive step failed: $($_.Exception.Message)"
}

Write-Output ('Wrote artifacts\last_run.json (status=success) and artifacts\nba_optimizer_' + $ts + '.md')

# 5b) Automation card matrix export (fail-fast: row count must match canonical structures)
try {
  Write-Output "[AUTOMATION_CARD_MATRIX] Running export..."
  $exportArgs = @("run", "export:automation-card-matrix")
  Invoke-NativeWithLogging -Command "npm" -ArgumentList $exportArgs -LogPath "$logPath" -FailureFilePath "artifacts\logs\automation_card_matrix_$ts.failed.txt" | Out-Null
  Write-Output "[AUTOMATION_CARD_MATRIX] Export completed."
} catch {
  '{"flow":"nba_optimizer","status":"failed","ts":"' + $ts + '","error":"automation_card_matrix"}' | Out-File "artifacts\last_run.json" -Encoding utf8
  $errMsg = $_.Exception.Message
  if ($errMsg -match "Exit code") {
    $failedLog = "artifacts\logs\automation_card_matrix_$ts.failed.txt"
    if (Test-Path $failedLog) {
      $failContent = Get-Content $failedLog -Raw -ErrorAction SilentlyContinue
      Write-Error "[AUTOMATION_CARD_MATRIX] Export failed (exit non-zero). Check log for row-count mismatch or missing source files. Detail: $failContent"
    } else {
      Write-Error "[AUTOMATION_CARD_MATRIX] Export failed (exit non-zero). Possible row-count mismatch or missing source files. See artifacts\logs\run_$ts.txt"
    }
  } else {
    Write-Error "[AUTOMATION_CARD_MATRIX] Export failed (unhandled): $errMsg"
  }
  throw
}

# 6) Validate prop warehouse (non-fatal)
try {
  Write-Output "[VALIDATION] Running prop warehouse quality monitor..."
  $validateArgs = @("ts-node", "scripts/validate_prop_warehouse.ts")
  Invoke-NativeWithLogging -Command "npx" -ArgumentList $validateArgs -LogPath "$logPath" -FailureFilePath "" | Out-Null
  Write-Output "[VALIDATION] Prop warehouse validation completed."
} catch {
  Write-Warning "[VALIDATION] Prop warehouse validation failed (non-fatal): $($_.Exception.Message)"
}

# 7) Auto-deploy dashboard so the site reflects this run's data
try {
  Write-Output "[DEPLOY] Deploying dashboard to IONOS..."
  $deployArgs = @("run", "web:deploy")
  Invoke-NativeWithLogging -Command "npm" -ArgumentList $deployArgs -LogPath "$logPath" | Out-Null
  Write-Output "[DEPLOY] Dashboard deployed successfully."
} catch {
  Write-Warning "[DEPLOY] Dashboard deploy failed (non-fatal): $($_.Exception.Message)"
}

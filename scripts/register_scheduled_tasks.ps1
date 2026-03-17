# register_scheduled_tasks.ps1
# Register automation tasks for DFS optimizer snapshots and results ingestion:
# - DFS-WakePC (02:25 AM) — wake the PC before the first job
# - DFS-Results-0230 (02:30 AM) — results ingestion (box scores + grading)
# - DFS-Opening-0900 (09:00 AM) — opening market snapshot
# - DFS-Midday-1300 (01:00 PM) — midday adjustment snapshot
# - DFS-PreSlate-1730 (05:30 PM) — pre-slate snapshot
# - DFS-Closing-1845 (06:45 PM) — closing line snapshot
# All tasks run as NT AUTHORITY\SYSTEM (no password; runs when no user is logged in).
# Run from project root or scripts folder as Administrator (required for /RU SYSTEM). Paths are resolved; no hardcoding.
#
# Enable wake timers so the PC can wake for the 02:25 task (run once, elevated):
#   powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
#   powercfg /SETACTIVE SCHEME_CURRENT

param([switch]$WhatIf)

$ErrorActionPreference = "Stop"
# When run as .\scripts\register_scheduled_tasks.ps1 from project root, PSScriptRoot = scripts
$projectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$dailyRunPath = Join-Path $projectRoot "scripts\daily-run.ps1"
$trackResultsPath = Join-Path $projectRoot "scripts\track-results.ps1"

Write-Host "Resolved paths (confirm before registering):"
Write-Host "  Project root: $projectRoot"
Write-Host "  daily-run.ps1: $dailyRunPath"
Write-Host "  track-results.ps1: $trackResultsPath"
Write-Host ""

if (-not (Test-Path $dailyRunPath)) { throw "daily-run.ps1 not found at $dailyRunPath" }
if (-not (Test-Path $trackResultsPath)) { throw "track-results.ps1 not found at $trackResultsPath" }

$runAs = "NT AUTHORITY\SYSTEM"

if ($WhatIf) {
    Write-Host "[WhatIf] Would register:"
    Write-Host "  DFS-WakePC        -> 02:25 daily (wake PC)"
    Write-Host "  DFS-Results-0230  -> $trackResultsPath @ 02:30 daily"
    Write-Host "  DFS-Opening-0900  -> $dailyRunPath -bankroll 700 @ 09:00 daily"
    Write-Host "  DFS-Midday-1300   -> $dailyRunPath -bankroll 700 @ 13:00 daily"
    Write-Host "  DFS-PreSlate-1730 -> $dailyRunPath -bankroll 700 @ 17:30 daily"
    Write-Host "  DFS-Closing-1845  -> $dailyRunPath -bankroll 700 @ 18:45 daily"
    Write-Host "  /RU $runAs"
    exit 0
}

Write-Host "Enabling wake timers (power scheme)..."
& powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
& powercfg /SETACTIVE SCHEME_CURRENT

# DFS-WakePC: 5:50 AM daily — wake the PC before the main run (enable wake timers via powercfg; see script header)
Write-Host "Registering DFS-WakePC..."
& schtasks /Create /TN "DFS-WakePC" /TR "cmd /c echo wake" /SC DAILY /ST 02:25 /RU $runAs /F /Z
if ($LASTEXITCODE -ne 0) {
    Write-Warning "DFS-WakePC create returned $LASTEXITCODE."
    exit $LASTEXITCODE
}

# DFS-Results-0230: 2:30 AM daily (results ingestion)
$trResults = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$trackResultsPath`""
Write-Host "Registering DFS-Results-0230..."
& schtasks /Create /TN "DFS-Results-0230" /TR $trResults /SC DAILY /ST 02:30 /RU $runAs /F
if ($LASTEXITCODE -ne 0) {
    Write-Warning "DFS-Results-0230 create returned $LASTEXITCODE."
    exit $LASTEXITCODE
}

# DFS-Opening-0900: 9:00 AM daily (opening market snapshot)
$trDailyOpening = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$dailyRunPath`" -bankroll 700"
Write-Host "Registering DFS-Opening-0900..."
& schtasks /Create /TN "DFS-Opening-0900" /TR $trDailyOpening /SC DAILY /ST 09:00 /RU $runAs /F
if ($LASTEXITCODE -ne 0) {
    Write-Warning "DFS-Opening-0900 create returned $LASTEXITCODE."
    exit $LASTEXITCODE
}

# DFS-Midday-1300: 1:00 PM daily (midday adjustment)
$trDailyMidday = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$dailyRunPath`" -bankroll 700"
Write-Host "Registering DFS-Midday-1300..."
& schtasks /Create /TN "DFS-Midday-1300" /TR $trDailyMidday /SC DAILY /ST 13:00 /RU $runAs /F
if ($LASTEXITCODE -ne 0) {
    Write-Warning "DFS-Midday-1300 create returned $LASTEXITCODE."
    exit $LASTEXITCODE
}

# DFS-PreSlate-1730: 5:30 PM daily (pre-slate snapshot)
$trDailyPreSlate = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$dailyRunPath`" -bankroll 700"
Write-Host "Registering DFS-PreSlate-1730..."
& schtasks /Create /TN "DFS-PreSlate-1730" /TR $trDailyPreSlate /SC DAILY /ST 17:30 /RU $runAs /F
if ($LASTEXITCODE -ne 0) {
    Write-Warning "DFS-PreSlate-1730 create returned $LASTEXITCODE."
    exit $LASTEXITCODE
}

# DFS-Closing-1845: 6:45 PM daily (closing line snapshot)
$trDailyClosing = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$dailyRunPath`" -bankroll 700"
Write-Host "Registering DFS-Closing-1845..."
& schtasks /Create /TN "DFS-Closing-1845" /TR $trDailyClosing /SC DAILY /ST 18:45 /RU $runAs /F
if ($LASTEXITCODE -ne 0) {
    Write-Warning "DFS-Closing-1845 create returned $LASTEXITCODE."
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Verifying..."
& schtasks /Query /TN "DFS-WakePC" /FO LIST
Write-Host ""
& schtasks /Query /TN "DFS-Results-0230" /FO LIST
Write-Host ""
& schtasks /Query /TN "DFS-Opening-0900" /FO LIST
Write-Host ""
& schtasks /Query /TN "DFS-Midday-1300" /FO LIST
Write-Host ""
& schtasks /Query /TN "DFS-PreSlate-1730" /FO LIST
Write-Host ""
& schtasks /Query /TN "DFS-Closing-1845" /FO LIST
Write-Host ""
Write-Host "Done. All snapshot and results tasks should show Status=Ready, Run As User=SYSTEM."

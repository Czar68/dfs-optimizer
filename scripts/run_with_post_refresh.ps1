param(
  [string]$ProjectRoot = "",
  [string]$LogPath = "",
  [string]$MainCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_optimizer.ps1 -Force",
  [switch]$ContinueOnCaptureFailure,
  [switch]$PublishDashboard
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}
Set-Location $ProjectRoot

if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $LogPath = Join-Path $ProjectRoot "data\logs\post_run_model_refresh.log"
}

$logDir = Split-Path -Parent $LogPath
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

function Write-WrapperLog {
  param(
    [string]$Step,
    [string]$Command,
    [int]$ExitCode,
    [string]$Status,
    [string]$Message
  )
  $entry = @{
    timestampUtc = (Get-Date).ToUniversalTime().ToString("o")
    step = $Step
    command = $Command
    exitCode = $ExitCode
    status = $Status
    message = $Message
  } | ConvertTo-Json -Compress
  $entry | Out-File -FilePath $LogPath -Append -Encoding utf8
  Write-Host $entry
}

Write-WrapperLog -Step "combined_wrapper_start" -Command "run_with_post_refresh.ps1" -ExitCode 0 -Status "success" -Message "started"
Write-Host "[combined] main run start"

$ErrorActionPreferenceSave = $ErrorActionPreference
$ErrorActionPreference = "Continue"
powershell -NoProfile -ExecutionPolicy Bypass -Command $MainCommand
$mainExit = $LASTEXITCODE
$ErrorActionPreference = $ErrorActionPreferenceSave

if ($mainExit -ne 0) {
  Write-WrapperLog -Step "main_run" -Command $MainCommand -ExitCode $mainExit -Status "failed" -Message "main run failed; skipping post-run refresh"
  Write-WrapperLog -Step "combined_wrapper_finish" -Command "run_with_post_refresh.ps1" -ExitCode $mainExit -Status "failed" -Message "finished with main failure"
  exit $mainExit
}

Write-WrapperLog -Step "main_run" -Command $MainCommand -ExitCode 0 -Status "success" -Message "main run completed"
Write-Host "[combined] post-run refresh start"

if ($PublishDashboard) {
  $env:DFS_AUTO_PUBLISH_DASHBOARD = "1"
  Write-Host "[combined] DFS_AUTO_PUBLISH_DASHBOARD=1 (publish after post-run)"
}

$postArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $PSScriptRoot "post_run_model_refresh.ps1"),
  "-ProjectRoot", $ProjectRoot,
  "-LogPath", $LogPath
)
if ($ContinueOnCaptureFailure) {
  $postArgs += "-ContinueOnCaptureFailure"
}

$ErrorActionPreference = "Continue"
powershell @postArgs
$postExit = $LASTEXITCODE
$ErrorActionPreference = $ErrorActionPreferenceSave

if ($postExit -ne 0) {
  Write-WrapperLog -Step "combined_wrapper_finish" -Command "run_with_post_refresh.ps1" -ExitCode $postExit -Status "failed" -Message "post-run refresh failed"
  exit $postExit
}

Write-WrapperLog -Step "combined_wrapper_finish" -Command "run_with_post_refresh.ps1" -ExitCode 0 -Status "success" -Message "completed"
exit 0

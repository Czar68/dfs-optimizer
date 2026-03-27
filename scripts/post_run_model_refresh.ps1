param(
  [string]$ProjectRoot = "",
  [string]$LogPath = "",
  [switch]$ContinueOnCaptureFailure
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

function Invoke-Step {
  param(
    [string]$Step,
    [string]$Command
  )
  Write-Host "[post-run] $Step start"
  $ErrorActionPreferenceSave = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  powershell -NoProfile -ExecutionPolicy Bypass -Command $Command
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $ErrorActionPreferenceSave
  if ($exitCode -eq 0) {
    Write-WrapperLog -Step $Step -Command $Command -ExitCode 0 -Status "success" -Message "completed"
    return $true
  }
  Write-WrapperLog -Step $Step -Command $Command -ExitCode $exitCode -Status "failed" -Message "command failed"
  return $false
}

$startedAt = (Get-Date).ToUniversalTime().ToString("o")
Write-WrapperLog -Step "wrapper_start" -Command "post_run_model_refresh.ps1" -ExitCode 0 -Status "success" -Message "startedAt=$startedAt"

$captureOk = Invoke-Step -Step "capture_snapshot" -Command "npm run capture:snapshot"
if (-not $captureOk -and -not $ContinueOnCaptureFailure) {
  $finishedAt = (Get-Date).ToUniversalTime().ToString("o")
  Write-WrapperLog -Step "wrapper_finish" -Command "post_run_model_refresh.ps1" -ExitCode 1 -Status "failed" -Message "finishedAt=$finishedAt capture failed"
  exit 1
}

$refreshOk = Invoke-Step -Step "refresh_model_artifacts" -Command "npm run refresh:model-artifacts"
if (-not $refreshOk) {
  $finishedAt = (Get-Date).ToUniversalTime().ToString("o")
  Write-WrapperLog -Step "wrapper_finish" -Command "post_run_model_refresh.ps1" -ExitCode 1 -Status "failed" -Message "finishedAt=$finishedAt model artifact refresh failed"
  exit 1
}

$validationReportingOk = Invoke-Step -Step "refresh_validation_reporting" -Command "npm run refresh:validation-reporting"
if (-not $validationReportingOk) {
  $finishedAt = (Get-Date).ToUniversalTime().ToString("o")
  Write-WrapperLog -Step "wrapper_finish" -Command "post_run_model_refresh.ps1" -ExitCode 1 -Status "failed" -Message "finishedAt=$finishedAt validation reporting refresh failed"
  exit 1
}

if ($env:DFS_AUTO_PUBLISH_DASHBOARD -eq "1") {
  Write-Host "[post-run] publish_dashboard_live (DFS_AUTO_PUBLISH_DASHBOARD=1)"
  $publishOk = Invoke-Step -Step "publish_dashboard_live" -Command "npm run publish:dashboard-live"
  if (-not $publishOk) {
    $finishedAt = (Get-Date).ToUniversalTime().ToString("o")
    Write-WrapperLog -Step "wrapper_finish" -Command "post_run_model_refresh.ps1" -ExitCode 1 -Status "failed" -Message "finishedAt=$finishedAt publish_dashboard_live failed"
    exit 1
  }
}

$finishedAt = (Get-Date).ToUniversalTime().ToString("o")
Write-WrapperLog -Step "wrapper_finish" -Command "post_run_model_refresh.ps1" -ExitCode 0 -Status "success" -Message "finishedAt=$finishedAt"
exit 0

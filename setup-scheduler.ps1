# setup-scheduler.ps1
# Setup Windows Task Scheduler for daily NBA pipeline
# Usage: .\setup-scheduler.ps1 [-Time "18:00"] [-Sport NBA]

param(
    [Parameter(Mandatory=$false)]
    [string]$Time = "18:00",  # 6 PM default
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("NBA", "NCAAB", "All")]
    [string]$Sport = "NBA"
)

function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath = Join-Path $ScriptDir "run-nba.ps1"

if (-not (Test-Path $ScriptPath)) {
    Write-Error "run-nba.ps1 not found at $ScriptPath"
    exit 1
}

Write-Info "=========================================="
Write-Info "Task Scheduler Setup - NBA Daily Pipeline"
Write-Info "=========================================="
Write-Info "Time: $Time"
Write-Info "Sport: $Sport"
Write-Info ""

# Create scheduled task
$TaskName = "NBA Props Optimizer Daily"
$TaskDescription = "Runs NBA props optimizer pipeline daily at $Time"

# PowerShell command to run
$PowerShellCmd = "powershell.exe"
$ScriptArgs = "-ExecutionPolicy Bypass -File `"$ScriptPath`" -Sport $Sport"

$Action = New-ScheduledTaskAction -Execute $PowerShellCmd -Argument $ScriptArgs -WorkingDirectory $ScriptDir
$Trigger = New-ScheduledTaskTrigger -Daily -At $Time
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

try {
    # Remove existing task if present
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Warning "Removing existing task: $TaskName"
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    
    # Register new task
    Register-ScheduledTask -TaskName $TaskName -Description $TaskDescription -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal | Out-Null
    
    Write-Success "✅ Task scheduled successfully!"
    Write-Info ""
    Write-Info "Task Details:"
    Write-Info "  Name: $TaskName"
    Write-Info "  Schedule: Daily at $Time"
    Write-Info "  Command: $PowerShellCmd $ScriptArgs"
    Write-Info ""
    Write-Info "To verify:"
    Write-Info "  Get-ScheduledTask -TaskName '$TaskName'"
    Write-Info ""
    Write-Info "To run manually:"
    Write-Info "  Start-ScheduledTask -TaskName '$TaskName'"
    Write-Info ""
    Write-Info "To delete:"
    Write-Info "  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
    
} catch {
    Write-Error "❌ Failed to create scheduled task: $_"
    Write-Info ""
    Write-Info "Try running PowerShell as Administrator, or create task manually:"
    Write-Info "  Task Scheduler → Create Task → General: Run whether user is logged on"
    Write-Info "  Triggers: Daily at $Time"
    Write-Info "  Actions: Start program: powershell.exe"
    Write-Info "  Arguments: -ExecutionPolicy Bypass -File `"$ScriptPath`" -Sport $Sport"
    exit 1
}

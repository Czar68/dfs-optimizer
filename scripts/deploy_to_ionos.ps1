# Deploy to IONOS webspace via SFTP
# This script exports dashboard data, builds the React app, and uploads to IONOS

param(
    [switch]$Force
)

Write-Host "=== Deploying to IONOS ===" -ForegroundColor Green

# Function to read .env file
function Read-EnvFile {
    param(
        [string]$EnvPath
    )
    
    $envVars = @{}
    
    if (Test-Path $EnvPath) {
        Write-Host "Reading .env file from: $EnvPath" -ForegroundColor Cyan
        Get-Content $EnvPath | ForEach-Object {
            # Skip comments and empty lines
            if ($_ -match '^\s*#' -or $_ -match '^\s*$') {
                return
            }
            
            # Parse KEY=VALUE format
            if ($_ -match '^\s*([^=]+)=(.*)$') {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                $envVars[$key] = $value
            }
        }
    } else {
        Write-Host "Warning: .env file not found at $EnvPath" -ForegroundColor Yellow
    }
    
    return $envVars
}

# Read .env file
$envPath = "C:\Dev\Projects\dfs-optimizer\.env"
$envVars = Read-EnvFile -EnvPath $envPath

# Print found keys for confirmation
Write-Host "`n=== Found .env keys for IONOS SFTP ===" -ForegroundColor Cyan
$ionosKeys = $envVars.Keys | Where-Object { $_ -match 'SFTP|FTP|DOMAIN' -and $_ -notmatch 'KEY' }
foreach ($key in $ionosKeys) {
    $value = if ($envVars[$key]) { "[SET]" } else { "[EMPTY]" }
    Write-Host "  $key = $value" -ForegroundColor White
}
Write-Host "=====================================`n" -ForegroundColor Cyan

# Extract SFTP credentials from .env
$SFTP_HOST = $envVars["SFTP_SERVER"]  # Using SFTP_SERVER as found in the .env
$SFTP_USERNAME = $envVars["FTP_USERNAME"]
$SFTP_PASSWORD = $envVars["FTP_PASSWORD"]
$LIVE_DOMAIN = $envVars["LIVE_DOMAIN"]
$REMOTE_PATH = $envVars["SFTP_PATH"]  # Use SFTP_PATH from .env if available

# Default remote path if not specified
if (-not $REMOTE_PATH) {
    $REMOTE_PATH = "/"
}

# Validate required credentials
$missingCreds = @()
if (-not $SFTP_HOST) { $missingCreds += "SFTP_SERVER" }
if (-not $SFTP_USERNAME) { $missingCreds += "FTP_USERNAME" }
if (-not $SFTP_PASSWORD) { $missingCreds += "FTP_PASSWORD" }

if ($missingCreds.Count -gt 0) {
    Write-Host "✗ Missing required SFTP credentials in .env file:" -ForegroundColor Red
    foreach ($cred in $missingCreds) {
        Write-Host "  - $cred" -ForegroundColor Red
    }
    Write-Host "Please update your .env file with the required IONOS SFTP credentials." -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ SFTP credentials loaded from .env file" -ForegroundColor Green
Write-Host "  Host: $SFTP_HOST" -ForegroundColor Gray
Write-Host "  Username: $SFTP_USERNAME" -ForegroundColor Gray
Write-Host "  Remote Path: $REMOTE_PATH" -ForegroundColor Gray
Write-Host "  Domain: $LIVE_DOMAIN" -ForegroundColor Gray

# Step 1: Export dashboard data
Write-Host "Step 1: Exporting dashboard data..." -ForegroundColor Yellow
Set-Location "C:\Dev\Projects\dfs-optimizer"
try {
    npm run export:dashboard
    if ($LASTEXITCODE -ne 0) {
        throw "npm run export:dashboard failed with exit code $LASTEXITCODE"
    }
    Write-Host "✓ Dashboard data exported successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to export dashboard data: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Build React app
Write-Host "Step 2: Building React app..." -ForegroundColor Yellow
Set-Location "web-dashboard"
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed with exit code $LASTEXITCODE"
    }
    Write-Host "✓ React app built successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to build React app: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Upload to IONOS via WinSCP
Write-Host "Step 3: Uploading to IONOS via SFTP..." -ForegroundColor Yellow

$LOCAL_DIST_PATH = "C:\Dev\Projects\dfs-optimizer\web-dashboard\dist"

# Check if dist directory exists
if (-not (Test-Path $LOCAL_DIST_PATH)) {
    Write-Host "✗ Dist directory not found at $LOCAL_DIST_PATH" -ForegroundColor Red
    exit 1
}

# WinSCP script content using credentials from .env
$winscpScript = @"
open sftp://$SFTP_USERNAME`:$SFTP_PASSWORD@$SFTP_HOST/
option batch abort
option confirm off
cd "$REMOTE_PATH"
put "$LOCAL_DIST_PATH\*" ./
exit
"@

try {
    # Save WinSCP script to temp file
    $scriptPath = [System.IO.Path]::GetTempFileName()
    $winscpScript | Out-File -FilePath $scriptPath -Encoding UTF8
    
    # Run WinSCP
    $winscpPath = "C:\Program Files (x86)\WinSCP\WinSCP.com"
    if (-not (Test-Path $winscpPath)) {
        $winscpPath = "C:\Program Files\WinSCP\WinSCP.com"
    }
    
    if (-not (Test-Path $winscpPath)) {
        throw "WinSCP not found. Please install WinSCP or update the path in this script."
    }
    
    $process = Start-Process -FilePath $winscpPath -ArgumentList "/script=`"$scriptPath`"" -Wait -PassThru -NoNewWindow
    
    if ($process.ExitCode -ne 0) {
        throw "WinSCP upload failed with exit code $($process.ExitCode)"
    }
    
    Write-Host "✓ Files uploaded successfully to IONOS" -ForegroundColor Green
    
    # Clean up temp script file
    Remove-Item $scriptPath -Force
    
} catch {
    Write-Host "✗ Failed to upload to IONOS: $_" -ForegroundColor Red
    
    # Clean up temp script file if it exists
    if (Test-Path $scriptPath) {
        Remove-Item $scriptPath -Force
    }
    
    exit 1
}

Write-Host "=== Deployment completed successfully! ===" -ForegroundColor Green
if ($LIVE_DOMAIN) {
    Write-Host "Your dashboard is now live at: https://$LIVE_DOMAIN" -ForegroundColor Cyan
} else {
    Write-Host "Your dashboard has been uploaded to IONOS" -ForegroundColor Cyan
}

# Deploy Static Dashboard to IONOS

Write-Host "=== DEPLOYING STATIC DASHBOARD ===" -ForegroundColor Green

# Configuration
$SFTP_SERVER = if ($env:SFTP_SERVER) { $env:SFTP_SERVER } else { "access-5019362808.webspace-host.com" }
$SFTP_USER = if ($env:FTP_USERNAME) { $env:FTP_USERNAME } else { "a901580" }
$SFTP_PASS = $env:FTP_PASSWORD
$REMOTE_PATH = "/dfs/"

if (-not $SFTP_PASS) {
    Write-Host "❌ FTP_PASSWORD not set. Please set environment variable:" -ForegroundColor Red
    Write-Host "   `$env:FTP_PASSWORD = 'your-password'" -ForegroundColor Yellow
    exit 1
}

# Local files to deploy
$DIST_DIR = "C:\Dev\Projects\dfs-optimizer\web-dashboard\dist"
$INDEX_FILE = "$DIST_DIR\index.html"
$DATA_DIR = "$DIST_DIR\data"

if (-not (Test-Path $INDEX_FILE)) {
    Write-Host "❌ Static dashboard not found at $INDEX_FILE" -ForegroundColor Red
    Write-Host "   Ensure the static dashboard is in web-dashboard\dist\index.html" -ForegroundColor Yellow
    exit 1
}

# Use WinSCP for SFTP deployment
$WINSCP_PATH = "C:\Program Files (x86)\WinSCP\WinSCP.exe"
if (-not (Test-Path $WINSCP_PATH)) {
    Write-Host "❌ WinSCP not found at $WINSCP_PATH" -ForegroundColor Red
    Write-Host "   Please install WinSCP or use manual SFTP" -ForegroundColor Yellow
    exit 1
}

try {
    Write-Host "📁 Preparing deployment files..." -ForegroundColor Cyan
    
    # Verify static dashboard content
    $content = Get-Content $INDEX_FILE -Raw
    if ($content -match "SlipStrength.*DFS Optimizer Dashboard") {
        Write-Host "✅ Static dashboard confirmed" -ForegroundColor Green
    } else {
        Write-Host "❌ Static dashboard content not detected" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "🚀 Deploying to IONOS..." -ForegroundColor Cyan
    Write-Host "   Server: $SFTP_SERVER" -ForegroundColor White
    Write-Host "   Path: $REMOTE_PATH" -ForegroundColor White
    Write-Host "   User: $SFTP_USER" -ForegroundColor White
    
    # Create WinSCP script
    $SCRIPT_PATH = "$env:TEMP\winscp_deploy.txt"
    $script = @"
open sftp://$SFTP_USER`:$SFTP_PASS@$SFTP_SERVER/
cd $REMOTE_PATH
put "$INDEX_FILE" index.html
put "$DATA_DIR\*" data/
exit
"@
    
    $script | Out-File -FilePath $SCRIPT_PATH -Encoding ASCII
    
    # Execute WinSCP
    $args = "/script=`"$SCRIPT_PATH`""
    $process = Start-Process -FilePath $WINSCP_PATH -ArgumentList $args -Wait -PassThru
    
    if ($process.ExitCode -eq 0) {
        Write-Host "✅ Static dashboard deployed successfully!" -ForegroundColor Green
        Write-Host "🌐 URL: https://dfs.gamesmoviesmusic.com" -ForegroundColor Cyan
        Write-Host "📋 Dashboard features:" -ForegroundColor White
        Write-Host "   • Real-time card loading" -ForegroundColor Gray
        Write-Host "   • Platform filtering (PP/UD/Both)" -ForegroundColor Gray
        Write-Host "   • EV% sorting" -ForegroundColor Gray
        Write-Host "   • Copy slip functionality" -ForegroundColor Gray
        Write-Host "   • Auto-refresh every 5 minutes" -ForegroundColor Gray
    } else {
        Write-Host "❌ Deployment failed with exit code $($process.ExitCode)" -ForegroundColor Red
        exit $process.ExitCode
    }
    
    # Cleanup
    Remove-Item $SCRIPT_PATH -ErrorAction SilentlyContinue
    
} catch {
    Write-Host "❌ Deployment error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== DEPLOYMENT COMPLETE ===" -ForegroundColor Green

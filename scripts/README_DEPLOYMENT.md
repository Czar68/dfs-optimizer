# IONOS Deployment Scripts

## Overview

These PowerShell scripts automate the process of running the optimizer and deploying the dashboard to IONOS webspace.

## Scripts

### 1. `deploy_to_ionos.ps1`

Standalone deployment script that:
1. Exports dashboard data (`npm run export:dashboard`)
2. Builds the React app (`npm run build`)
3. Uploads files to IONOS via WinSCP SFTP

**Usage:**
```powershell
# Normal deployment
.\scripts\deploy_to_ionos.ps1

# Force deployment (bypasses some checks)
.\scripts\deploy_to_ionos.ps1 -Force
```

### 2. `run_and_deploy.ps1`

Combined script that:
1. Runs the optimizer (`npm run generate:production`)
2. Calls `deploy_to_ionos.ps1`

**Usage:**
```powershell
# Normal run and deploy
.\scripts\run_and_deploy.ps1

# Force deployment
.\scripts\run_and_deploy.ps1 -Force

# No pause at end (good for automation)
.\scripts\run_and_deploy.ps1 -NoPause
```

## Setup Requirements

### 1. Install WinSCP
- Download from: https://winscp.net/eng/download.php
- Install to default location (C:\Program Files (x86)\WinSCP\)

### 2. Configure IONOS Credentials

The deployment script automatically reads SFTP credentials from your `.env` file. Ensure your `.env` file contains these required keys:

```bash
# Required for IONOS deployment
SFTP_SERVER=access-5019362808.webspace-host.com
FTP_USERNAME=a901580
FTP_PASSWORD=your-password
SFTP_PATH=/dfs
LIVE_DOMAIN=dfs.gamesmoviesmusic.com  # Optional - for success message
```

**Key Names Used by Deploy Script:**
- `SFTP_SERVER` - IONOS SFTP hostname
- `FTP_USERNAME` - SFTP username  
- `FTP_PASSWORD` - SFTP password
- `SFTP_PATH` - Remote directory path (defaults to `/` if not set)
- `LIVE_DOMAIN` - Your live domain (optional, for success message)

The script will display all found IONOS-related keys from your `.env` file before deploying, so you can confirm the correct values are being used.

### 3. Test WinSCP Connection

Test your SFTP connection manually with WinSCP before running the scripts:
1. Open WinSCP
2. Create new session with your IONOS SFTP credentials
3. Connect and verify you can access the target directory
4. Note the exact remote path for the script

## Windows Task Scheduler Setup

For automated runs, set up Windows Task Scheduler to run `run_and_deploy.ps1`:

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger (e.g., daily at specific time)
4. Action: "Start a program"
   - Program: `powershell.exe`
   - Arguments: `-NoProfile -ExecutionPolicy Bypass -File "C:\Dev\Projects\dfs-optimizer\scripts\run_and_deploy.ps1" -NoPause`
   - Start in: `C:\Dev\Projects\dfs-optimizer`

## Security Notes

- Store SFTP credentials securely
- Consider using SSH key authentication instead of passwords
- The scripts run with your user permissions
- Test thoroughly before scheduling automated runs

## Troubleshooting

### Common Issues

1. **WinSCP not found**: Install WinSCP to default location or update path in script
2. **SFTP connection failed**: Verify credentials and network connectivity
3. **Build fails**: Check Node.js and npm are properly installed
4. **Permission denied**: Ensure write permissions on remote directory

### Debug Mode

Run scripts with `-Force` parameter to bypass some safety checks during debugging.

### Logs

Both scripts provide detailed console output showing:
- Step-by-step progress
- Success/failure status
- Timing information
- Error messages with stack traces

## File Structure

```
scripts/
├── deploy_to_ionos.ps1          # Deployment only
├── run_and_deploy.ps1           # Run optimizer + deploy
└── README_DEPLOYMENT.md         # This documentation
```

@echo off
echo Setting up Windows Task Scheduler for Props Optimizer...

REM Get current directory
set SCRIPT_DIR=%~dp0
set BATCH_FILE=%SCRIPT_DIR%daily-all-sports.bat

REM Create scheduled task to run daily at 6pm
schtasks /create /tn "Props Optimizer Daily" /tr "%BATCH_FILE%" /sc daily /st 18:00 /f

echo.
echo ✅ Task scheduled successfully!
echo.
echo Task Details:
echo - Name: Props Optimizer Daily  
echo - Schedule: Daily at 6:00 PM
echo - Action: Run %BATCH_FILE%
echo.
echo To verify: Open Task Scheduler and look for "Props Optimizer Daily"
echo To run manually: schtasks /run /tn "Props Optimizer Daily"
echo To delete: schtasks /delete /tn "Props Optimizer Daily" /f
echo.
pause

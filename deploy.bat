@echo off
setlocal
cd /d "%~dp0"
echo.
echo ============================================================
echo   DFS OPTIMIZER - IONOS PRODUCTION DEPLOY BUILDER
echo ============================================================
echo.

:: Step 1: Install dependencies
echo [1/5] Installing Node dependencies...
call npm ci
if errorlevel 1 (
    echo FAILED: npm ci
    goto :fail
)

:: Step 2: Run production optimizer (fetch odds, build cards, push sheets)
echo.
echo [2/5] Running production optimizer...
call npm run generate:production
if errorlevel 1 (
    echo FAILED: generate:production
    goto :fail
)

:: Step 3: Build optimizer TypeScript
echo.
echo [3/5] Building optimizer TypeScript...
call npm run build
if errorlevel 1 (
    echo WARNING: tsc build failed (non-critical for IONOS if using ts-node)
)

:: Step 4: Build web dashboard
echo.
echo [4/5] Building web dashboard...
cd web-dashboard
call npm ci
call npm run build
if errorlevel 1 (
    echo FAILED: web-dashboard build
    cd ..
    goto :fail
)
cd ..

:: Step 5: Stage files into ionos-deploy/
echo.
echo [5/5] Staging deploy package...

:: Dashboard build output -> ionos-deploy root
if exist "web-dashboard\dist" (
    xcopy /E /Y /Q "web-dashboard\dist\*" "ionos-deploy\" >nul
    echo   Copied dashboard build to ionos-deploy/
) else (
    echo   WARNING: web-dashboard/dist not found - dashboard not staged
)

:: Python sheets pushers
for %%f in (
    sheets_setup_9tab.py
    sheets_push_cards.py
    sheets_push_legs.py
    sheets_push_underdog_legs.py
    sheets_push_underdog_cards.py
    sheets_push.py
    fix_sheets_formulas.py
) do (
    if exist "%%f" (
        copy /Y "%%f" "ionos-deploy\%%f" >nul
    )
)
echo   Copied Python sheets pushers

:: Optimizer runtime files
copy /Y package.json "ionos-deploy\package.json" >nul
copy /Y package-lock.json "ionos-deploy\package-lock.json" >nul 2>nul
echo   Copied package.json

:: Secrets (credentials + token for Google Sheets)
if exist credentials.json (
    copy /Y credentials.json "ionos-deploy\credentials.json" >nul
    echo   Copied credentials.json
)
if exist token.json (
    copy /Y token.json "ionos-deploy\token.json" >nul
    echo   Copied token.json
)

:: Scripts + config
if exist "scripts" (
    xcopy /E /Y /Q "scripts\*" "ionos-deploy\scripts\" >nul
    echo   Copied scripts/
)
if exist "config" (
    xcopy /E /Y /Q "config\*" "ionos-deploy\config\" >nul
    echo   Copied config/
)

:: .env
if exist .env (
    copy /Y .env "ionos-deploy\.env" >nul
    echo   Copied .env
)

echo.
echo ============================================================
echo   IONOS DEPLOY PACKAGE READY: ionos-deploy\
echo ============================================================
echo.
echo Files staged:
dir /B ionos-deploy\
echo.

:: Create ZIP for IONOS (folder upload = 0 bytes; ZIP bypass)
echo [ZIP] Creating ionos-deploy.zip (all files + dist/scripts/)...
powershell -NoProfile -Command "Compress-Archive -Path 'ionos-deploy\*' -DestinationPath 'ionos-deploy.zip' -Force"
if errorlevel 1 (
    echo WARNING: ZIP creation failed. Upload ionos-deploy\ contents manually.
) else (
    echo   Created ionos-deploy.zip
    for %%A in (ionos-deploy.zip) do echo   Size: %%~zA bytes
    echo [ZIP] Verifying contents (expand test)...
    powershell -NoProfile -Command "Expand-Archive -Path 'ionos-deploy.zip' -DestinationPath 'test-unzip' -Force; if (Test-Path 'test-unzip\index.html') { Write-Host '  OK index.html' }; if (Test-Path 'test-unzip\assets') { Write-Host '  OK assets/' }; if (Test-Path 'test-unzip\scripts') { Write-Host '  OK scripts/' }; if (Test-Path 'test-unzip\cron-generate.py') { Write-Host '  OK cron-generate.py' }; Remove-Item -Recurse -Force 'test-unzip' -ErrorAction SilentlyContinue"
)
echo.
echo ============================================================
echo   ZIP READY - IONOS MANUAL STEPS
echo ============================================================
echo.
echo 1. IONOS File Management -^> htdocs/ (document root)
echo    https://my.ionos.com/webhosting/b300099b-8c82-46cc-9e4b-250f6f70609b
echo.
echo 2. UPLOAD ionos-deploy.zip to htdocs/
echo.
echo 3. Right-click ionos-deploy.zip -^> Extract Here
echo    (You should see 20+ files + dist/scripts/)
echo.
echo 4. Delete ionos-deploy.zip on server (optional)
echo.
echo 5. Cron Job (IONOS Cron Jobs):
echo    0 6,7,11,12,16,17,22,23 * * * cd /homepages/htdocs ^&^& python3 cron-generate.py ^>^> cron.log 2^>^&1
echo.
echo 6. .htpasswd (if needed): htpasswd -cb .htpasswd dfs-opt YourPassword
echo.
echo 7. TEST: https://gamesmoviesmusic.com (user: dfs-opt / password)
echo.
echo See ionos-deploy\MANUAL.md for full steps. Run verify.py on server to check.
echo.
goto :end

:fail
echo.
echo *** DEPLOY BUILD FAILED ***
echo.

:end
pause
endlocal

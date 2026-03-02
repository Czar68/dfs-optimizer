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
echo === NEXT STEPS ===
echo.
echo 1. Generate .htpasswd:
echo    htpasswd -cb ionos-deploy\.htpasswd dfs-opt YourPassword123
echo.
echo 2. IONOS WebHosting panel:
echo    https://my.ionos.com/webhosting/b300099b-8c82-46cc-9e4b-250f6f70609b
echo.
echo 3. File Management: Upload ionos-deploy/ contents to document root (/)
echo.
echo 4. Cron Job (IONOS panel):
echo    */30 * * * *  cd /homepages/htdocs ^&^& python3 cron-generate.py ^>^> cron.log 2^>^&1
echo.
echo 5. Visit: https://gamesmoviesmusic.com (login with .htpasswd credentials)
echo.
goto :end

:fail
echo.
echo *** DEPLOY BUILD FAILED ***
echo.

:end
pause
endlocal

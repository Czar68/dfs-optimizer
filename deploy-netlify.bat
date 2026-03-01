@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Change to repo root (this script should already be run from root)
cd /d "%~dp0"

echo ==================================================
echo Building web-dashboard for static Netlify deploy...
echo ==================================================

cd web-dashboard
npm run build
IF ERRORLEVEL 1 (
  echo.
  echo Build failed. See errors above.
  echo.
  pause
  exit /b 1
)

cd ..

echo.
echo Build complete.
echo.
echo Next steps:
echo   1. Open your browser to: https://netlify.com/drop
set DIST_PATH=%CD%\web-dashboard\dist

if exist "%DIST_PATH%" (
  echo   2. In Explorer, open:
  echo        %DIST_PATH%
  echo   3. Drag the ENTIRE "dist" folder into the Netlify Drop page.
) else (
  echo   2. Could not find web-dashboard\dist folder.
  echo      Make sure the build succeeded and try again.
)

echo.
echo Netlify will give you an instant live URL like:
echo    https://nba-props.netlify.app  (or similar)
echo.
pause

endlocal

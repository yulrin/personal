@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

echo Starting Knit Hamster Electron...
echo App folder: %APP_DIR%
echo.

if exist "%APP_DIR%node_modules\.bin\electron.cmd" (
  echo Found local Electron command.
  call "%APP_DIR%node_modules\.bin\electron.cmd" "%APP_DIR%"
  goto done
)

if exist "%APP_DIR%node_modules\electron\dist\electron.exe" (
  echo Found local electron.exe.
  "%APP_DIR%node_modules\electron\dist\electron.exe" "%APP_DIR%"
  goto done
)

where electron >nul 2>nul
if %errorlevel%==0 (
  echo Found Electron on PATH.
  electron "%APP_DIR%"
  goto done
)

where npx >nul 2>nul
if %errorlevel%==0 (
  echo Found npx. Trying npx electron.
  npx electron "%APP_DIR%"
  goto done
)

echo Electron was not found.
echo.
echo Try one of these:
echo 1. Open this folder in a terminal and run: npm install
echo 2. Then run this file again.
echo 3. Or run: npm start
echo.
echo If npm is also not found, Node.js/npm is not on PATH.

:done
echo.
echo Exit code: %errorlevel%
pause

@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto missing_node

where npm >nul 2>nul
if errorlevel 1 goto missing_npm

if not exist "node_modules\vite\bin\vite.js" goto install_dependencies
goto start_server

:install_dependencies
echo Installing project dependencies...
call npm install
if errorlevel 1 goto install_failed

:start_server
echo Starting RIFT MAIDEN...
call npm run dev -- --open
if errorlevel 1 goto startup_failed
exit /b 0

:missing_node
echo Node.js is required. Install Node.js LTS, then run this file again.
goto failed

:missing_npm
echo npm was not found. Reinstall Node.js LTS and ensure npm is on PATH.
goto failed

:install_failed
echo Dependency installation failed.
goto failed

:startup_failed
echo RIFT MAIDEN could not start. Check the error above.

:failed
pause
exit /b 1

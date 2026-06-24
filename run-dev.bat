@echo off
setlocal

if not "%~1"=="" set "PORT=%~1"

if not exist "%~dp0backend\package.json" (
  echo Backend package.json was not found.
  exit /b 1
)

if not exist "%~dp0frontend\package.json" (
  echo Frontend package.json was not found.
  exit /b 1
)

start "Agrisell Backend" /D "%~dp0backend" cmd.exe /k "npm.cmd run dev"
start "Agrisell Frontend" /D "%~dp0frontend" cmd.exe /k "npm.cmd run dev"

echo Started the Agrisell backend and frontend in separate terminals.
endlocal

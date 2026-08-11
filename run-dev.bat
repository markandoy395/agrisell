@echo off
setlocal

set "BACKEND_PORT=3001"
set "FRONTEND_PORT=5173"

set "BACKEND_ENV=%~dp0backend\.env.local"
set "AGRISELL_BACKEND_ENV=%BACKEND_ENV%"

if not exist "%~dp0backend\package.json" (
  echo Backend package.json was not found.
  exit /b 1
)

if not exist "%~dp0frontend\package.json" (
  echo Frontend package.json was not found.
  exit /b 1
)

if "%~1"=="" if exist "%BACKEND_ENV%" (
  for /f "tokens=1,* delims==" %%A in ('findstr /R /C:"^PORT=" "%BACKEND_ENV%"') do set "BACKEND_PORT=%%B"
)

if not "%~1"=="" set "BACKEND_PORT=%~1"
set "PORT=%BACKEND_PORT%"

if not exist "%BACKEND_ENV%" (
  echo Backend login config was not found.
  echo Creating backend\.env.local for local development.
  echo.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$envPath = $env:AGRISELL_BACKEND_ENV; $email = Read-Host 'Admin email'; $securePassword = Read-Host 'Admin password' -AsSecureString; $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword); try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }; $secretBytes = New-Object byte[] 32; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); try { $rng.GetBytes($secretBytes) } finally { $rng.Dispose() }; $secret = [Convert]::ToBase64String($secretBytes); $origins = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174'; @('ADMIN_EMAIL=' + $email, 'ADMIN_PASSWORD=' + $password, 'ADMIN_SESSION_SECRET=' + $secret, 'ALLOWED_ORIGINS=' + $origins, 'ALLOW_LOCAL_VITE_ORIGINS=true', 'ADMIN_SESSION_TTL_SECONDS=28800', 'SESSION_COOKIE_SAMESITE=Strict', 'PORT=%BACKEND_PORT%') | Set-Content -LiteralPath $envPath -Encoding utf8"
  if errorlevel 1 (
    echo Failed to create backend\.env.local.
    exit /b 1
  )
  echo.
  echo Created backend\.env.local. Use the same email and password on the login page.
  echo.
)

echo Stopping processes listening on ports %BACKEND_PORT% and %FRONTEND_PORT%...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(%BACKEND_PORT%, %FRONTEND_PORT%); $processIds = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort } | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($processId in $processIds) { $process = Get-Process -Id $processId -ErrorAction SilentlyContinue; if ($process) { Write-Host ('Stopping ' + $process.ProcessName + ' (PID ' + $processId + ')'); Stop-Process -Id $processId -Force } }"

start "Agrisell Backend" /D "%~dp0backend" cmd.exe /k "set PORT=%BACKEND_PORT% && npm.cmd run dev"
start "Agrisell Frontend" /D "%~dp0frontend" cmd.exe /k "npm.cmd run dev -- --port %FRONTEND_PORT%"

echo Started the Agrisell backend on port %BACKEND_PORT% and frontend on port %FRONTEND_PORT%.
endlocal

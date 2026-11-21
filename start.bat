@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" (
  if exist "%~dp0server\.env" (
    set "MODE=online"
  ) else (
    set "MODE=local"
  )
)
if /I "%MODE%"=="help" goto usage
if /I "%MODE%"=="--help" goto usage
if /I "%MODE%"=="online" goto mode_ok
if /I "%MODE%"=="local" goto mode_ok

echo [WebChat] Unknown mode: %MODE%
goto usage_error

:mode_ok
where node >nul 2>nul
if errorlevel 1 (
  echo [WebChat] Node.js was not found. Install Node.js 24 or newer.
  pause
  exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo [WebChat] pnpm was not found. Install pnpm first.
  pause
  exit /b 1
)

set "BACKEND_RUNNING="
set "FRONTEND_RUNNING="
netstat -ano | findstr ":8787 " | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 set "BACKEND_RUNNING=1"
netstat -ano | findstr ":8090 " | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 set "FRONTEND_RUNNING=1"

if /I "%MODE%"=="local" (
  if defined FRONTEND_RUNNING (
    echo [WebChat] The local frontend is already running. Opening http://localhost:8090
    start "" "http://localhost:8090"
    exit /b 0
  )
  call :install_frontend
  if errorlevel 1 exit /b 1
  echo [WebChat] Starting the local frontend...
  start "WebChat local frontend" /D "%~dp0." cmd /k pnpm dev
  call :open_browser
  exit /b 0
)

if defined BACKEND_RUNNING (
  if defined FRONTEND_RUNNING (
    echo [WebChat] Backend and online frontend are already running. Opening http://localhost:8090
    start "" "http://localhost:8090"
    exit /b 0
  )
)

if not defined BACKEND_RUNNING (
  if not exist "%~dp0server\.env" (
    echo [WebChat] server\.env was not found.
    echo Copy server\.env.example to server\.env and fill in DEEPSEEK_API_KEY and APP_PASSWORD_HASH.
    pause
    exit /b 1
  )
  if not exist "%~dp0server\node_modules" (
    echo [WebChat] Installing backend dependencies...
    pushd "%~dp0server"
    call pnpm install
    if errorlevel 1 (
      popd
      echo [WebChat] Backend dependency installation failed.
      pause
      exit /b 1
    )
    popd
  )
  echo [WebChat] Starting the backend...
  start "WebChat backend" /D "%~dp0server" cmd /k pnpm dev
)

if not defined FRONTEND_RUNNING (
  call :install_frontend
  if errorlevel 1 exit /b 1
  echo [WebChat] Starting the online frontend...
  start "WebChat online frontend" /D "%~dp0." cmd /k pnpm dev:online
)

call :open_browser
exit /b 0

:install_frontend
if exist "%~dp0node_modules" exit /b 0
echo [WebChat] Installing frontend dependencies...
pushd "%~dp0."
call pnpm install
if errorlevel 1 (
  popd
  echo [WebChat] Frontend dependency installation failed.
  pause
  exit /b 1
)
popd
exit /b 0

:open_browser
echo [WebChat] Opening http://localhost:8090
timeout /t 3 /nobreak >nul
start "" "http://localhost:8090"
exit /b 0

:usage
echo Usage: start.bat [online^|local]
echo.
echo   (none)  Online when server\.env exists, otherwise local
echo   online  Start the backend and online frontend
echo   local   Start the local static frontend only
echo.
echo Examples:
echo   start.bat
echo   start.bat local
exit /b 0

:usage_error
echo.
echo Usage: start.bat [online^|local]
pause
exit /b 1

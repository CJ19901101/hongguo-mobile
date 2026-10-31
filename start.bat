@echo off
rem Start hongguo-mobile server (ASCII only to avoid codepage issues)
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ---- locate node: PATH first, then common install dirs ----
set "NODE="
for /f "delims=" %%i in ('where node 2^>nul') do (
  if not defined NODE set "NODE=%%i"
)
if defined NODE goto have_node

call :try "%ProgramFiles%\nodejs\node.exe"
call :try "%ProgramFiles(x86)%\nodejs\node.exe"
call :try "%LOCALAPPDATA%\Programs\nodejs\node.exe"
for /f "delims=" %%v in ('dir /b /ad /o-n "%USERPROFILE%\.workbuddy\binaries\node\versions" 2^>nul') do (
  if not defined NODE call :try "%USERPROFILE%\.workbuddy\binaries\node\versions\%%v\node.exe"
)
if not defined NODE goto no_node

:have_node
echo [INFO] node: %NODE%
echo.
echo Hongguo Mobile starting on port 8787 ...
echo Open http://localhost:8787 on this PC,
echo or the address printed below on your phone (same Wi-Fi).
echo.
echo Close this window to stop the server.
echo.
"%NODE%" server\index.js
echo.
echo [EXIT] server stopped. If it failed, send the lines above for help.
pause
exit /b 1

:no_node
echo [ERROR] node.js not found on this computer.
echo Install the LTS version with default options, then reopen:
echo   https://nodejs.org/
pause
exit /b 1

:try
if defined NODE goto :eof
if exist %1 set "NODE=%~1"
goto :eof

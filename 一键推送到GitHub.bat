@echo off
rem Push this project to GitHub, so the cloud macOS runner can build the IPA.
rem ASCII only on purpose: cmd.exe misparses GBK/UTF-8 text inside ( ) blocks.
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "REMOTE_URL=https://github.com/CJ19901101/hongguo-mobile.git"

echo ============================================================
echo   Step 1 of 2: push code to GitHub
echo   (the cloud macOS runner then compiles the unsigned IPA)
echo ============================================================
echo.

rem ---- 1. locate git: PATH first, then common install dirs ----
set "GIT="
for /f "delims=" %%i in ('where git 2^>nul') do (
  if not defined GIT set "GIT=%%i"
)
if defined GIT goto have_git

call :try "%ProgramFiles%\Git\cmd\git.exe"
call :try "%ProgramFiles(x86)%\Git\cmd\git.exe"
call :try "%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
for %%d in (C D E F G) do (
  call :try "%%d:\Program Files\Git\cmd\git.exe"
  call :try "%%d:\Program Files (x86)\Git\cmd\git.exe"
  call :try "%%d:\Program Files\WorkBuddy\resources\vendor\PortableGit\cmd\git.exe"
  call :try "%%d:\WorkBuddy\resources\vendor\PortableGit\cmd\git.exe"
)
if not defined GIT goto no_git

:have_git
echo [INFO] git: %GIT%
"%GIT%" rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 goto no_repo

rem ---- 2. make sure origin points to the right repo ----
"%GIT%" remote get-url origin >nul 2>nul
if errorlevel 1 (
  "%GIT%" remote add origin "%REMOTE_URL%"
) else (
  "%GIT%" remote set-url origin "%REMOTE_URL%"
)
echo [INFO] remote: %REMOTE_URL%
echo [INFO] branch: main
echo.

rem ---- 3. push ----
echo Pushing now. A browser window may open for GitHub login.
echo Sign in, then click "Authorize". The window will return here automatically.
echo.
"%GIT%" push -u origin main
if errorlevel 1 goto push_failed

echo.
echo ============================================================
echo   [OK] code pushed to GitHub
echo ============================================================
echo.
echo Next:
echo   1. open https://github.com/CJ19901101/hongguo-mobile/actions
echo   2. the build "Build unsigned IPA" starts by itself, wait 3-5 min
echo   3. download HongguoDrama-unsigned-ipa from Artifacts at the bottom
echo.
goto end_ok

:no_git
echo [ERROR] git was not found on this computer.
echo         Install Git for Windows (default options), reopen this window:
echo         https://git-scm.com/download/win
goto end_bad

:no_repo
echo [ERROR] this folder is not a git repository.
echo         make sure this .bat sits inside the hongguo-mobile folder.
goto end_bad

:push_failed
echo.
echo [PUSH FAILED] usual reasons:
echo   1. the repo does NOT exist yet on GitHub, or the name does not match
echo      CJ19901101/hongguo-mobile
echo   2. the repo is NOT empty (you ticked README / .gitignore / license
echo      when creating it). Delete it, create an EMPTY repo, run again.
echo   3. the browser authorization was cancelled - just run this script again
echo   4. network problem - "Could not resolve host" / timeout
goto end_bad

:end_bad
echo.
pause
exit /b 1

:end_ok
pause
exit /b 0

:try
if defined GIT goto :eof
if exist %1 set "GIT=%~1"
goto :eof

@echo off
rem Push this project to GitHub, so the cloud macOS runner can build the IPA.
rem ASCII only on purpose: cmd.exe misparses GBK/UTF-8 text inside ( ) blocks.
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Step 1 of 2: push code to GitHub
echo   (the cloud macOS runner then compiles the unsigned IPA)
echo ============================================================
echo.

where git >nul 2>nul
if errorlevel 1 goto no_git
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 goto no_repo

echo [current remote, may be empty]
git remote -v
echo.
echo Copy your repository URL from the GitHub page, it looks like:
echo    https://github.com/YOUR-NAME/hongguo-mobile.git
echo.

set "REPO="
set /p REPO= Paste the URL here, then press Enter: 

if "%REPO%"=="" goto empty
if /i "%REPO:~0,8%"=="https://" goto url_ok
if /i "%REPO:~0,4%"=="git@" goto url_ok
echo.
echo [!] URL should start with https:// or git@
echo     You typed: %REPO%
goto end_bad

:url_ok
echo.
echo [1/2] set remote origin
git remote remove origin >nul 2>nul
git remote add origin "%REPO%"
git remote -v
echo.
echo [2/2] pushing... a browser window may open, log in and click Authorize
echo.
git push -u origin main
if errorlevel 1 goto push_failed
echo.
echo ============================================================
echo   [OK] code pushed to GitHub
echo ============================================================
echo.
echo Next:
echo   1. open your repo page, click the Actions tab
echo   2. pick "Build unsigned IPA" and wait 3-5 minutes
echo   3. download the ipa from Artifacts at the bottom of that run
echo.
goto end_ok

:no_git
echo [ERROR] git not found. Install Git for Windows: https://git-scm.com/download/win
goto end_bad

:no_repo
echo [ERROR] this folder is not a git repository.
echo         make sure the .bat sits inside the hongguo-mobile folder.
goto end_bad

:empty
echo.
echo Nothing typed, exit.
goto end_bad

:push_failed
echo.
echo [PUSH FAILED] usual reasons:
echo   1. the repo is NOT empty (you ticked README / .gitignore / license
echo      when creating it). Delete it on GitHub, create an EMPTY repo, retry.
echo   2. the browser authorization was cancelled. Run this script again.
echo   3. the URL is wrong. Copy it again with the green Code button.
goto end_bad

:end_bad
echo.
pause
exit /b 1

:end_ok
pause
exit /b 0

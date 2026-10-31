@echo off
rem Start hongguo-mobile server (ASCII only to avoid codepage issues)
cd /d "%~dp0"
echo Hongguo Mobile starting on port 8787 ...
echo Open http://localhost:8787 on this PC, or http://PC-IP:8787 on your phone.
node server\index.js
pause

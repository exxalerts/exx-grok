@echo off
cd /d "%~dp0"
echo Starting exx.grok...
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org then run this again. & pause & exit /b 1)
if not exist .env copy .env.example .env >nul
start "" cmd /c "timeout /t 3 >nul & start chrome http://localhost:5177 || start http://localhost:5177"
node server\index.js
pause

@echo off
cd /d "%~dp0\.."

set REMOTE_URL=%~1
if "%REMOTE_URL%"=="" set REMOTE_URL=https://github.com/kuwotojaden67-dev/Bot.git

if not exist ".git" (
    git init -b main
)

git add -A
git commit -m "feat: Complete 2REAL AI TRADER MT5 Autonomous System & Chrome Dashboard"
git branch -M main

git remote remove origin >nul 2>&1
git remote add origin "%REMOTE_URL%"

echo Pushing 2REAL AI TRADER to %REMOTE_URL% (branch: main)...
git push -u origin main
echo ==================================================================
echo SUCCESS! Code pushed to: https://github.com/kuwotojaden67-dev/Bot
echo Live GitHub Pages URL (once Pages Source = "GitHub Actions"):
echo https://kuwotojaden67-dev.github.io/Bot/
echo ==================================================================
pause

@echo off
title 2REAL AI TRADER — MT5 Autonomous Trading System
echo ================================================================
echo   2REAL AI TRADER — LOCAL MT5 AUTONOMOUS TRADING SYSTEM
echo ================================================================
echo.

REM Check Python installation
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python 3.10+ is not installed or not in PATH.
    echo Please install Python from https://www.python.org/downloads/ and check "Add Python to PATH".
    pause
    exit /b 1
)

REM Create virtual environment if missing
if not exist ".venv" (
    echo [1/3] Creating local Python virtual environment...
    python -m venv .venv
)

echo [2/3] Verifying and installing dependencies (including MetaTrader5)...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip >nul 2>&1
pip install -r requirements.txt

echo [3/3] Launching 2REAL AI TRADER on http://127.0.0.1:8000 (Auto-opening Chrome)...
python launch.py --host 127.0.0.1 --port 8000
pause

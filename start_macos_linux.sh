#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "================================================================"
echo "  2REAL AI TRADER — LOCAL MT5 AUTONOMOUS TRADING SYSTEM"
echo "================================================================"

if ! command -v python3 >/dev/null 2>&1; then
    echo "[ERROR] python3 is not installed. Please install Python 3.10+."
    exit 1
fi

if [ ! -d ".venv" ]; then
    echo "[1/3] Creating local Python virtual environment..."
    python3 -m venv .venv
fi

echo "[2/3] Installing dependencies..."
source .venv/bin/activate
pip install --upgrade pip >/dev/null 2>&1
pip install -r requirements.txt

echo "[3/3] Launching 2REAL AI TRADER on http://127.0.0.1:8000..."
python3 launch.py --host 127.0.0.1 --port 8000

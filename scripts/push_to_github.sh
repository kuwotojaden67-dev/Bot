#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

REMOTE_URL="${1:-https://github.com/kuwotojaden67-dev/Bot.git}"

if [ ! -d ".git" ]; then
    git init -b main
fi

git add -A
git commit -m "feat: Complete 2REAL AI TRADER MT5 Autonomous System & Chrome Dashboard" || true
git branch -M main

if git remote | grep -q "^origin$"; then
    git remote set-url origin "$REMOTE_URL"
else
    git remote add origin "$REMOTE_URL"
fi

echo "Pushing 2REAL AI TRADER to $REMOTE_URL (branch: main)..."
git push -u origin main
echo "=================================================================="
echo "SUCCESS! Code pushed to: https://github.com/kuwotojaden67-dev/Bot"
echo "Live GitHub Pages URL (once Pages Source = 'GitHub Actions'):"
echo "https://kuwotojaden67-dev.github.io/Bot/"
echo "=================================================================="

#!/bin/bash
cd "$(dirname "$0")"
echo "Starting exx.grok..."
if ! command -v node >/dev/null 2>&1; then echo "Node.js is not installed. Get it from https://nodejs.org then run this again."; read -r; exit 1; fi
[ -f .env ] || cp .env.example .env
(sleep 3; open -a "Google Chrome" "http://localhost:5177" 2>/dev/null || open "http://localhost:5177") &
node server/index.js

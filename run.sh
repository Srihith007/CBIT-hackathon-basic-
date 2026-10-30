#!/usr/bin/env bash
# Start the API (:8000) and the web app (:5173) together. Ctrl-C stops both.
set -e
cd "$(dirname "$0")"
(cd backend && ./.venv/bin/python -m uvicorn app.main:app --port 8000) &
API=$!
trap 'kill $API 2>/dev/null' EXIT
cd frontend && [ -d node_modules ] || npm install
echo "Open http://localhost:5173"
npm run dev -- --port 5173

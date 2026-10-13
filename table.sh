#!/usr/bin/env bash
# Lay the table: ONE process on ONE port. Ctrl+C clears it.
#
#   bash table.sh              → http://localhost:3470
#   PORT=3480 bash table.sh    → somewhere else
#
# The page (site/) is a Next.js app exported to static files once, here, and
# served by the same Python process that runs the host, the exams, the loop,
# the editor and the workbench. One origin, one port — in Cloud Shell too.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-3470}"

if [ ! -f .env ]; then
  echo "No .env yet. Run:  ./setup_codelab.sh   (or: cp .env.example .env)"
  exit 1
fi
if [ ! -x .venv/bin/python ]; then
  echo "No .venv yet. Run:  ./setup_codelab.sh   (or: uv sync)"
  exit 1
fi
if ! .venv/bin/python -c "import sys; sys.path.insert(0,'.'); from kitchen import env; sys.exit(0 if env.MODE else 1)" 2>/dev/null; then
  echo "Not configured yet. Point gcloud at a project:"
  echo "    gcloud config set project YOUR_PROJECT_ID"
  echo "or put a GOOGLE_API_KEY in .env. See .env.example."
  exit 1
fi

needs_build=0
if [ ! -f site/out/index.html ]; then
  needs_build=1
elif [ -n "$(find site/app site/components site/lib site/public site/package.json -newer site/out/index.html -print -quit 2>/dev/null)" ]; then
  needs_build=1
fi
if [ "$needs_build" = 1 ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm not found. The page (site/) is a Next.js app and needs Node 20+: https://nodejs.org/en/download"
    exit 1
  fi
  if [ ! -x site/node_modules/.bin/next ]; then
    echo "  installing the page's packages (site/) — about a minute, once…"
    (cd site && if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi)
  fi
  echo "  building the page (site/) — about a minute…"
  (cd site && npm run build >/dev/null)
fi

# Start the kitchen in the background and only print the links once it
# actually answers on the port. Importing the kitchen (ADK, adk web for the
# workbench) takes a while — in Cloud Shell up to a minute — and a Web Preview
# tab opened before that says "Unable to forward your request to a backend".
echo
echo "  warming up the kitchen — up to a minute the first time, do not open the page yet…"
.venv/bin/uvicorn kitchen.service:app --host 0.0.0.0 --port "$PORT" --log-level warning &
KITCHEN=$!
trap 'kill "$KITCHEN" 2>/dev/null; wait "$KITCHEN" 2>/dev/null; echo; echo "  table cleared."; exit 0' INT TERM

ready=0
for _ in $(seq 1 120); do
  if ! kill -0 "$KITCHEN" 2>/dev/null; then
    echo "  ✗ the kitchen did not start — read the error above." >&2
    exit 1
  fi
  if .venv/bin/python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:${PORT}/api/health', timeout=2)" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" != 1 ]; then
  echo "  ✗ the kitchen is still not answering on port ${PORT} after two minutes." >&2
  kill "$KITCHEN" 2>/dev/null
  exit 1
fi

echo
echo "  ✓ the table is laid"
echo
echo "  Table for N      → http://localhost:${PORT}"
echo "  the workbench    → http://localhost:${PORT}/workbench/dev-ui/?app=host"
echo
echo "  In Cloud Shell: Web Preview → Change port → ${PORT}"
echo "  Ctrl+C clears the table."
echo
wait "$KITCHEN"

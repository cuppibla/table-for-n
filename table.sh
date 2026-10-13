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

echo
echo "  Table for N      → http://localhost:${PORT}"
echo "  the workbench    → http://localhost:${PORT}/workbench/dev-ui/?app=host"
echo
exec .venv/bin/uvicorn kitchen.service:app --host 0.0.0.0 --port "$PORT" --log-level warning

#!/usr/bin/env bash
# Shoot the page in every course state, for the codelab and the README.
# Drives a RUNNING kitchen through its own API (the same routes the page uses),
# then photographs each state with headless Chrome in capture mode (?still=1,
# which reads the log once instead of holding the event stream open).
#
#   bash scripts/capture.sh [out_dir]        default: runs/shots
#
# Leaves the repo as shipped at the end (criteria, edge, draft, honest judge).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-runs/shots}"; mkdir -p "$OUT"
URL="${TABLE_URL:-http://127.0.0.1:3470}"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PY=.venv/bin/python

api() { curl -s -X "${3:-POST}" "$URL/api$1" -H 'content-type: application/json' ${2:+-d "$2"}; }
shoot() { "$CH" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,1250 --virtual-time-budget=9000 --timeout=12000 \
  --screenshot="$OUT/$1.png" "$URL$2" >/dev/null 2>&1; echo "  shot $1"; }
wait_job() { for i in $(seq 1 200); do s=$(api "/job?kind=$1" "" GET | $PY -c 'import json,sys; print(json.load(sys.stdin)["state"])'); [ "$s" = running ] || { echo "  $1: $s"; return; }; sleep 1.5; done; }
walk() { $PY scripts/walk.py --only "$1" >/dev/null 2>&1 || true; }

echo "cover + course I"
shoot cover "/"
shoot ch1 "/table/?ch=1&still=1"

echo "course II"
shoot ch2-before "/table/?ch=2&still=1"
walk 2
api /book '{"party":"p1"}' >/dev/null
shoot ch2-after "/table/?ch=2&still=1"
shoot console "/table/?ch=2&still=1&console=1"

echo "course III"
walk 3
shoot ch3-after "/table/?ch=3&still=1"

echo "course IV"
walk 4
api /install '{"which":"hacked"}' >/dev/null; api /judge '{"to":"rating"}' >/dev/null; api /book '{"party":"p1"}' >/dev/null
shoot ch4-after "/table/?ch=4&still=1"
api /judge '{"to":"everyone_ate"}' >/dev/null

echo "course V"
walk 5
shoot ch5-after "/table/?ch=5&still=1"

echo "course VI"
api /install '{"which":"winner"}' >/dev/null; api /book '{"party":"p1"}' >/dev/null
shoot ch6 "/table/?ch=6&still=1"
shoot ch6-check "/table/?ch=6&still=1&check=1"

echo "restore"
$PY scripts/walk.py --only 5 --restore >/dev/null 2>&1 || true
ls -la "$OUT" | awk 'NR>1{print $5, $9}'

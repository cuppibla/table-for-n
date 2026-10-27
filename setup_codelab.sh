#!/usr/bin/env bash
# Table for N — one-shot environment setup for the CODELAB (uv path).
# Safe to re-run any number of times.
#
# Run ./setup_project.sh FIRST. That one makes the project and puts billing on
# it; this one turns that project into a working lab environment:
#   • aiplatform.googleapis.com enabled on it (Gemini on Vertex AI; course VI deploys there too)
#   • .venv built by uv, dependencies pinned by uv.lock
#   • site/node_modules + a built site/out for the page (a Next.js app)
#   • a root .env pointing the lab at Vertex AI on that project (no API key anywhere)
#   • one real model call, so you find out here and not in course I
#
# It never prompts and never blocks waiting for input. Every failure exits
# non-zero with a fix to try.
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
tick() { printf '  ✓ %s\n' "$1"; }
info() { printf '  · %s\n' "$1"; }

die() {
    printf '\n\033[1m✗ %s\033[0m\n\n' "$1" >&2
    shift
    for line in "$@"; do printf '%s\n' "$line" >&2; done
    printf '\n' >&2
    exit 1
}

say "Table for N · setup"

# ── 0 · gcloud, an account, and a project ─────────────────────────────────────
command -v gcloud >/dev/null 2>&1 || die \
    "gcloud not found." \
    "This script is written for Cloud Shell, where gcloud is preinstalled." \
    "On a laptop, install the Google Cloud SDK first:" \
    "  https://cloud.google.com/sdk/docs/install"

if [ -z "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null)" ]; then
    die "No active gcloud account." \
        "Authenticate, then re-run this script:" \
        "  gcloud auth login"
fi

PROJECT="$(gcloud config get project 2>/dev/null \
    || gcloud config get-value project 2>/dev/null || true)"
PROJECT="$(printf '%s' "$PROJECT" | tr -d '[:space:]')"
case "$PROJECT" in
    "(unset)"|"unset") PROJECT="" ;;
esac
PROJECT_FILE="$HOME/project_id.txt"
if [ -z "$PROJECT" ] && [ -f "$PROJECT_FILE" ]; then
    PROJECT="$(tr -d '[:space:]' < "$PROJECT_FILE" || true)"
    if [ -n "$PROJECT" ]; then
        info "gcloud had no project selected — taking $PROJECT from $PROJECT_FILE"
        gcloud config set project "$PROJECT" >/dev/null 2>&1 || true
    fi
fi
if [ -z "$PROJECT" ]; then
    die "No Google Cloud project selected." \
        "./setup_project.sh makes a project, links billing, and records the id" \
        "in ~/project_id.txt. Run it first:" \
        "" \
        "  ./setup_project.sh" \
        "" \
        "Already have a project you want to use? Point gcloud at it instead:" \
        "  gcloud config set project YOUR_PROJECT_ID"
fi
tick "project: $PROJECT"

# ── 1 · the API this lab calls ────────────────────────────────────────────────
# Gemini on Vertex AI rides aiplatform.googleapis.com, and so does course VI's
# Agent Engine deploy. One enable covers both.
say "1 · Cloud APIs"

# enable_apis SERVICE… — 0 if every service is enabled afterwards.
# Reads first (`services list` is free); only calls `enable` for what is
# missing, because every `enable` — even of an already-enabled service —
# counts against Service Usage's small "mutate requests per minute" quota,
# which a brand-new project that was just set up and re-run can exhaust
# (429 RESOURCE_EXHAUSTED). On 429 it waits and tries again.
ENABLE_ERR=""
enable_apis() {
    local missing=() svc enabled attempt
    enabled="$(gcloud services list --enabled --project="$PROJECT" --format='value(config.name)' 2>/dev/null || true)"
    for svc in "$@"; do
        printf '%s\n' "$enabled" | grep -qx "$svc" || missing+=("$svc")
    done
    [ "${#missing[@]}" -eq 0 ] && return 0
    for attempt in 1 2 3 4; do
        if ENABLE_ERR="$(gcloud services enable "${missing[@]}" --project="$PROJECT" -q 2>&1)"; then
            return 0
        fi
        if printf '%s' "$ENABLE_ERR" | grep -q -E '429|RESOURCE_EXHAUSTED|RATE_LIMIT'; then
            info "Service Usage is rate-limiting this project (429) — waiting 30s, attempt $attempt of 4"
            sleep 30
            continue
        fi
        return 1
    done
    return 1
}

if ! enable_apis aiplatform.googleapis.com; then
    die "Could not enable aiplatform.googleapis.com on $PROJECT." \
        "gcloud said:" "" "$ENABLE_ERR" "" \
        "If that mentions 403 or PERMISSION_DENIED, the project is simply too" \
        "new — its IAM policy is still propagating. Wait a minute, then run:" \
        "" "  ./setup_codelab.sh" "" \
        "If it mentions 429 or RESOURCE_EXHAUSTED, the project's per-minute" \
        "quota for enabling services is spent — wait two minutes and re-run." \
        "" \
        "If it mentions billing, link a billing account and re-run:" \
        "  https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT"
fi
tick "aiplatform.googleapis.com enabled"

# ── 1b · course IX · the receipt (BigQuery) ───────────────────────────────────
# The host writes one row per event to a BigQuery dataset once course IX's
# edit is in. The plugin makes the table and the views itself; the APIs and
# the dataset are made here, once. Never fatal: courses I–VIII do not need it.
say "1b · course IX · BigQuery"
BQ_DATASET="${BQ_ANALYTICS_DATASET:-table_for_n}"
BQ_LOCATION="${BQ_ANALYTICS_LOCATION:-US}"
if enable_apis bigquery.googleapis.com bigquerystorage.googleapis.com; then
    tick "bigquery.googleapis.com + bigquerystorage.googleapis.com enabled"
else
    info "could not enable the BigQuery APIs (${ENABLE_ERR%%$'\n'*}) — course IX will say so; I–VIII are unaffected"
fi
# (the dataset itself is made in 2c, with the BigQuery client uv installs next)

# ── 2 · python env + deps (uv owns both) ──────────────────────────────────────
say "2 · Python environment"
if ! command -v uv >/dev/null 2>&1 && [ -x "$HOME/.local/bin/uv" ]; then
    PATH="$HOME/.local/bin:$PATH"; export PATH
fi
if ! command -v uv >/dev/null 2>&1; then
  printf '  ✗ uv not found. Install it, then re-run ./setup_codelab.sh:\n' >&2
  printf '      curl -LsSf https://astral.sh/uv/install.sh | sh\n' >&2
  exit 1
fi
if [ -d .venv ]; then info "reusing the existing .venv"; else uv venv; fi
uv sync
tick "uv env + google-adk / google-genai / fastapi + uvicorn (locked by uv.lock)"

# ── 2c · course IX · the dataset ──────────────────────────────────────────────
# One dataset, made with the same client the host writes with — no `bq` needed.
# The plugin creates agent_events and the v_* views on the first row it writes.
say "2c · course IX · the dataset"
if DS_OUT="$(uv run --no-sync python - "$PROJECT" "$BQ_DATASET" "$BQ_LOCATION" <<'PY' 2>&1
import sys
from google.cloud import bigquery
from google.cloud.exceptions import NotFound
project, dataset, location = sys.argv[1:4]
c = bigquery.Client(project=project)
try:
    d = c.get_dataset(f"{project}.{dataset}")
    print(f"exists ({d.location})")
except NotFound:
    ds = bigquery.Dataset(f"{project}.{dataset}")
    ds.location = location
    c.create_dataset(ds)
    print(f"created ({location})")
PY
)"; then
    tick "dataset $PROJECT.$BQ_DATASET — ${DS_OUT##*$'\n'}"
else
    info "dataset not made — course IX's card shows the one-line command. BigQuery said: ${DS_OUT##*$'\n'}"
fi

# ── 2b · the page ──────────────────────────────────────────────────────────────
# The page (site/) is a Next.js app, exported to static files once and served
# by the same process as the host. Build it here, where a minute's wait is
# expected. `npm ci` installs exactly what package-lock.json pins.
say "2b · the page"
command -v npm >/dev/null 2>&1 || die \
    "npm not found." \
    "The page (site/) is a Next.js app and needs Node 20+. Cloud Shell has it;" \
    "on a laptop: https://nodejs.org/en/download"
if [ -x site/node_modules/.bin/next ]; then
    info "site/ packages already installed"
else
    (cd site && npm ci --no-audit --no-fund)
fi
(cd site && npm run build >/dev/null)
tick "site/out built"

# ── 3 · .env ──────────────────────────────────────────────────────────────────
say "3 · .env"
if [ -f .env ]; then
    info "keeping your existing .env"
else
    cp .env.example .env
    tick ".env written from .env.example (Vertex AI on $PROJECT)"
fi
# course IX: name the dataset in .env (the plugin stays off until this line exists)
if grep -q "^BQ_ANALYTICS_DATASET=" .env; then
    info "BQ_ANALYTICS_DATASET already set in .env"
else
    if grep -q "^# BQ_ANALYTICS_DATASET=" .env; then
        sed -i.bak "s|^# BQ_ANALYTICS_DATASET=.*|BQ_ANALYTICS_DATASET=$BQ_DATASET|" .env && rm -f .env.bak
    else
        printf '\nBQ_ANALYTICS_DATASET=%s\n' "$BQ_DATASET" >> .env
    fi
    tick "BQ_ANALYTICS_DATASET=$BQ_DATASET in .env — course IX's edit turns the plugin on"
fi

# ── 4 · preflight — does the model answer? ───────────────────────────────────────
say "4 · preflight"
# On a project whose aiplatform API was enabled moments ago, the first
# Gemini call answers 404 "publisher model not found" (or 403) for a minute
# or two while access propagates. That is not a failure of yours: wait and
# try again, a few times, before giving up.
preflight_ok=0
for attempt in 1 2 3 4 5; do
    if uv run --no-sync python scripts/preflight.py; then
        preflight_ok=1
        break
    fi
    if [ "$attempt" -lt 5 ]; then
        info "the model did not answer yet — on a brand-new project that takes a minute or two. Retrying in 30s (attempt $attempt of 5)…"
        sleep 30
    fi
done
if [ "$preflight_ok" -ne 1 ]; then
    die "The model still did not answer after five tries." \
        "If the error above is 404 'publisher model … was not found': aiplatform was" \
        "enabled on $PROJECT only moments ago — wait two minutes and run ./setup_codelab.sh again." \
        "If it is 403: see the hint printed above it."
fi

printf '\nSetup finished. Lay the table:\n\n    bash table.sh\n\n'

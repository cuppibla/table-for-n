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
if ! ENABLE_ERR="$(gcloud services enable aiplatform.googleapis.com --project="$PROJECT" -q 2>&1)"; then
    die "Could not enable aiplatform.googleapis.com on $PROJECT." \
        "gcloud said:" "" "$ENABLE_ERR" "" \
        "If that mentions 403 or PERMISSION_DENIED, the project is simply too" \
        "new — its IAM policy is still propagating. Wait a minute, then run:" \
        "" "  ./setup_codelab.sh" "" \
        "If it mentions billing, link a billing account and re-run:" \
        "  https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT"
fi
tick "aiplatform.googleapis.com enabled"

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

# ── 4 · preflight — does the model answer? ───────────────────────────────────────
say "4 · preflight"
uv run python scripts/preflight.py

printf '\nSetup finished. Lay the table:\n\n    bash table.sh\n\n'

"""Settle how the lab talks to Gemini, once, for every process in the kitchen.

Two ways, in this order — the same order Agent Valley uses:

  1. **Vertex AI** (the default): your Google Cloud project + the credentials you
     already have. Nothing to paste, nothing to leak. In Cloud Shell the project
     is whatever `gcloud config set project` named; `.env` can also name it.
  2. **An API key**, if you would rather not use a project (a laptop, courses I–V).
     Put `GOOGLE_API_KEY=…` in `.env`. Course VI (deploy) still needs a project.

`.env` is read OVER the shell (`override=True`), the way ADK's own loader does,
so the file is what counts. A key wins only when Vertex was not asked for.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
ADC = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"

#: "vertex", "key", or "" (nothing set). Read it for messages, not logic.
MODE = ""


def _gcloud_project() -> str:
    for var in ("GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_QUOTA_PROJECT", "GCP_PROJECT"):
        if os.environ.get(var):
            return os.environ[var]
    try:
        out = subprocess.run(["gcloud", "config", "get-value", "project"],
                             capture_output=True, text=True, timeout=8).stdout.strip()
        return "" if out in ("", "(unset)") else out
    except (OSError, subprocess.SubprocessError):
        return ""


def settle() -> str:
    """Load .env, pick a mode, export exactly the variables it needs."""
    global MODE
    load_dotenv(ENV_FILE, override=True)
    if os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_API_KEY"):
        os.environ["GOOGLE_API_KEY"] = os.environ.pop("GEMINI_API_KEY")
    key = os.environ.get("GOOGLE_API_KEY", "").strip()
    has_key = key not in ("", "YOUR_GOOGLE_API_KEY_HERE")
    wants_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").upper() in ("1", "TRUE", "YES")

    if has_key and not wants_vertex:
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "FALSE"
        MODE = "key"
        return MODE

    project = _gcloud_project()
    if wants_vertex or (ADC.exists() and project):
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"
        if project:
            os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project)
        # gemini-2.5-flash is served from `global`, which draws on capacity across
        # regions — one busy region cannot 429 a learner. Course VI deploys to a
        # region of its own (DEPLOY_REGION, default us-central1).
        os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")
        os.environ.pop("GOOGLE_API_KEY", None)        # never send both
        MODE = "vertex"
        return MODE

    MODE = "key" if has_key else ""
    return MODE


MODE = settle()


def analytics() -> dict:
    """Course IX — where the host's rows go, if anywhere. Read from .env
    (the file, like `read_env_line`) so the page tells the truth about the
    file, and from the process for the project gcloud settled."""
    dataset = read_env_line("BQ_ANALYTICS_DATASET") or os.environ.get("BQ_ANALYTICS_DATASET", "")
    return {"project": os.environ.get("GOOGLE_CLOUD_PROJECT", ""), "dataset": dataset,
            "table": read_env_line("BQ_ANALYTICS_TABLE") or os.environ.get("BQ_ANALYTICS_TABLE", "agent_events"),
            "location": read_env_line("BQ_ANALYTICS_LOCATION") or os.environ.get("BQ_ANALYTICS_LOCATION", "US")}


def read_env_line(key: str) -> str:
    """One `KEY=value` line of .env, or ''. Read from the file, not the process."""
    if not ENV_FILE.exists():
        return ""
    for line in ENV_FILE.read_text().splitlines():
        s = line.strip()
        if s.startswith(f"{key}="):
            return s.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def write_env_line(key: str, value: str) -> None:
    """Set (or clear, with value '') one line of .env in place. Comments and
    the other lines are kept exactly as they are."""
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    out, done = [], False
    for line in lines:
        s = line.strip()
        if s.startswith(f"{key}=") or s.startswith(f"# {key}="):
            if not done and value:
                out.append(f"{key}={value}")
                done = True
            elif not done:
                out.append(f"# {key}=")
                done = True
            continue
        out.append(line)
    if not done and value:
        out.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(out).rstrip("\n") + "\n")
    settle()

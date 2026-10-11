"""Settle the model path once, for every process in the kitchen.

`.env` at the repo root decides it — and it is loaded OVER the shell
(`override=True`), the way ADK's own loader does, so the file is what counts:

    GOOGLE_API_KEY=…                       → the Gemini API (AI Studio)
    GOOGLE_GENAI_USE_VERTEXAI=True + project → Vertex AI

A key wins when both are present. Course VI (deploy) always needs the Vertex
side: a project, billing, and `gcloud auth application-default login`.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"


def settle() -> str:
    """Load .env and return the mode: 'key', 'vertex' or '' (nothing set)."""
    load_dotenv(ENV_FILE, override=True)
    if os.environ.get("GOOGLE_API_KEY", "").strip() not in ("", "YOUR_GOOGLE_API_KEY_HERE"):
        os.environ.pop("GOOGLE_GENAI_USE_VERTEXAI", None)
        return "key"
    if os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true") and os.environ.get("GOOGLE_CLOUD_PROJECT"):
        os.environ.pop("GOOGLE_API_KEY", None)
        return "vertex"
    return ""


MODE = settle()


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

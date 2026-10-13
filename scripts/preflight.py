"""Is this machine ready, and which courses are lit?

Run it now, and again any time you want the answer to "where am I?" — every
line is read from your files and the kitchen's receipts, never a checklist.

    uv run python scripts/preflight.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from kitchen import env  # noqa: E402  — settles Vertex-vs-key before anything else

TICK, BOX = "\033[32m✓\033[0m", "\033[90m▢\033[0m"
DIM, OFF = "\033[90m", "\033[0m"


def model_check() -> str:
    """One real call to the lab's model, the way the host makes it."""
    from google import genai
    from google.genai import types

    from host import agent

    client = genai.Client()
    r = client.models.generate_content(
        model=agent.MODEL, contents="Reply with exactly: table for N, ready to seat.",
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_budget=0), temperature=0.0))
    return (r.text or "").strip()


def why(mode: str) -> str:
    where = os.environ.get("GOOGLE_CLOUD_LOCATION", "")
    if mode == "vertex":
        return ("If it says 403 PERMISSION_DENIED, the credentials on this machine are not on the project.\n"
                "    In Cloud Shell this does not happen. On a laptop: gcloud auth application-default login,\n"
                "    then gcloud auth application-default set-quota-project YOUR_PROJECT_ID.\n"
                f"    If it says the model was not found, try GOOGLE_CLOUD_LOCATION=global (now: {where or 'unset'}).")
    return "Check GOOGLE_API_KEY in .env — https://aistudio.google.com/apikey"


def menu(p: dict) -> list[str]:
    code, lit = p["code"], p["lit"]
    crit = ", ".join(code.get("criteria", [])) or "—"
    rows = [
        (1, "I", "the booking", "a reply is not a result", "read only · book one in the workbench"),
        (2, "II", "the comparator", f"the exam runs {crit}", "run it as shipped · read the verdicts"),
        (3, "III", "the judge", "everyone_ate is on the exam" if code.get("honest_on_exam") else "everyone_ate is not on the exam yet", "edit one line · walk the table"),
        (4, "IV", "the flight", "same answers, three judges", "judge the last exam three ways"),
        (5, "V", "the rewrite", f"instruction: {code.get('instruction', '?')}", "optimize · install · ship gate"),
        (6, "VI", "the other judge", "rating_score never reads the party", "install hacked · flip the switch"),
        (7, "VII", "the loop", "the back edge is in" if code.get("edge") else "no back edge yet", "delete one “# ” in loop/flywheel.py"),
        (8, "VIII", "the check", "", "eight courses"),
    ]
    return [f"  {r:<4}{TICK if lit.get(str(n)) else BOX} {name:<16}{DIM}· {how:<40}{note}{OFF}"
            for n, r, name, how, note in rows]


def main() -> int:
    print()
    mode = env.MODE
    if not mode:
        print("  ✗ Not configured. Point gcloud at a project:")
        print("        gcloud config set project YOUR_PROJECT_ID")
        print("    — or put a GOOGLE_API_KEY in .env. See .env.example.")
        return 1
    where = os.environ.get("GOOGLE_CLOUD_PROJECT", "?") if mode == "vertex" else "an API key"
    print(f"  talking to Gemini through {DIM}{mode} · {where}{OFF}")

    try:
        heard = model_check()
        from host import agent
        print(f"  the model answers {DIM}· {agent.MODEL} · it said: {heard[:48]}{OFF}")
    except Exception as exc:                                   # noqa: BLE001
        print(f"  ✗ the model did not answer: {type(exc).__name__}: {exc}"[:240])
        print("    " + why(mode))
        return 1

    built = (ROOT / "site" / "out" / "index.html").exists()
    print(f"  the page {DIM}· " + ("built" if built else "not built yet — bash table.sh builds it once") + OFF)

    import asyncio

    from kitchen import progress, workbench
    try:
        calls = asyncio.run(workbench.calls())
    except Exception:                                          # noqa: BLE001 — no table.db yet
        calls = 0
    p = progress.read(workbench_calls=calls)
    print("\n  tonight's menu:\n")
    for line in menu(p):
        print(line)
    print(f"\n  {DIM}a plate fills when something real proves it — an exam that ran, a loop that closed —"
          f" not when the code reads right.{OFF}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

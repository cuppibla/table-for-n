"""What the kitchen remembers between requests — and across restarts.

Nothing here is a checklist the page ticks. These are the receipts of things
that actually ran: exams (with their counts and hungry seats), loop runs,
the harvest. `progress.read()` turns them, together with a look at your
files, into which course is lit. Kept in runs/state.json.
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / "runs"
FILE = RUNS / "state.json"
_lock = threading.Lock()

STATE: dict = {
    "judge": "everyone_ate",          # the switch
    "exams": [],                      # newest last: {ts, judge, instruction, passed, failed, hungry, parties}
    "loops": [],                      # {ts, rounds, decision, closed, edge}
    "bookings": [],                   # {ts, party, judge, restaurant, time, honest, rating, hungry, instruction}
    "flights": [],                    # course IV  · {ts, n, comparator_passed, checker_passed, llm_passed, …, rows}
    "optimized": False,               # runs/optimize/winner.txt exists
    "harvest": {"minted": 0, "skipped": 0, "ts": None},
    "engine": "",                     # HOST_ENGINE as last seen
}


def load() -> None:
    RUNS.mkdir(exist_ok=True)
    if FILE.exists():
        try:
            STATE.update(json.loads(FILE.read_text()))
        except json.JSONDecodeError:
            pass


def save() -> None:
    with _lock:
        RUNS.mkdir(exist_ok=True)
        FILE.write_text(json.dumps(STATE, indent=1))


def push(key: str, row: dict, keep: int = 40) -> dict:
    row = {"ts": round(time.time(), 1), **row}
    STATE[key].append(row)
    del STATE[key][:-keep]
    save()
    return row


def set_(key: str, value) -> None:
    STATE[key] = value
    save()


load()

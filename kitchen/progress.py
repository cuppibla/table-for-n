"""Which course is lit — read from your files and from what actually ran.

Every course pairs a fact read off the disk with a receipt the kitchen kept:

    I     a booking happened in the workbench                        (table.db)
    II    the exam ran as shipped (the text metric)
    III   everyone_ate is on the exam + an exam under it failed with hungry seats
    IV    the last exam's answers were judged three ways (a flight)
    V     the winner is installed + an exam under it opened the gate (≥ 5/8)
    VI    the hacked instruction ran both exams: rating 8/8, honest ≤ 2/8
    VII   the back edge is in flywheel.py + a loop run reached round 2 and shipped
    VIII  all of the above

The second seating — the maître d', who uses tools and takes questions:

    IX    a booking happened with the maître d' (workbench or 📋)
    X     the path checker is on the path exam + a path exam ran with it
    XI    the conversation exam ran three ways: EXPERT under the draft, then
          NOVICE under the draft, then NOVICE under the line that asks
    XII   IX to XI

Never a checklist. Never raises — a broken file keeps the last good answer
and reports the error beside it.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from kitchen import codefile, env, instruction, jobs, state

log = logging.getLogger("kitchen.progress")
ROOT = Path(__file__).resolve().parents[1]
_last_good: dict[str, Any] | None = None


def _criteria(name: str = "eval_config.json") -> list[str]:
    try:
        return list(json.loads((ROOT / "exam" / name).read_text()).get("criteria", {}).keys())
    except Exception:                                              # noqa: BLE001
        return []


def _edge() -> bool:
    src = codefile.strip_comments((ROOT / "loop" / "flywheel.py").read_text())
    return bool(re.search(r"\(\s*proposer\s*,\s*publish\s*,\s*host\s*\)", src))


def _exams(**where) -> list[dict]:
    rows = state.STATE.get("exams", [])
    return [r for r in rows if all(r.get(k) == v for k, v in where.items())]


def _seated(rows: list[dict], persona: str, kind: str) -> bool:
    return any(r.get("persona") == persona and r.get("instruction") == kind and r.get("parties") for r in rows)


def _newest_each(rows: list[dict], key) -> list[dict]:
    """The newest receipt for each combination, oldest first. The second
    seating's tiles show one run per combination (criteria × instruction,
    persona × instruction), and a conversation receipt carries transcripts —
    the page polls this, so it gets the runs it shows, not the history."""
    seen: dict = {}
    for r in rows:
        k = key(r)
        seen.pop(k, None)
        seen[k] = r
    return list(seen.values())


def read(workbench_calls: int = 0, maitre_calls: int = 0) -> dict[str, Any]:
    global _last_good
    try:
        crit = _criteria()
        kind = instruction.kind()
        cur = instruction.current()
        edge = _edge()
        engine = env.read_env_line("HOST_ENGINE")
        exams = state.STATE.get("exams", [])
        loops = state.STATE.get("loops", [])
        harvest = state.STATE.get("harvest", {})
        bookings = state.STATE.get("bookings", [])

        flights = state.STATE.get("flights", [])
        paths = state.STATE.get("paths", [])
        talks = state.STATE.get("talks", [])
        path_crit = _criteria("eval_config_path.json")

        text_ran = [r for r in _exams(judge="text")]
        honest_fail = [r for r in _exams(judge="everyone_ate") if (r.get("failed") or 0) > 0]
        gate_open = [r for r in _exams(judge="everyone_ate") if r.get("instruction") in ("winner", "optimized")
                     and (r.get("passed") or 0) >= 5]
        hacked_rating = [r for r in _exams(judge="rating", instruction="hacked") if (r.get("failed") or 0) == 0 and (r.get("passed") or 0) > 0]
        hacked_honest = [r for r in _exams(judge="everyone_ate", instruction="hacked") if (r.get("passed") or 0) <= 2 and r.get("passed") is not None]
        shipped = [r for r in loops if r.get("edge") and (r.get("rounds") or 0) >= 2 and r.get("decision") == "SHIP"]

        code = {"criteria": crit, "honest_on_exam": "everyone_ate" in crit, "instruction": kind,
                "instruction_chars": len(cur), "edge": edge, "engine": engine,
                "library": instruction.available(),
                # the second seating's files
                "path_criteria": path_crit, "path_on_exam": "path" in path_crit, "persona": jobs.persona(),
                "maitre_instruction": instruction.kind("maitre_d"), "maitre_library": instruction.available("maitre_d")}
        # A plate, once earned, stays earned: every receipt below records the
        # file facts that held when it ran (the criteria, the instruction, the
        # edge), so the pairing is inside the receipt — not with today's file.
        lit = {
            1: workbench_calls > 0,
            2: bool(text_ran),
            3: bool([r for r in honest_fail if (r.get("hungry") or 0) > 0]),
            4: bool(flights),
            5: bool(gate_open),
            6: bool(hacked_rating) and bool(hacked_honest),
            7: bool(shipped),
            # the second seating
            9: maitre_calls > 0 or any(b.get("agent") == "maitre_d" for b in bookings),
            10: any("path" in (r.get("criteria") or []) and r.get("parties") for r in paths),
            11: _seated(talks, "EXPERT", "draft") and _seated(talks, "NOVICE", "draft") and _seated(talks, "NOVICE", "asks"),
        }
        lit[8] = all(lit[i] for i in range(1, 8))
        lit[12] = all(lit[i] for i in range(9, 12))
        last_exam = exams[-1] if exams else None
        out = {"code": code, "lit": {str(k): v for k, v in lit.items()},
               "judge": state.STATE.get("judge", "everyone_ate"),
               "workbench_calls": workbench_calls, "maitre_calls": maitre_calls,
               "last_exam": last_exam, "exams": exams[-12:], "loops": loops[-6:], "harvest": harvest,
               "flights": flights[-2:],
               "paths": _newest_each(paths, lambda r: (tuple(sorted(r.get("criteria") or [])), r.get("instruction")))[-6:],
               "talks": _newest_each(talks, lambda r: (r.get("persona"), r.get("instruction")))[-6:],
               # the host's last booking, as before; the maître d's is its own line
               "last_booking": next((b for b in reversed(bookings) if b.get("agent", "host") != "maitre_d"), None),
               "last_maitre_booking": next((b for b in reversed(bookings) if b.get("agent") == "maitre_d"), None),
               "optimized": state.STATE.get("optimized", False), "mode": env.MODE, "error": None}
        _last_good = out
        return out
    except Exception as exc:                                       # noqa: BLE001
        log.warning("progress could not read the files: %s", exc)
        base = dict(_last_good or {"code": {}, "lit": {}})
        base["error"] = f"{type(exc).__name__}: {exc}"[:300]
        return base

"""Which course is lit — read from your files and from what actually ran.

Every course pairs a fact read off the disk with a receipt the kitchen kept:

    I     a booking happened in the workbench                        (table.db)
    II    the exam ran as shipped (the text metric)
    III   everyone_ate is on the exam + an exam under it failed with hungry seats
          + the table was walked, seat by seat
    IV    the last exam's answers were judged three ways (a flight)
    V     the winner is installed + an exam under it opened the gate (≥ 5/8)
    VI    the hacked instruction ran both exams: rating 8/8, honest ≤ 2/8
    VII   the back edge is in flywheel.py + a loop run reached round 2 and shipped
    VIII  all of the above

Never a checklist. Never raises — a broken file keeps the last good answer
and reports the error beside it.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from kitchen import codefile, env, instruction, state

log = logging.getLogger("kitchen.progress")
ROOT = Path(__file__).resolve().parents[1]
_last_good: dict[str, Any] | None = None


def _criteria() -> list[str]:
    try:
        return list(json.loads((ROOT / "exam" / "eval_config.json").read_text()).get("criteria", {}).keys())
    except Exception:                                              # noqa: BLE001
        return []


def _edge() -> bool:
    src = codefile.strip_comments((ROOT / "loop" / "flywheel.py").read_text())
    return bool(re.search(r"\(\s*proposer\s*,\s*publish\s*,\s*host\s*\)", src))


def _exams(**where) -> list[dict]:
    rows = state.STATE.get("exams", [])
    return [r for r in rows if all(r.get(k) == v for k, v in where.items())]


def read(workbench_calls: int = 0) -> dict[str, Any]:
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

        walks = state.STATE.get("walks", [])
        flights = state.STATE.get("flights", [])

        text_ran = [r for r in _exams(judge="text")]
        honest_fail = [r for r in _exams(judge="everyone_ate") if (r.get("failed") or 0) > 0]
        gate_open = [r for r in _exams(judge="everyone_ate") if r.get("instruction") in ("winner", "optimized")
                     and (r.get("passed") or 0) >= 5]
        hacked_rating = [r for r in _exams(judge="rating", instruction="hacked") if (r.get("failed") or 0) == 0 and (r.get("passed") or 0) > 0]
        hacked_honest = [r for r in _exams(judge="everyone_ate", instruction="hacked") if (r.get("passed") or 0) <= 2 and r.get("passed") is not None]
        shipped = [r for r in loops if r.get("edge") and (r.get("rounds") or 0) >= 2 and r.get("decision") == "SHIP"]

        code = {"criteria": crit, "honest_on_exam": "everyone_ate" in crit, "instruction": kind,
                "instruction_chars": len(cur), "edge": edge, "engine": engine,
                "library": instruction.available()}
        # A plate, once earned, stays earned: every receipt below records the
        # file facts that held when it ran (the criteria, the instruction, the
        # edge), so the pairing is inside the receipt — not with today's file.
        lit = {
            1: workbench_calls > 0,
            2: bool(text_ran),
            3: bool([r for r in honest_fail if (r.get("hungry") or 0) > 0]) and bool(walks),
            4: bool(flights),
            5: bool(gate_open),
            6: bool(hacked_rating) and bool(hacked_honest),
            7: bool(shipped),
        }
        lit[8] = all(lit[i] for i in range(1, 8))
        last_exam = exams[-1] if exams else None
        out = {"code": code, "lit": {str(k): v for k, v in lit.items()},
               "judge": state.STATE.get("judge", "everyone_ate"),
               "workbench_calls": workbench_calls,
               "last_exam": last_exam, "exams": exams[-12:], "loops": loops[-6:], "harvest": harvest,
               "walks": walks[-6:], "flights": flights[-2:],
               "last_booking": bookings[-1] if bookings else None,
               "optimized": state.STATE.get("optimized", False), "mode": env.MODE, "error": None}
        _last_good = out
        return out
    except Exception as exc:                                       # noqa: BLE001
        log.warning("progress could not read the files: %s", exc)
        base = dict(_last_good or {"code": {}, "lit": {}})
        base["error"] = f"{type(exc).__name__}: {exc}"[:300]
        return base

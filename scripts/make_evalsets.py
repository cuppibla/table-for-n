"""Generate the two exams from world.py. Re-run after ANY world edit.

    exam/parties_train.evalset.json — 8 parties the optimizer will see
    exam/parties_val.evalset.json   — 8 parties it never will (36 seats)

Every case carries a golden `final_response`: the booking that feeds the
whole table (world.py guarantees one exists). The built-in text metric
(course II, before) compares the agent's reply to this string. The honest
judge (course II, after) ignores it entirely — a checker function grades
whatever the agent answered, which is also what makes course VI possible.

    uv run python scripts/make_evalsets.py
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import world  # noqa: E402

TIMES = [f"{h:02d}:{m:02d}" for h in range(17, 21) for m in (0, 15, 30, 45)]


def golden(party_id: str) -> dict:
    """The highest-rated room, at the earliest time, that feeds everyone."""
    ids = world.PARTIES[party_id]
    best = None
    for rid, r in sorted(world.RESTAURANTS.items(), key=lambda kv: -kv[1]["rating"]):
        for t in TIMES:
            score, seats = world.everyone_ate(ids, rid, t)
            if score >= 1.0:
                best = (rid, t, seats)
                break
        if best:
            break
    if not best:
        raise SystemExit(f"{party_id}: no booking feeds everyone — fix world.py")
    rid, t, _ = best
    names = ", ".join(world.PEOPLE[i]["name"] for i in ids)
    return {"restaurant": world.RESTAURANTS[rid]["name"], "time": t,
            "reason": f"{world.RESTAURANTS[rid]['name']} at {t} works for every seat — {names} all eat."}


def make(name: str, party_ids: list[str]) -> dict:
    cases = []
    for pid in party_ids:
        g = golden(pid)
        cases.append({
            "eval_id": pid,
            "conversation": [{
                "invocation_id": f"inv-{pid}",
                "user_content": {"parts": [{"text": world.brief(pid)}], "role": "user"},
                "final_response": {"parts": [{"text": json.dumps(g)}], "role": "model"},
                "intermediate_data": None,
            }],
            "session_input": {"app_name": "host", "user_id": "lab", "state": {}},
        })
    return {"eval_set_id": name, "name": name, "eval_cases": cases, "creation_timestamp": 0.0}


if __name__ == "__main__":
    for name, ids in [("parties_train", world.TRAIN), ("parties_val", world.HOLDOUT)]:
        path = os.path.join(ROOT, "exam", f"{name}.evalset.json")
        with open(path, "w") as f:
            json.dump(make(name, ids), f, indent=2)
        print(f"wrote {os.path.relpath(path, ROOT)}  ({len(ids)} cases, golden answers in)")

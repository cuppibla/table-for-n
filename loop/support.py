"""Small shared pieces: read a booking out of model text, and the event
payloads the table understands. Used by the kitchen's 📋 Book and by the
loop in flywheel.py — same shapes, one place."""
from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import world  # noqa: E402

_TIME_RE = re.compile(r"(\d{1,2}:\d{2})")


def parse_decision(text: str) -> tuple[str, str, str]:
    """Model text -> (restaurant_id, 'HH:MM', reason). Raises if unparseable."""
    m = re.search(r"\{.*\}", text or "", re.S)
    d = json.loads(m.group(0)) if m else {}
    rid = world.find_restaurant(str(d.get("restaurant", "")))
    if rid is None:
        raise ValueError(f"unparseable decision: {(text or '')[:80]!r}")
    t = _TIME_RE.search(str(d.get("time", "")))
    return rid, (t.group(1) if t else "19:00"), str(d.get("reason", ""))[:240]


def people(party_id: str) -> list[dict]:
    return [{"id": i, "name": world.PEOPLE[i]["name"], "label": world.PEOPLE[i]["label"]}
            for i in world.PARTIES[party_id]]


def pick_payload(rid: str, time_str: str, judge: str, instruction: str, reason: str) -> dict:
    r = world.RESTAURANTS[rid]
    return dict(restaurant=rid, restaurant_name=r["name"], rating=r["rating"], cuisine=r["cuisine"],
                time=time_str, judge=judge, instruction=instruction, reason=reason)


def party_payload(judge: str, score: float, n: int, bar: float, **extra) -> dict:
    return dict(judge=judge, score=round(score, 2), ate=round(score * n) if judge == "everyone_ate" else None,
                total=n, passed=score >= bar, threshold=bar, **extra)


def score_party(party_id: str, rid: str, time_str: str) -> dict:
    """Both judges on one booking. The seats always come from the honest walk —
    the table shows them whichever judge is on the switch."""
    ids = world.PARTIES[party_id]
    honest, seats = world.everyone_ate(ids, rid, time_str)
    rating, _ = world.rating_score(ids, rid, time_str)
    return {"honest": honest, "rating": rating, "seats": seats, "n": len(ids),
            "hungry": sum(1 for s in seats if not s["ate"])}

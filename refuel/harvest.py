"""Harvest: grade REAL dinners offline, mint failures into eval cases.

The level-02 judge is a checker function — it can grade conversations that
already happened. No agent re-runs. Failures become evalset cases whose
prompt is the group's actual words.

Usage:  uv run python refuel/harvest.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import uuid

from dotenv import load_dotenv
from google.cloud import bigquery

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env"), override=True)
sys.path.insert(0, ROOT)
import world  # noqa: E402
OUT = os.path.join(ROOT, "exam", "harvested.evalset.json")


def _event(type_, **payload):
    """A line the kitchen turns into a table event (TABLE_EMIT=json)."""
    if os.environ.get("TABLE_EMIT") == "json":
        print("@@event " + json.dumps({"type": type_, **payload}), flush=True)

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
DATASET = "table_analytics"
BAR = world.THRESHOLD

# Content shapes verified the hard way: $.text_summary / $.response, NOT $.text.
QUERY = f"""
SELECT u.invocation_id,
       JSON_VALUE(u.content, '$.text_summary') AS asked,
       JSON_VALUE(r.content, '$.response')     AS answered
FROM  `{PROJECT}.{DATASET}.agent_events` u
JOIN  `{PROJECT}.{DATASET}.agent_events` r USING (invocation_id)
WHERE u.event_type = 'USER_MESSAGE_RECEIVED'
  AND r.event_type = 'AGENT_RESPONSE'
"""

_TIME_RE = re.compile(r"(\d{1,2}:\d{2})")


def parse_decision(text: str):
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        return None, "19:00"
    try:
        d = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None, "19:00"
    rid = world.find_restaurant(str(d.get("restaurant", "")))
    t = _TIME_RE.search(str(d.get("time", "")))
    return rid, (t.group(1) if t else "19:00")


def mint_case(asked: str) -> dict:
    """One ADK evalset case: the group's actual words, no golden answer —
    the checker-function judge grades whatever the agent answers."""
    return {
        "eval_id": f"harvest_{uuid.uuid4().hex[:8]}",
        "conversation": [{
            "invocation_id": str(uuid.uuid4()),
            "user_content": {"parts": [{"text": asked}], "role": "user"},
            "final_response": None,
        }],
    }


def main() -> None:
    if not PROJECT:
        sys.exit("Set GOOGLE_CLOUD_PROJECT in .env")
    rows = list(bigquery.Client(project=PROJECT).query(QUERY).result())
    print(f"scored {len(rows)} historical conversations offline")

    failures = []
    for row in rows:
        pm = re.search(r"\((p\d+)\)", row.asked or "")
        party = world.PARTIES.get(pm.group(1)) if pm else None
        if party is None:
            print(f"  [skip]  no known party — the judge needs world context: "
                  f"{(row.asked or '')[:48]!r}")
            continue
        rid, time_str = parse_decision(row.answered)
        if rid is None:
            score, whys = 0.0, ["no parseable decision"]
        else:
            score, seats = world.everyone_ate(party, rid, time_str)
            whys = [f"{s['name']}: {s['why']}" for s in seats if not s["ate"]]
        verdict = "ok  " if score >= BAR else "mint"
        pick = world.RESTAURANTS[rid]["name"] if rid else "—"
        print(f"  [{verdict}]  {pm.group(1):<5}{pick:<18}{score:.2f}  {'; '.join(whys)[:52]}")
        if score < BAR:
            failures.append(row.asked)
            if rid is not None:
                for s_ in seats:
                    if not s_["ate"]:
                        _event("outcome_returned", person_id=s_["id"], name=s_["name"], predicted=True, actual=False,
                               why=f"{pick} — {s_['why']}", party=pm.group(1))
            _event("exam_minted", case_id=f"harvested-{pm.group(1)}", from_outcome="; ".join(whys)[:160])

    print(f"{len(failures)} failures (score < {BAR})")
    if failures:
        out = {
            "eval_set_id": "harvested",
            "name": "harvested",
            "eval_cases": [mint_case(a) for a in failures],
            "creation_timestamp": 0.0,
        }
        with open(OUT, "w") as f:
            json.dump(out, f, indent=2)
        print(f"minted -> {os.path.relpath(OUT, ROOT)}  "
              "(production failures are next round's exam)")


if __name__ == "__main__":
    main()

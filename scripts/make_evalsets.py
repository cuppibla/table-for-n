"""Generate the lab's evalsets from world.py. Re-run after ANY world edit.

    exam/parties_train.evalset.json         — 8 parties the optimizer will see (host)
    exam/parties_val.evalset.json           — 8 holdout parties, 36 seats (host, courses II–VI)
    exam/concierge_trajectory.evalset.json  — 8 holdout parties with golden tool trajectories (course VIII)
    exam/concierge_multiturn.evalset.json   — 4 dynamic ConversationScenarios with NOVICE persona (course IX)

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


def golden_pick(party_id: str) -> tuple[str, str]:
    """The highest-rated room, at the earliest time, that feeds everyone."""
    ids = world.PARTIES[party_id]
    for rid, _ in sorted(world.RESTAURANTS.items(), key=lambda kv: -kv[1]["rating"]):
        for t in TIMES:
            score, _ = world.everyone_ate(ids, rid, t)
            if score >= 1.0:
                return rid, t
    raise SystemExit(f"{party_id}: no booking feeds everyone — fix world.py")


def golden(party_id: str) -> dict:
    rid, t = golden_pick(party_id)
    ids = world.PARTIES[party_id]
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


def make_trajectory(name: str, party_ids: list[str]) -> dict:
    """Course VIII: the 8 holdout parties without restaurant cards in the prompt,
    paired with a 3-step golden reference trajectory in `intermediate_data` so
    ADK's built-in `tool_trajectory_avg_score` has a reference path to compare."""
    cases = []
    for pid in party_ids:
        rid, t = golden_pick(pid)
        g = golden(pid)
        ids = world.PARTIES[pid]
        cases.append({
            "eval_id": pid,
            "conversation": [{
                "invocation_id": f"traj-{pid}",
                "user_content": {"parts": [{"text": world.concierge_brief(pid)}], "role": "user"},
                "final_response": {"parts": [{"text": json.dumps(g)}], "role": "model"},
                "intermediate_data": {
                    "tool_uses": [
                        {"name": "list_restaurants", "args": {}},
                        {"name": "inspect_kitchen", "args": {"restaurant_id": rid}},
                        {"name": "book_table", "args": {"party_size": len(ids), "restaurant_id": rid, "time": t}},
                    ],
                    "intermediate_responses": [],
                },
            }],
            "session_input": {"app_name": "concierge", "user_id": "lab", "state": {}},
        })
    return {"eval_set_id": name, "name": name, "eval_cases": cases, "creation_timestamp": 0.0}


MULTITURN_SCENARIOS = [
    ("p1",
     "Hey! Can you book a dinner table tonight for the 5 of us (p1 — Nadia, Tom, Amara, Lena, and Ben)?",
     "You are coordinating dinner for 5 friends (party p1): Nadia, Tom, Amara, Lena, and Ben. "
     "Do NOT volunteer dietary, budget, walking, or timing details unless the concierge asks. "
     "When the concierge asks about constraints, share ALL of them clearly in one reply: "
     "(1) Nadia is strictly vegan (plant-based only), (2) Tom has a hard $25/person max budget, "
     "(3) Amara is on crutches and can walk at most 10 minutes, (4) Ben has zero requirements, and "
     "(5) curveball — Lena just texted that her train is late so she cannot arrive before 19:45 (7:45 PM), "
     "and she needs the kitchen to still be taking orders when she arrives. "
     "Once the concierge books a valid table (such as Pho Saigon at 19:45) and confirms, thank them and finish."),
    ("p2",
     "Hi! Looking to grab dinner tonight for 4 people (p2 — Sam, Lena, Tom, and Ben). Can you book us somewhere?",
     "You are coordinating dinner for 4 friends (party p2): Sam, Lena, Tom, and Ben. "
     "Hold back restrictions until the concierge asks. When asked, share ALL of them clearly in one reply: "
     "(1) Sam has a shellfish allergy including sneaky fish sauce, (2) Tom has a strict $25/person max budget, "
     "(3) Lena cannot arrive before 19:45 (7:45 PM), and (4) Ben has no requirements (walking distance and spice are fine for this group). "
     "Once the concierge books a valid table (such as Curry House or Noodle Bar at 19:45) and confirms, thank them and finish."),
    ("p10",
     "Could you book an early-ish dinner tonight for 5 of us (p10 — Priya, Sam, Tom, Yuki, and Diego)?",
     "You are coordinating dinner for 5 friends (party p10): Priya, Sam, Tom, Yuki, and Diego. "
     "Wait until the concierge asks about dietary/budget/timing needs before sharing them. When asked, share ALL of them clearly in one reply: "
     "(1) Priya has a severe nut allergy (epipen — no peanuts, cashews, or pine nuts), "
     "(2) Sam has a shellfish allergy including fish sauce, (3) Tom has a strict $25/person budget cap, "
     "(4) Diego cannot do spicy food unless spice/salsa is strictly on the side, and "
     "(5) Yuki has daycare pickup and MUST leave by 19:15 (7:15 PM), so the table must be seated by 18:30 or earlier for a 45-minute dinner. "
     "Once the concierge books a valid table (such as Taqueria Luna at 18:00 or 18:30) and confirms, thank them and finish."),
    ("p16",
     "Hey there — need a table for 4 tonight (p16 — Priya, Tom, Amara, and Ben). Where should we go?",
     "You are coordinating dinner for 4 friends (party p16): Priya, Tom, Amara, and Ben. "
     "Only reveal the group's constraints when the concierge asks. When asked, share ALL of them clearly in one reply: "
     "(1) Priya has a severe nut allergy (no peanuts, peanut oil, peanut sauce, cashews, or pine nuts), "
     "(2) Tom has a hard $25/person budget limit, (3) Amara is on crutches and can walk at most 10 minutes, "
     "and (4) Ben is free all evening with zero restrictions. "
     "Once the concierge books a valid table (such as Taqueria Luna) and confirms, thank them and finish."),
]


def make_multiturn(name: str) -> dict:
    """Course IX: dynamic multi-turn ConversationScenarios driven by ADK's LlmBackedUserSimulator."""
    cases = []
    for pid, start, plan in MULTITURN_SCENARIOS:
        cases.append({
            "eval_id": pid,
            "conversation_scenario": {
                "starting_prompt": start,
                "conversation_plan": plan,
                "user_persona": "NOVICE",
            },
            "session_input": {"app_name": "concierge", "user_id": "lab", "state": {}},
        })
    return {"eval_set_id": name, "name": name, "eval_cases": cases, "creation_timestamp": 0.0}


if __name__ == "__main__":
    for name, ids in [("parties_train", world.TRAIN), ("parties_val", world.HOLDOUT)]:
        data = make(name, ids)
        for folder in ("exam", "host"):
            path = os.path.join(ROOT, folder, f"{name}.evalset.json")
            with open(path, "w") as f:
                json.dump(data, f, indent=2)
            print(f"wrote {os.path.relpath(path, ROOT)}  ({len(ids)} cases, golden answers in)")

    traj = make_trajectory("concierge_trajectory", world.HOLDOUT)
    for folder in ("exam", "concierge"):
        path = os.path.join(ROOT, folder, "concierge_trajectory.evalset.json")
        with open(path, "w") as f:
            json.dump(traj, f, indent=2)
        print(f"wrote {os.path.relpath(path, ROOT)}  ({len(world.HOLDOUT)} cases, golden trajectories in)")

    mt = make_multiturn("concierge_multiturn")
    for folder in ("exam", "concierge"):
        path = os.path.join(ROOT, folder, "concierge_multiturn.evalset.json")
        with open(path, "w") as f:
            json.dump(mt, f, indent=2)
        print(f"wrote {os.path.relpath(path, ROOT)}  ({len(MULTITURN_SCENARIOS)} scenarios, NOVICE simulator)")

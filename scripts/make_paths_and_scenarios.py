"""Generate the second seating's two exams from world.py. Re-run after ANY world edit.

    exam/paths_{train,val}.evalset.json
        One turn, like course II — but the brief is the group chat only
        (world.chat_brief); the listings come from the maître d's tools. Each
        case carries course II's golden booking AND a golden tool path
        (list_rooms → get_room → book) for the trajectory comparator,
        tool_trajectory_avg_score. maitre_d/ gets a copy, so the workbench's
        Evals tab can run them too.

    exam/conversations_{train,val}.evalset.json
        No golden anything: one conversation_scenario per party. ADK's
        simulated organizer knows the group chat (the plan); the persona
        decides how much of it comes out before the agent asks. The plan and
        the persona are the exam paper. The val set is four of the eight
        holdout parties (TALK): a conversation is a few turns, each with a
        simulated organizer and the agent, and then the judges read it —
        four keeps a run near four minutes on a new project's quota (we
        measured three to five and a half).

    uv run python scripts/make_paths_and_scenarios.py               # persona EXPERT, as shipped
    uv run python scripts/make_paths_and_scenarios.py --persona NOVICE

Writes the eval set JSON directly, like make_evalsets.py, so the case ids stay
p1…p16. (`adk eval_set add_eval_case --scenarios_file` works too, but names
each case by a hash of its scenario: flip the persona and you get new cases
next to the old ones.)
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import world  # noqa: E402
from make_evalsets import golden  # noqa: E402  — the same golden booking as course II

APP = "maitre_d"

# The conversation exam's parties, from the holdout: p1 and p3 have one right
# room among several wrong ones, p16 has exactly one (and the draft maître d'
# talks itself out of it on the path exam), and p15 is the night the hottest
# room happens to feed everyone — the agent that never asks passes it anyway.
TALK = ["p1", "p3", "p15", "p16"]


def chat(pid: str) -> str:
    return "\n".join(f'  {world.PEOPLE[i]["name"]}: "{world.CHAT[i]}"' for i in world.PARTIES[pid])


def golden_path(pid: str, g: dict) -> list[dict]:
    """The one path a comparator can hold: look the room up, then book it."""
    rid = world.find_restaurant(g["restaurant"])
    return [{"name": "list_rooms", "args": {}},
            {"name": "get_room", "args": {"room": rid}},
            {"name": "book", "args": {"room": rid, "time": g["time"], "party_size": len(world.PARTIES[pid])}}]


def path_case(pid: str) -> dict:
    g = golden(pid)
    return {
        "eval_id": pid,
        "conversation": [{
            "invocation_id": f"inv-{pid}",
            "user_content": {"parts": [{"text": world.chat_brief(pid)}], "role": "user"},
            "final_response": {"parts": [{"text": json.dumps(g)}], "role": "model"},
            "intermediate_data": {"tool_uses": golden_path(pid, g), "intermediate_responses": []},
        }],
        "session_input": {"app_name": APP, "user_id": "lab", "state": {}},
    }


def scenario(pid: str, persona: str) -> dict:
    ids = world.PARTIES[pid]
    names = ", ".join(world.PEOPLE[i]["name"] for i in ids)
    return {
        "starting_prompt": f"Tonight's dinner ({pid}) — {len(ids)} going. Can you book us a table?",
        "conversation_plan": (
            f"You are organizing tonight's dinner for {len(ids)}: {names}. Your goal is one table "
            f"that works for everyone. This group chat is everything you know:\n{chat(pid)}\n\n"
            "Whenever you pass on what someone said, name them and use their words from the chat. "
            "Never invent a need that is not in the chat. Once the agent confirms a booking, "
            "your goal is done."
        ),
        # EXPERT volunteers the details and corrects mistakes; NOVICE waits to be asked
        "user_persona": persona,
    }


def scenario_case(pid: str, persona: str) -> dict:
    return {"eval_id": pid, "conversation_scenario": scenario(pid, persona),
            "session_input": {"app_name": APP, "user_id": "lab", "state": {}}}


def eval_set(name: str, cases: list[dict]) -> dict:
    return {"eval_set_id": name, "name": name, "eval_cases": cases, "creation_timestamp": 0.0}


def main(persona: str) -> list[str]:
    written = []
    for split, ids, talk in (("train", world.TRAIN, world.TRAIN), ("val", world.HOLDOUT, TALK)):
        for kind, make, parties, folders in (
                ("paths", path_case, ids, ("exam", APP)),
                ("conversations", lambda p: scenario_case(p, persona), talk, ("exam",))):
            name = f"{kind}_{split}"
            data = eval_set(name, [make(pid) for pid in parties])
            # exam/ is where the page and `adk eval` read them by path; the
            # workbench lists the eval sets in the agent's own folder
            for folder in folders:
                path = os.path.join(ROOT, folder, f"{name}.evalset.json")
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                    f.write("\n")
                written.append(path)
    return written


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--persona", default="EXPERT", choices=["EXPERT", "NOVICE", "EVALUATOR"])
    a = ap.parse_args()
    for p in main(a.persona):
        print(f"wrote {os.path.relpath(p, ROOT)}")

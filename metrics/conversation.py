"""Did the agent ask before it booked? The conversation checker.

The multi-turn twin of the path checker's `looked_before_booking`. For every
guest with a hard need: had the organizer said it out loud, by name, before
the agent's FIRST `book` call? It reads the organizer's turns and the tool
calls, nothing else — no model, no golden transcript (a conversation has
none: the organizer is simulated, and says what the agent's questions draw out).

"Said it" is a heuristic, and it says so: the guest's name and a cue for
their kind of need (CUES) in the same organizer turn. It depends on the
simulated organizer passing needs on by name, which is what the scenario's
plan tells it to do — and why the simulator gets a judge of its own
(per_turn_user_simulator_quality_v1).
"""
from __future__ import annotations

import re

from google.adk.evaluation.eval_case import get_all_tool_calls
from google.adk.evaluation.eval_metrics import EvalStatus
from google.adk.evaluation.evaluator import EvaluationResult

from metrics.table import _user_text, conversation_result, party_id_of, party_of, receipt, world

# What each kind of need sounds like when someone says it out loud.
CUES = {
    "vegetarian": r"meat|veg",
    "vegan": r"plant|vegan",
    "nut": r"\bnut",
    "shellfish": r"shellfish|fish sauce",
    "leaves": r"7:15|19:15|daycare|pick ?up|leave",
    "arrives": r"7:45|19:45|get there|arriv|\blate\b",
    "budget": r"\$\s?25|25 a head|budget",
    "max_walk": r"crutch|walk|on foot",
    "max_spice": r"spic",
}


def _kind(person: dict) -> str | None:
    for key in ("diet", "allergy"):
        if key in person:
            return person[key]
    return next((k for k in ("leaves", "arrives", "budget", "max_walk", "max_spice") if k in person), None)


def asked_before_booking_metric(eval_metric, actual_invocations, expected_invocations=None,
                                scenario=None):
    if not actual_invocations:  # no conversation at all is a fail, not a skip
        return EvaluationResult(overall_score=0.0, overall_eval_status=EvalStatus.FAILED,
                                per_invocation_results=[])
    ids = party_of(actual_invocations, scenario) or []
    constrained = [pid for pid in ids if _kind(world.PEOPLE[pid])]
    heard: set[str] = set()
    booked_on = None
    for turn, inv in enumerate(actual_invocations):
        said = _user_text(inv).lower()           # the organizer speaks first in each turn…
        for pid in constrained:
            p = world.PEOPLE[pid]
            if p["name"].lower() in said and re.search(CUES[_kind(p)], said):
                heard.add(pid)
        if any(c.name == "book" for c in get_all_tool_calls(inv.intermediate_data)):
            booked_on = turn                     # …then the agent acts. Stop at the first booking.
            break
    score = len(heard) / len(constrained) if constrained else 1.0
    status = EvalStatus.PASSED if score >= 1.0 else EvalStatus.FAILED
    receipt({"metric": "asked_before_booking", "party": party_id_of(actual_invocations, scenario),
             "score": round(score, 4), "heard": [world.PEOPLE[p]["name"] for p in constrained if p in heard],
             "missed": [world.PEOPLE[p]["name"] for p in constrained if p not in heard],
             "booked_on_turn": None if booked_on is None else booked_on + 1, "turns": len(actual_invocations)})
    return conversation_result(actual_invocations, round(score, 4), status)

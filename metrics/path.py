"""The path checker — did the booking come from looking?

The first seating's checker, everyone_ate, grades the dinner. This one grades
how the agent got there: four rules over the tool calls, each with a why. It
reads `intermediate_data`, never a golden path, so it grades a one-turn case,
a simulated conversation and a production trace alike.

    looked_before_booking   it called get_room on every room before it booked it
    booked_once             one reservation; each extra one is a no-show somewhere
    booked_whole_party      party_size == the number of people going
    reply_matches_booking   the JSON reply names the table it actually reserved

What it does NOT check is whether the room was right — that stays
everyone_ate's job. A path can hold up and still feed nobody (it looked at
Smoke & Barrel, read "peanut oil", and booked it anyway): that is a reasoning
failure, and the lever for it is not the same as for a process failure.

Signature required by ADK's _CustomMetricEvaluator:
    fn(eval_metric, actual_invocations, expected_invocations, scenario) -> EvaluationResult
"""
from __future__ import annotations

from google.adk.evaluation.eval_case import get_all_tool_calls_with_responses
from google.adk.evaluation.eval_metrics import EvalStatus
from google.adk.evaluation.evaluator import EvaluationResult

from metrics.table import conversation_result, party_id_of, party_of, receipt, reply_of, world

RULES = ("looked_before_booking", "booked_once", "booked_whole_party", "reply_matches_booking")


def tool_calls(invocations) -> list[dict]:
    """Every tool call in the conversation, in order, with what it returned."""
    out = []
    for turn, inv in enumerate(invocations):
        for call, resp in get_all_tool_calls_with_responses(inv.intermediate_data):
            out.append({"turn": turn, "name": call.name, "args": dict(call.args or {}),
                        "response": dict(resp.response or {}) if resp else None})
    return out


def _room(args: dict) -> str | None:
    return world.find_restaurant(str(args.get("room", "")))


def _name(rid: str | None) -> str:
    return world.RESTAURANTS[rid]["name"] if rid in world.RESTAURANTS else "nothing"


def _minutes(hhmm) -> int | None:
    try:
        return world._t(str(hhmm).strip())  # noqa: SLF001
    except (ValueError, AttributeError):
        return None


def _size(value) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def path_checks(calls: list[dict], party_ids: list[str] | None, reply) -> list[dict]:
    """-> [{"rule", "ok", "why"}], the four rules in order."""
    looked, unlooked, books = set(), [], []
    for c in calls:
        rid = _room(c["args"])
        if c["name"] == "get_room" and rid:
            looked.add(rid)
        elif c["name"] == "book":
            books.append({"room": rid, "time": str(c["args"].get("time", "")),
                          "size": _size(c["args"].get("party_size"))})
            if rid not in looked:
                unlooked.append(rid)
    final = books[-1] if books else None
    going = len(party_ids or [])
    reply_rid, reply_time = reply
    no_shows = ", ".join(f"{_name(b['room'])} {b['time']}" for b in books[:-1])
    return [
        {"rule": "looked_before_booking", "ok": bool(books) and not unlooked,
         "why": ("no table was booked" if not books else
                 f"booked {', '.join(_name(r) for r in unlooked)} without calling get_room on it"
                 if unlooked else "called get_room on the room before booking it")},
        {"rule": "booked_once", "ok": len(books) == 1,
         "why": f"{len(books)} reservation{'' if len(books) == 1 else 's'}"
                + (f" — a no-show at {no_shows}" if no_shows else "")},
        {"rule": "booked_whole_party", "ok": bool(final) and final["size"] == going,
         "why": f"booked for {final['size'] if final else '—'}; {going} are going"},
        {"rule": "reply_matches_booking",
         "ok": bool(final) and reply_rid == final["room"]
               and _minutes(reply_time) == _minutes(final["time"]),
         "why": (f"the reply says {_name(reply_rid)} {reply_time}; the reservation is "
                 + (f"{_name(final['room'])} {final['time']}" if final else "nothing"))},
    ]


def path_metric(eval_metric, actual_invocations, expected_invocations=None, scenario=None):
    if not actual_invocations:  # no conversation at all is a fail, not a skip
        return EvaluationResult(overall_score=0.0, overall_eval_status=EvalStatus.FAILED,
                                per_invocation_results=[])
    calls = tool_calls(actual_invocations)
    rules = path_checks(calls, party_of(actual_invocations, scenario), reply_of(actual_invocations))
    score = sum(r["ok"] for r in rules) / len(rules)
    # A path holds up or it doesn't: one broken rule fails the case. As with
    # everyone_ate, the verdict is ours — ADK will not apply the threshold.
    status = EvalStatus.PASSED if all(r["ok"] for r in rules) else EvalStatus.FAILED
    receipt({"metric": "path", "party": party_id_of(actual_invocations, scenario), "score": round(score, 4),
             "rules": rules, "calls": [{"turn": c["turn"], "name": c["name"], "args": c["args"]} for c in calls],
             "turns": len(actual_invocations)})
    return conversation_result(actual_invocations, score, status)

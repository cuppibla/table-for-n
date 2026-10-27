"""Custom ADK eval metrics for Table for N.

Two judges, same parser (the loop-lab pattern):
  * everyone_ate_metric — the HONEST judge. Walks the table seat by seat
    against each person's hard constraints. Deterministic, no LLM.
  * rating_metric      — the GAMEABLE judge. Returns the restaurant's star
    rating. Blind to whether anyone eats.

Signature required by ADK's _CustomMetricEvaluator:
    fn(eval_metric, actual_invocations, expected_invocations, scenario) -> EvaluationResult

One verdict per dinner, however many turns it took. WHO is invited comes from
the first turn (or the scenario's starting prompt, the fourth argument); WHAT
got booked is the last `book` tool call when the agent has one (the maître d'),
else its last reply that names a room (the host). A reply is a claim; with a
booking tool, the call is the result. Earlier turns come back NOT_EVALUATED,
the way ADK's own multi-turn metrics mark them. On a one-turn case — every
case in courses II–VII — this is exactly the verdict it always was.
"""
from __future__ import annotations

import json
import os
import re
import sys

from google.adk.evaluation.eval_case import get_all_tool_calls
from google.adk.evaluation.eval_metrics import EvalStatus
from google.adk.evaluation.evaluator import EvaluationResult, PerInvocationResult

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import world  # noqa: E402


def _text(parts) -> str:
    if not parts:
        return ""
    return "".join(p.text for p in parts if getattr(p, "text", None))


def _final_text(inv) -> str:
    resp = getattr(inv, "final_response", None)
    return _text(getattr(resp, "parts", None))


def _user_text(inv) -> str:
    uc = getattr(inv, "user_content", None)
    return _text(getattr(uc, "parts", None))


def _parse_decision(text: str) -> dict | None:
    text = re.sub(r"^```(?:json)?|```$", "", (text or "").strip(), flags=re.M).strip()
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except Exception:
            return None


_PARTY_RE = re.compile(r"\((p\d+)\)")
_TIME_RE = re.compile(r"^\s*(\d{1,2}:\d{2})")


def _decision_parts(inv) -> tuple[str | None, str]:
    """-> (restaurant_id | None, time 'HH:MM'). Missing/odd time falls back to 19:00."""
    decision = _parse_decision(_final_text(inv)) or {}
    rid = world.find_restaurant(str(decision.get("restaurant", "")))
    m = _TIME_RE.match(str(decision.get("time", "")))
    return rid, (m.group(1) if m else "19:00")


# ── a dinner may take more than one turn ─────────────────────────────────────
def party_id_of(invocations, scenario=None) -> str | None:
    """'p3' — read from the first turn, else from the scenario's starting prompt.
    Turn 3 of a conversation does not repeat "(p3)"."""
    m = _PARTY_RE.search(_user_text(invocations[0])) if invocations else None
    if m is None and scenario is not None:
        m = _PARTY_RE.search(getattr(scenario, "starting_prompt", "") or "")
    return m.group(1) if m else None


def party_of(invocations, scenario=None) -> list[str] | None:
    """Who is invited: the people of that party."""
    return world.PARTIES.get(party_id_of(invocations, scenario) or "")


def reply_of(invocations) -> tuple[str | None, str]:
    """The last reply that names a restaurant -> (restaurant_id, 'HH:MM').
    If none does, the last reply's (None, time), as a one-turn case always read."""
    for inv in reversed(invocations):
        rid, time_str = _decision_parts(inv)
        if rid:
            return rid, time_str
    return _decision_parts(invocations[-1]) if invocations else (None, "19:00")


def booking_of(invocations) -> tuple[str | None, str, str]:
    """What got booked -> (restaurant_id, 'HH:MM', 'reservation' | 'reply'):
    the last `book` tool call if the agent has the tool, else the last reply."""
    for inv in reversed(invocations):
        books = [c for c in get_all_tool_calls(inv.intermediate_data) if c.name == "book"]
        if books:
            args = dict(books[-1].args or {})
            m = _TIME_RE.match(str(args.get("time", "")))
            return world.find_restaurant(str(args.get("room", ""))), (m.group(1) if m else "19:00"), "reservation"
    rid, time_str = reply_of(invocations)
    return rid, time_str, "reply"


def conversation_result(actual_invocations, score: float, status: EvalStatus) -> EvaluationResult:
    """One verdict for the whole dinner, carried by the last turn."""
    per = [PerInvocationResult(actual_invocation=inv, eval_status=EvalStatus.NOT_EVALUATED)
           for inv in actual_invocations[:-1]]
    per.append(PerInvocationResult(actual_invocation=actual_invocations[-1], score=score, eval_status=status))
    overall = round(score, 4)
    return EvaluationResult(overall_score=overall, overall_eval_status=status, per_invocation_results=per)


# ADK's _CustomMetricEvaluator nulls eval_metric.threshold before calling us, and
# LocalEvalService reads eval_status DIRECTLY (it does NOT apply the threshold for
# custom metrics). The metric MUST set PASSED/FAILED itself. Thresholds live in
# world.py: THRESHOLD (honest) and RATING_BAR (gameable).


def _status(score, threshold):
    # THE verdict. ADK does not apply your threshold to custom metrics —
    # whatever eval_status this function returns IS the result. (An early
    # build returned PASSED unconditionally here: six hungry people, all
    # green. If your metric never says FAILED, nothing ever fails.)
    return EvalStatus.PASSED if score >= threshold else EvalStatus.FAILED


def receipt(row: dict) -> None:
    """One line per verdict, for the table. Only when the kitchen asks
    (TABLE_RECEIPTS=<path>); `adk eval` on its own writes nothing extra."""
    path = os.environ.get("TABLE_RECEIPTS")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")


def _build(scorer, threshold, actual_invocations, scenario=None, metric="everyone_ate"):
    if not actual_invocations:  # no dinner at all is a fail, not a skip
        return EvaluationResult(overall_score=0.0, overall_eval_status=_status(0.0, threshold),
                                per_invocation_results=[])
    ids = party_of(actual_invocations, scenario)
    rid, time_str, graded = booking_of(actual_invocations)
    s, detail = scorer(ids, rid, time_str) if (ids and rid) else (0.0, [])
    row = {"metric": metric, "party": party_id_of(actual_invocations, scenario), "restaurant": rid,
           "time": time_str, "score": round(s, 4), "answer": _final_text(actual_invocations[-1])[:400],
           "graded": graded, "turns": len(actual_invocations)}
    if metric == "everyone_ate":
        row["seats"] = detail
    receipt(row)
    return conversation_result(actual_invocations, s, _status(round(s, 4), threshold))


def everyone_ate_metric(eval_metric, actual_invocations, expected_invocations=None, scenario=None):
    return _build(world.everyone_ate, world.THRESHOLD, actual_invocations, scenario, "everyone_ate")


def rating_metric(eval_metric, actual_invocations, expected_invocations=None, scenario=None):
    return _build(world.rating_score, world.RATING_BAR, actual_invocations, scenario, "rating")

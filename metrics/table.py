"""Custom ADK eval metrics for Table for N.

Two judges, same parser (the loop-lab pattern):
  * everyone_ate_metric — the HONEST judge. Walks the table seat by seat
    against each person's hard constraints. Deterministic, no LLM.
  * rating_metric      — the GAMEABLE judge. Returns the restaurant's star
    rating. Blind to whether anyone eats.

Signature required by ADK's _CustomMetricEvaluator:
    fn(eval_metric, actual_invocations, expected_invocations, scenario) -> EvaluationResult
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


def _party_ids(inv) -> list[str] | None:
    m = _PARTY_RE.search(_user_text(inv))
    return world.PARTIES.get(m.group(1)) if m else None


def _decision_parts(inv) -> tuple[str | None, str]:
    """-> (restaurant_id | None, time 'HH:MM'). Missing/odd time falls back to 19:00."""
    decision = _parse_decision(_final_text(inv)) or {}
    rid = world.find_restaurant(str(decision.get("restaurant", "")))
    m = _TIME_RE.match(str(decision.get("time", "")))
    return rid, (m.group(1) if m else "19:00")


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


def _receipt(metric: str, inv, ids, rid, time_str, score, detail) -> None:
    """One line per verdict, for the table. Only when the kitchen asks
    (TABLE_RECEIPTS=<path>); `adk eval` on its own writes nothing extra."""
    path = os.environ.get("TABLE_RECEIPTS")
    if not path:
        return
    m = _PARTY_RE.search(_user_text(inv))
    row = {"metric": metric, "party": m.group(1) if m else None, "restaurant": rid,
           "time": time_str, "score": round(score, 4), "answer": _final_text(inv)[:400]}
    if metric == "everyone_ate":
        row["seats"] = detail
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")


def _build(scorer, threshold, actual_invocations, metric="everyone_ate"):
    per, scores = [], []
    for inv in actual_invocations:
        ids = _party_ids(inv)
        rid, time_str = _decision_parts(inv)
        s, detail = scorer(ids, rid, time_str) if (ids and rid) else (0.0, [])
        _receipt(metric, inv, ids, rid, time_str, s, detail)
        scores.append(s)
        per.append(PerInvocationResult(
            actual_invocation=inv, score=s, eval_status=_status(s, threshold),
        ))
    overall = round(sum(scores) / len(scores), 4) if scores else 0.0
    return EvaluationResult(
        overall_score=overall,
        overall_eval_status=_status(overall, threshold),
        per_invocation_results=per,
    )


def everyone_ate_metric(eval_metric, actual_invocations, expected_invocations=None, scenario=None):
    return _build(world.everyone_ate, world.THRESHOLD, actual_invocations, "everyone_ate")


def rating_metric(eval_metric, actual_invocations, expected_invocations=None, scenario=None):
    return _build(world.rating_score, world.RATING_BAR, actual_invocations, "rating")


# ------------------------------------------- trajectory & multi-turn judges

_ANY_PARTY_RE = re.compile(r"\b(p\d{1,2})\b")


def _calls_of(inv) -> list[dict]:
    calls = get_all_tool_calls(getattr(inv, "intermediate_data", None))
    return [{"name": fc.name, "args": dict(fc.args or {})} for fc in calls if getattr(fc, "name", None)]


def _party_id_from(actual_invocations, scenario=None) -> str | None:
    blobs = []
    if scenario is not None:
        blobs.append(str(getattr(scenario, "starting_prompt", "") or ""))
        blobs.append(str(getattr(scenario, "conversation_plan", "") or ""))
    blobs.extend(_user_text(inv) for inv in actual_invocations)
    for b in blobs:
        m = _PARTY_RE.search(b) or _ANY_PARTY_RE.search(b)
        if m and m.group(1) in world.PARTIES:
            return m.group(1)
    return None


def _write_receipt_row(row: dict) -> None:
    path = os.environ.get("TABLE_RECEIPTS")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")


def kitchen_ticket_metric(eval_metric, actual_invocations, expected_invocations=None, scenario=None):
    """Course VIII's trajectory checker: reads `intermediate_data` tool calls AND the final reply."""
    per, scores = [], []
    for inv in actual_invocations:
        pid = _party_id_from([inv], scenario=scenario)
        ids = world.PARTIES.get(pid) if pid else None
        rid, time_str = _decision_parts(inv)
        calls = _calls_of(inv)
        if ids:
            s, detail = world.ticket_check(ids, calls, final_rid=rid, final_time=time_str)
        else:
            s, detail = 0.0, {"seats": [], "whys": ["unknown party"], "checks": {}, "restaurant": rid, "time": time_str, "tool_calls": len(calls)}
        _write_receipt_row({
            "metric": "kitchen_ticket",
            "party": pid,
            "restaurant": detail.get("restaurant"),
            "time": detail.get("time"),
            "score": round(s, 4),
            "answer": _final_text(inv)[:400],
            "calls": calls,
            "checks": detail.get("checks", {}),
            "seats": detail.get("seats", []),
            "whys": detail.get("whys", []),
        })
        scores.append(s)
        per.append(PerInvocationResult(
            actual_invocation=inv, score=s, eval_status=_status(s, world.THRESHOLD),
        ))
    overall = round(sum(scores) / len(scores), 4) if scores else 0.0
    return EvaluationResult(
        overall_score=overall,
        overall_eval_status=_status(overall, world.THRESHOLD),
        per_invocation_results=per,
    )


def multiturn_dinner_metric(eval_metric, actual_invocations, expected_invocations=None, scenario=None):
    """Course IX's multi-turn checker: wakes up `scenario`, leaves intermediate
    clarification turns NOT_EVALUATED, and grades the whole conversation once."""
    if not actual_invocations:
        return EvaluationResult(overall_score=0.0, overall_eval_status=EvalStatus.FAILED, per_invocation_results=[])

    pid = _party_id_from(actual_invocations, scenario=scenario)
    ids = world.PARTIES.get(pid) if pid else None
    turns = [{"user": _user_text(inv), "tools": _calls_of(inv), "agent": _final_text(inv)} for inv in actual_invocations]

    final_rid, final_time = None, "19:00"
    for inv in reversed(actual_invocations):
        r, t = _decision_parts(inv)
        if r is not None:
            final_rid, final_time = r, t
            break

    if ids:
        score, detail = world.multiturn_check(ids, turns, final_rid=final_rid, final_time=final_time)
    else:
        score, detail = 0.0, {"passed": False, "elicited": False, "seats": [], "whys": ["unknown party"], "restaurant": final_rid, "time": final_time}

    _write_receipt_row({
        "metric": "multiturn_dinner",
        "party": pid,
        "restaurant": detail.get("restaurant"),
        "time": detail.get("time"),
        "score": round(score, 4),
        "elicited": detail.get("elicited", False),
        "turn_count": len(turns),
        "turns": turns,
        "seats": detail.get("seats", []),
        "whys": detail.get("whys", []),
        "answer": turns[-1]["agent"][:400],
    })

    verdict = _status(score, world.THRESHOLD)
    per = [
        PerInvocationResult(actual_invocation=inv, score=None, eval_status=EvalStatus.NOT_EVALUATED)
        for inv in actual_invocations[:-1]
    ] + [
        PerInvocationResult(actual_invocation=actual_invocations[-1], score=score, eval_status=verdict)
    ]
    return EvaluationResult(
        overall_score=score,
        overall_eval_status=verdict,
        per_invocation_results=per,
    )

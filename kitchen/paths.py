"""⚖ Eight paths, four comparators — course X.

One dinner (p3) and one golden path — list_rooms → get_room olive → book olive
18:00 for 6, the path `exam/paths_val.evalset.json` holds — and eight ways an
agent could have got to a booking. Each is graded for real, by the same code
`adk eval` runs:

  * ADK's trajectory comparator, tool_trajectory_avg_score, under EXACT,
    IN_ORDER, ANY_ORDER, and IN_ORDER with ignore_args
  * the path checker, metrics/path.py: four rules, each with a why
  * everyone_ate, on the reservation — and on the reply, where they differ

No model is called: every tool response is what maitre_d/tools.py returns.
The fourth judge is optional and is a model: ADK's
rubric_based_tool_use_quality_v1, one call per path (`judge=True`).

    p3 has ten right (room, time) answers at 15-minute steps, and any number
    of right orders to look in. A golden path holds one of them.
"""
from __future__ import annotations

import asyncio
import itertools
import json
import time
import warnings
from pathlib import Path

from google.adk.evaluation.app_details import AgentDetails, AppDetails
from google.adk.evaluation.eval_case import Invocation, InvocationEvent, InvocationEvents
from google.adk.evaluation.eval_metrics import EvalMetric, EvalStatus, ToolTrajectoryCriterion
from google.adk.evaluation.trajectory_evaluator import TrajectoryEvaluator
from google.genai import types

import world
from maitre_d import tools
from metrics import path as path_checker
from metrics import table

ROOT = Path(__file__).resolve().parents[1]
PARTY = "p3"
_ids = itertools.count()

L = ("list_rooms", {})


def G(room: str) -> tuple[str, dict]:
    return ("get_room", {"room": room})


def B(room: str, at: str, n: int = 6) -> tuple[str, dict]:
    return ("book", {"room": room, "time": at, "party_size": n})


# (id, label, what it shows, the calls in order, (room, time) the reply names)
ROWS = [
    ("A", "the golden path", "the one path the eval set holds", [L, G("olive"), B("olive", "18:00")], ("olive", "18:00")),
    ("B", "looked around first", "rang three rooms, booked the right one", [L, G("smoke"), G("bistro"), G("olive"), B("olive", "18:00")], ("olive", "18:00")),
    ("C", "the other right room", "Taqueria Luna feeds all six too", [L, G("taqueria"), B("taqueria", "17:30")], ("taqueria", "17:30")),
    ("D", "fifteen minutes later", "18:15 — Yuki still has an hour", [L, G("olive"), B("olive", "18:15")], ("olive", "18:15")),
    ("E", "never looked", "booked from the listing alone — everyone ate, by luck", [L, B("olive", "18:00")], ("olive", "18:00")),
    ("F", "booked twice", "a reservation at Smoke & Barrel nobody will show up for", [L, G("smoke"), B("smoke", "19:30"), G("olive"), B("olive", "18:00")], ("olive", "18:00")),
    ("G", "looked, booked it anyway", "read “peanut oil” and “19:30”, booked Smoke & Barrel", [L, G("smoke"), B("smoke", "19:30")], ("smoke", "19:30")),
    ("H", "the reply is not the reservation", "says Olive & Thyme; reserved Smoke & Barrel", [L, G("smoke"), B("smoke", "19:30")], ("olive", "18:00")),
]

MATCHES = [("EXACT", ToolTrajectoryCriterion.MatchType.EXACT, False),
           ("IN_ORDER", ToolTrajectoryCriterion.MatchType.IN_ORDER, False),
           ("ANY_ORDER", ToolTrajectoryCriterion.MatchType.ANY_ORDER, False),
           ("IN_ORDER · ignore_args", ToolTrajectoryCriterion.MatchType.IN_ORDER, True)]

# The LLM judge's rubric: what you can only describe, not write down as a rule.
RUBRICS = [
    ("looked_first", "Before calling book, the agent called get_room for the restaurant it booked."),
    ("acted_on_what_it_saw", "The agent did not book a restaurant whose get_room facts break a need that a guest "
                             "states in the group chat (diet, allergy, spice, budget, walking distance, arrival or leaving time)."),
    ("one_table", "The agent calls book exactly once."),
    ("whole_party", "The party_size passed to book equals the number of people in the group chat."),
]


def _decision(rid: str, at: str) -> str:
    return json.dumps({"restaurant": world.RESTAURANTS[rid]["name"], "time": at, "reason": "…"})


def invocation(calls: list[tuple[str, dict]], reply: tuple[str, str], brief: str | None = None) -> Invocation:
    """One turn: the brief, the calls with what the real tools return, the reply."""
    events = []
    for name, args in calls:
        cid = f"c{next(_ids)}"
        events.append(InvocationEvent(author="maitre_d", content=types.Content(role="model", parts=[
            types.Part(function_call=types.FunctionCall(id=cid, name=name, args=args))])))
        out = getattr(tools, name)(**args)
        out = {"result": out} if isinstance(out, list) else out
        events.append(InvocationEvent(author="maitre_d", content=types.Content(role="user", parts=[
            types.Part(function_response=types.FunctionResponse(id=cid, name=name, response=out))])))
    return Invocation(invocation_id=f"path-{next(_ids)}",
                      user_content=types.Content(role="user", parts=[types.Part(text=brief or world.chat_brief(PARTY))]),
                      final_response=types.Content(role="model", parts=[types.Part(text=_decision(*reply))]),
                      intermediate_data=InvocationEvents(invocation_events=events),
                      app_details=_app_details())


def _app_details() -> AppDetails:
    """The maître d's tool declarations — what the rubric judge reads to know
    what each tool does. Built from the same functions the agent runs."""
    from google.adk.tools.function_tool import FunctionTool
    with warnings.catch_warnings():                              # ADK flags the JSON-schema builder EXPERIMENTAL
        warnings.simplefilter("ignore", UserWarning)
        decls = [FunctionTool(f)._get_declaration() for f in (tools.list_rooms, tools.get_room, tools.book)]  # noqa: SLF001
    return AppDetails(agent_details={"maitre_d": AgentDetails(
        name="maitre_d", tool_declarations=[types.Tool(function_declarations=decls)])})


def golden() -> Invocation:
    """The expected invocation, read from the eval set the path exam runs."""
    from google.adk.evaluation.eval_set import EvalSet
    es = EvalSet.model_validate_json((ROOT / "exam" / "paths_val.evalset.json").read_text())
    return next(c for c in es.eval_cases if c.eval_id == PARTY).conversation[0]


def _comparator(inv: Invocation, expected: Invocation, match, ignore_args: bool) -> float:
    m = EvalMetric(metric_name="tool_trajectory_avg_score",
                   criterion=ToolTrajectoryCriterion(threshold=1.0, match_type=match, ignore_args=ignore_args))
    return TrajectoryEvaluator(eval_metric=m).evaluate_invocations([inv], [expected]).overall_score


async def _judge(inv: Invocation) -> dict:
    from google.adk.evaluation.eval_metrics import JudgeModelOptions, RubricsBasedCriterion
    from google.adk.evaluation.eval_rubrics import Rubric, RubricContent
    from google.adk.evaluation.rubric_based_tool_use_quality_v1 import RubricBasedToolUseV1Evaluator
    crit = RubricsBasedCriterion(threshold=0.75, judge_model_options=JudgeModelOptions(num_samples=1),
                                 rubrics=[Rubric(rubric_id=i, rubric_content=RubricContent(text_property=t)) for i, t in RUBRICS])
    ev = RubricBasedToolUseV1Evaluator(EvalMetric(metric_name="rubric_based_tool_use_quality_v1", threshold=0.75, criterion=crit))
    t0 = time.time()
    try:
        r = await ev.evaluate_invocations([inv], None)
    except Exception as exc:                                       # noqa: BLE001 — quota, auth: say so, don't crash the card
        return {"score": None, "passed": None, "why": f"{type(exc).__name__}: {exc}"[:200], "ms": int((time.time() - t0) * 1000)}
    per = r.per_invocation_results[0] if r.per_invocation_results else None
    failed = [s.rubric_id for s in (per.rubric_scores or []) if (s.score or 0) < 1] if per else []
    return {"score": None if r.overall_score is None else round(r.overall_score, 2),
            "passed": None if r.overall_eval_status == EvalStatus.NOT_EVALUATED else r.overall_eval_status == EvalStatus.PASSED,
            "why": ("no rubric broken" if not failed else "broke " + ", ".join(failed)), "ms": int((time.time() - t0) * 1000)}


def table_rows(judge: bool = False) -> dict:
    expected = golden()
    gold = [{"name": c.name, "args": dict(c.args or {})} for c in expected.intermediate_data.tool_uses]
    invs = [invocation(calls, reply) for _, _, _, calls, reply in ROWS]
    verdicts = asyncio.run(_judge_all(invs)) if judge else [None] * len(invs)
    rows = []
    for (rid_, label, note, calls, reply), inv, llm in zip(ROWS, invs, verdicts):
        rules = path_checker.path_checks(path_checker.tool_calls([inv]), world.PARTIES[PARTY], table.reply_of([inv]))
        booked_rid, booked_at, _ = table.booking_of([inv])
        ate_booking, seats = world.everyone_ate(world.PARTIES[PARTY], booked_rid, booked_at)
        ate_reply, _ = world.everyone_ate(world.PARTIES[PARTY], *reply)
        rows.append({
            "id": rid_, "label": label, "note": note,
            "calls": [{"name": n, "args": a} for n, a in calls],
            "reply": {"restaurant": world.RESTAURANTS[reply[0]]["name"], "time": reply[1]},
            "comparator": {name: _comparator(inv, expected, m, ign) for name, m, ign in MATCHES},
            "path": {"passed": all(r["ok"] for r in rules), "rules": rules},
            "everyone_ate": {"booking": round(ate_booking, 2), "reply": round(ate_reply, 2),
                             "hungry": [f"{s['name']}: {s['why']}" for s in seats if not s["ate"]]},
            "llm": llm,
        })
    right = sum(1 for rid, r in world.RESTAURANTS.items()
                for t in range(world._t(r["earliest"]), world._t(r.get("last_order", "21:30")) + 1, 15)  # noqa: SLF001
                if world.everyone_ate(world.PARTIES[PARTY], rid, world._fmt(t))[0] == 1.0)  # noqa: SLF001
    return {"party": PARTY, "people": [world.PEOPLE[i]["name"] for i in world.PARTIES[PARTY]],
            "golden": gold, "right_answers": right, "matches": [m[0] for m in MATCHES], "rows": rows,
            "judged": judge}


async def _judge_all(invs: list[Invocation]) -> list[dict]:
    out = []
    for inv in invs:                      # one at a time: a new project's per-minute quota is small
        out.append(await _judge(inv))
    return out

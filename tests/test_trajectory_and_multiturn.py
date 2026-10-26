"""Deterministic unit tests for Course VIII (trajectory) and Course IX (multi-turn).

No model calls — runs in ~50 ms alongside `tests/test_shipped.py`.
"""
from __future__ import annotations

import json
from google.genai import types
from google.adk.evaluation.conversation_scenarios import ConversationScenario
from google.adk.evaluation.eval_case import IntermediateData, Invocation
from google.adk.evaluation.eval_metrics import EvalStatus

import world
from metrics import table as table_metrics


def _inv(user_text: str, agent_text: str, tool_calls: list[tuple[str, dict]] | None = None) -> Invocation:
    fcs = [types.FunctionCall(name=n, args=a) for n, a in (tool_calls or [])]
    return Invocation(
        invocation_id="inv-test",
        user_content=types.Content(role="user", parts=[types.Part(text=user_text)]),
        final_response=types.Content(role="model", parts=[types.Part(text=agent_text)]),
        intermediate_data=IntermediateData(tool_uses=fcs),
    )


def test_trajectory_match_modes_expose_blind_spots():
    golden = [
        {"name": "list_restaurants", "args": {}},
        {"name": "inspect_kitchen", "args": {"restaurant_id": "pho"}},
        {"name": "book_table", "args": {"party_size": 5, "restaurant_id": "pho", "time": "19:45"}},
    ]
    explored = [
        {"name": "list_restaurants", "args": {}},
        {"name": "inspect_kitchen", "args": {"restaurant_id": "olive"}},
        {"name": "inspect_kitchen", "args": {"restaurant_id": "pho"}},
        {"name": "book_table", "args": {"party_size": 5, "restaurant_id": "pho", "time": "19:45"}},
    ]
    # EXACT punishes good exploration; IN_ORDER allows extra inspections.
    assert world.trajectory_match(explored, golden, "EXACT")[0] is False
    assert world.trajectory_match(explored, golden, "IN_ORDER")[0] is True

    # ANY_ORDER passes even when book_table ran BEFORE inspect_kitchen!
    backwards = [
        {"name": "list_restaurants", "args": {}},
        {"name": "book_table", "args": {"party_size": 5, "restaurant_id": "pho", "time": "19:45"}},
        {"name": "inspect_kitchen", "args": {"restaurant_id": "pho"}},
    ]
    assert world.trajectory_match(backwards, golden, "ANY_ORDER")[0] is True


def test_ticket_check_catches_phantom_blind_and_double_bookings():
    ids = world.PARTIES["p1"]  # Nadia, Tom, Amara, Lena, Ben -> Pho Saigon @ 19:45

    # 1. Valid exploration + single commit -> 1.0 PASSED
    good_calls = [
        {"name": "list_restaurants", "args": {"max_price": 25, "max_walk_min": 10}},
        {"name": "inspect_kitchen", "args": {"restaurant_id": "taqueria"}},
        {"name": "inspect_kitchen", "args": {"restaurant_id": "pho"}},
        {"name": "book_table", "args": {"restaurant_id": "Pho Saigon", "time": "19:45", "party_size": 5}},
    ]
    score, detail = world.ticket_check(ids, good_calls, final_rid="pho", final_time="19:45")
    assert score == 1.0 and detail["passed"] is True

    # 2. Phantom booking: right JSON answer, zero book_table calls -> FAILED
    score_ph, detail_ph = world.ticket_check(ids, good_calls[:-1], final_rid="pho", final_time="19:45")
    assert score_ph < world.THRESHOLD and detail_ph["passed"] is False
    assert any("phantom booking" in w for w in detail_ph["whys"])

    # 3. Blind booking: booked Pho Saigon without inspecting its kitchen -> FAILED
    blind = [
        {"name": "list_restaurants", "args": {}},
        {"name": "book_table", "args": {"restaurant_id": "pho", "time": "19:45", "party_size": 5}},
    ]
    score_bl, detail_bl = world.ticket_check(ids, blind, final_rid="pho", final_time="19:45")
    assert score_bl < world.THRESHOLD and detail_bl["passed"] is False
    assert any("never called inspect_kitchen" in w for w in detail_bl["whys"])

    # 4. Inspect AFTER book_table -> FAILED
    after = blind + [{"name": "inspect_kitchen", "args": {"restaurant_id": "pho"}}]
    score_af, detail_af = world.ticket_check(ids, after, final_rid="pho", final_time="19:45")
    assert score_af < world.THRESHOLD and detail_af["passed"] is False
    assert any("AFTER book_table" in w for w in detail_af["whys"])

    # 5. Double-booking -> FAILED
    dbl = good_calls + [{"name": "book_table", "args": {"restaurant_id": "taqueria", "time": "18:00", "party_size": 5}}]
    score_db, detail_db = world.ticket_check(ids, dbl, final_rid="pho", final_time="19:45")
    assert score_db < world.THRESHOLD and detail_db["passed"] is False
    assert any("double-booked" in w for w in detail_db["whys"])


def test_multiturn_metric_marks_intermediate_turns_not_evaluated_and_reads_scenario():
    scenario = ConversationScenario(
        starting_prompt="Hey! Can you book dinner tonight for 5 of us (p1 — Nadia, Tom, Amara, Lena, and Ben)?",
        conversation_plan="Party p1 constraints withheld until asked.",
    )
    # Eager failure: books blind on turn 1 before asking constraints
    eager_turn = _inv(
        scenario.starting_prompt,
        json.dumps({"restaurant": "Pho Saigon", "time": "19:45", "reason": "lucky guess"}),
        [("list_restaurants", {}), ("inspect_kitchen", {"restaurant_id": "pho"}),
         ("book_table", {"restaurant_id": "pho", "time": "19:45", "party_size": 5})],
    )
    bad = table_metrics.multiturn_dinner_metric(None, [eager_turn], scenario=scenario)
    assert bad.overall_eval_status == EvalStatus.FAILED
    assert bad.overall_score < world.THRESHOLD

    # Eliciting success: turn 1 asks (NOT_EVALUATED), turn 2 inspects & books once (PASSED)
    t1 = _inv(
        scenario.starting_prompt,
        "Happy to help! Any dietary restrictions, allergies, budget/walk limits, or arrival/departure times?",
        [],
    )
    t2 = _inv(
        "Nadia is vegan, Tom is capped at $25, Amara has a 10-min walk limit, and Lena arrives at 19:45.",
        json.dumps({"restaurant": "Pho Saigon", "time": "19:45", "reason": "Fits every constraint."}),
        [("list_restaurants", {"max_price": 25, "max_walk_min": 10}),
         ("inspect_kitchen", {"restaurant_id": "pho"}),
         ("book_table", {"restaurant_id": "pho", "time": "19:45", "party_size": 5})],
    )
    good = table_metrics.multiturn_dinner_metric(None, [t1, t2], scenario=scenario)
    assert good.overall_eval_status == EvalStatus.PASSED
    assert good.overall_score == 1.0
    assert good.per_invocation_results[0].eval_status == EvalStatus.NOT_EVALUATED
    assert good.per_invocation_results[1].eval_status == EvalStatus.PASSED

"""The second seating's judges, offline — no model is called.

    uv run pytest tests/test_second_seating.py

What they must keep true:

  * the ⚖ eight-paths card (course X) shows what it claims: four comparator
    settings, the path checker and everyone_ate, on eight real paths
  * the first seating did not move: every verdict in fixtures/replays.json
    grades exactly as it was recorded, now that everyone_ate reads
    conversations too
  * a conversation gets ONE verdict, carried by its last turn
  * the configs the 📝 buttons run resolve to ADK evaluators
  * the eval sets on disk are what the generators write from world.py
"""
from __future__ import annotations

import itertools
import json
from pathlib import Path

import pytest
from google.adk.evaluation.eval_case import Invocation, InvocationEvent, InvocationEvents
from google.adk.evaluation.eval_metrics import EvalStatus
from google.genai import types

import world
from maitre_d import tools
from metrics import conversation, path, table

ROOT = Path(__file__).resolve().parents[1]
_ids = itertools.count()


def turn(user: str, reply: str, calls=()) -> Invocation:
    """One invocation: what the organizer said, the tool calls (answered by
    the real maitre_d tools), and what the agent replied."""
    events = []
    for name, args in calls:
        cid = f"t{next(_ids)}"
        events.append(InvocationEvent(author="maitre_d", content=types.Content(role="model", parts=[
            types.Part(function_call=types.FunctionCall(id=cid, name=name, args=args))])))
        out = getattr(tools, name)(**args)
        events.append(InvocationEvent(author="maitre_d", content=types.Content(role="user", parts=[
            types.Part(function_response=types.FunctionResponse(
                id=cid, name=name, response={"result": out} if isinstance(out, list) else out))])))
    return Invocation(invocation_id=f"inv-{next(_ids)}",
                      user_content=types.Content(role="user", parts=[types.Part(text=user)]),
                      final_response=types.Content(role="model", parts=[types.Part(text=reply)]),
                      intermediate_data=InvocationEvents(invocation_events=events))


def booked(rid: str, at: str) -> str:
    return json.dumps({"restaurant": world.RESTAURANTS[rid]["name"], "time": at, "reason": "…"})


LOOK_AND_BOOK = [("list_rooms", {}), ("get_room", {"room": "olive"}),
                 ("book", {"room": "olive", "time": "18:00", "party_size": 6})]


# ── ⚖ course X: eight paths, four comparators ────────────────────────────────
EXPECTED = {   # comparator EXACT/IN_ORDER/ANY_ORDER/IN_ORDER·ignore_args, broken rule, everyone_ate (booking, reply)
    "A": ((1, 1, 1, 1), None, (1.0, 1.0)),
    "B": ((0, 1, 1, 1), None, (1.0, 1.0)),
    "C": ((0, 0, 0, 1), None, (1.0, 1.0)),
    "D": ((0, 0, 0, 1), None, (1.0, 1.0)),
    "E": ((0, 0, 0, 0), "looked_before_booking", (1.0, 1.0)),
    "F": ((0, 1, 1, 1), "booked_once", (1.0, 1.0)),
    "G": ((0, 0, 0, 1), None, (0.5, 0.5)),
    "H": ((0, 0, 0, 1), "reply_matches_booking", (0.5, 1.0)),
}


def test_eight_paths_four_comparators():
    from kitchen import paths
    card = paths.table_rows()
    assert card["right_answers"] == 10, "p3 has ten right (room, time) answers — the card says so"
    assert card["golden"] == [{"name": "list_rooms", "args": {}}, {"name": "get_room", "args": {"room": "olive"}},
                              {"name": "book", "args": {"room": "olive", "time": "18:00", "party_size": 6}}]
    assert [r["id"] for r in card["rows"]] == list(EXPECTED)
    for row in card["rows"]:
        comparators, broken, ate = EXPECTED[row["id"]]
        assert tuple(int(row["comparator"][m]) for m in card["matches"]) == comparators, row["id"]
        assert [r["rule"] for r in row["path"]["rules"] if not r["ok"]] == ([broken] if broken else []), row["id"]
        assert row["path"]["passed"] is (broken is None), row["id"]
        assert (row["everyone_ate"]["booking"], row["everyone_ate"]["reply"]) == ate, row["id"]


# ── the first seating did not move ───────────────────────────────────────────
RECORDED = [(e["judge"], e["instruction"], p) for e in json.loads((ROOT / "fixtures" / "replays.json").read_text())["exams"]
            if e["judge"] in ("everyone_ate", "rating") for p in e["parties"]]


@pytest.mark.parametrize("judge,instruction,row", RECORDED,
                         ids=[f"{j}-{i}-{r['party']}" for j, i, r in RECORDED])
def test_recorded_one_turn_verdicts_unchanged(judge, instruction, row):
    metric = table.everyone_ate_metric if judge == "everyone_ate" else table.rating_metric
    r = metric(None, [turn(world.brief(row["party"]), row["answer"])], None, None)
    assert r.overall_eval_status.name == row["status"]
    assert r.overall_score == pytest.approx(row["score"], abs=1e-4)
    assert [p.eval_status.name for p in r.per_invocation_results] == [row["status"]]


def test_no_dinner_is_a_fail_not_a_skip():
    for metric in (table.everyone_ate_metric, path.path_metric, conversation.asked_before_booking_metric):
        r = metric(None, [], None, None)
        assert r.overall_eval_status == EvalStatus.FAILED and r.overall_score == 0.0


# ── a conversation is one dinner ─────────────────────────────────────────────
def conversation_p3(book_on_first_turn: bool = False) -> list[Invocation]:
    if book_on_first_turn:
        return [turn("Tonight's dinner (p3) — 6 going. Can you book us a table?", booked("olive", "18:00"), LOOK_AND_BOOK)]
    return [
        turn("Tonight's dinner (p3) — 6 going. Can you book us a table?",
             "Happy to! Does anyone have food needs or allergies, or a time they have to be there by?"),
        turn('Marcus: "somewhere with a real veggie main please". Priya: "hard nut allergy over here". '
             'Diego: "spicy food: no. none."', "Got it. Any timing or distance limits?"),
        turn('Yuki: "daycare pickup at 7:15, cannot miss it". Amara: "on crutches — 10 minutes on foot is my ceiling". '
             "Ben has no requirements.", booked("olive", "18:00"), LOOK_AND_BOOK),
    ]


def test_a_conversation_gets_one_verdict_on_its_last_turn():
    r = table.everyone_ate_metric(None, conversation_p3(), None, None)
    # the old per-turn judge read "(p3)" only on turn 1 and a booking only on turn 3: 0.0
    assert [p.eval_status for p in r.per_invocation_results] == [
        EvalStatus.NOT_EVALUATED, EvalStatus.NOT_EVALUATED, EvalStatus.PASSED]
    assert r.overall_score == 1.0 and r.overall_eval_status == EvalStatus.PASSED


def test_the_reservation_outranks_the_reply(tmp_path, monkeypatch):
    receipts = tmp_path / "r.jsonl"
    monkeypatch.setenv("TABLE_RECEIPTS", str(receipts))
    inv = turn(world.chat_brief("p3"), booked("olive", "18:00"),
               [("list_rooms", {}), ("get_room", {"room": "smoke"}), ("book", {"room": "smoke", "time": "19:30", "party_size": 6})])
    r = table.everyone_ate_metric(None, [inv], None, None)
    assert r.overall_score == 0.5 and r.overall_eval_status == EvalStatus.FAILED
    row = json.loads(receipts.read_text().splitlines()[-1])
    assert (row["restaurant"], row["time"], row["graded"]) == ("smoke", "19:30", "reservation")


def test_the_party_can_come_from_the_scenario():
    from google.adk.evaluation.conversation_scenarios import ConversationScenario
    sc = ConversationScenario(starting_prompt="Tonight's dinner (p3) — 6 going. Can you book us a table?",
                              conversation_plan="…")
    invs = [turn("hi, can you book dinner?", booked("olive", "18:00"), LOOK_AND_BOOK)]
    assert table.party_id_of(invs) is None
    assert table.party_id_of(invs, sc) == "p3"
    assert table.everyone_ate_metric(None, invs, None, sc).overall_score == 1.0


def test_path_checker_reads_every_turn():
    r = path.path_metric(None, conversation_p3(), None, None)
    assert r.overall_eval_status == EvalStatus.PASSED and r.overall_score == 1.0
    assert r.per_invocation_results[-1].eval_status == EvalStatus.PASSED


# ── course XI: asked before it booked ────────────────────────────────────────
def test_every_need_in_the_chat_has_a_cue():
    """The organizer is told to pass needs on in the guests' own words: each
    guest's chat line, said with their name, must count as heard."""
    for pid, p in world.PEOPLE.items():
        kind = conversation._kind(p)
        if kind:
            said = f'{p["name"]}: "{world.CHAT[pid]}"'.lower()
            assert p["name"].lower() in said and conversation.re.search(conversation.CUES[kind], said), pid


def test_asked_before_booking():
    asked = conversation.asked_before_booking_metric(None, conversation_p3(), None, None)
    assert asked.overall_score == 1.0 and asked.overall_eval_status == EvalStatus.PASSED
    rushed = conversation.asked_before_booking_metric(None, conversation_p3(book_on_first_turn=True), None, None)
    assert rushed.overall_score == 0.0 and rushed.overall_eval_status == EvalStatus.FAILED
    # the dinner itself was fine — which is the point of course XI: a lucky table is not a careful agent
    assert table.everyone_ate_metric(None, conversation_p3(book_on_first_turn=True), None, None).overall_score == 1.0


# ── the configs the buttons run ──────────────────────────────────────────────
@pytest.mark.parametrize("name", ["eval_config.json", "eval_config_rating.json",
                                  "eval_config_path.json", "eval_config_conversation.json"])
def test_configs_resolve(name):
    from google.adk.evaluation.eval_config import EvalConfig, get_eval_metrics_from_config
    from google.adk.evaluation.metric_evaluator_registry import (DEFAULT_METRIC_EVALUATOR_REGISTRY,
                                                                 register_custom_metrics_from_config)
    cfg = EvalConfig(**json.loads((ROOT / "exam" / name).read_text()))
    register_custom_metrics_from_config(cfg)
    metrics = get_eval_metrics_from_config(cfg)
    assert metrics
    for m in metrics:
        assert DEFAULT_METRIC_EVALUATOR_REGISTRY.get_evaluator(m) is not None, m.metric_name
    if name == "eval_config_conversation.json":
        assert cfg.user_simulator_config is not None
        # every model in the loop has its dial turned down, so a run fits in minutes
        assert cfg.user_simulator_config.model_configuration.thinking_config.thinking_budget == 1024
        from google.adk.evaluation.eval_metrics import JudgeModelOptions
        for m in metrics:
            if m.metric_name.endswith("_v1"):
                opts = JudgeModelOptions.model_validate(m.criterion.judge_model_options)
                assert opts.num_samples == 1 and opts.judge_model_config.thinking_config.thinking_budget == 1024


# ── the eval sets are generated, not hand-edited ─────────────────────────────
def _load(rel: str) -> dict:
    return json.loads((ROOT / rel).read_text())


def test_evalsets_match_world():
    import sys
    sys.path.insert(0, str(ROOT / "scripts"))
    import make_evalsets
    import make_paths_and_scenarios as mps
    for split, ids in (("train", world.TRAIN), ("val", world.HOLDOUT)):
        for folder in ("exam", "host"):
            assert _load(f"{folder}/parties_{split}.evalset.json") == make_evalsets.make(f"parties_{split}", ids)
        paths_ = mps.eval_set(f"paths_{split}", [mps.path_case(p) for p in ids])
        for folder in ("exam", "maitre_d"):
            assert _load(f"{folder}/paths_{split}.evalset.json") == paths_, f"{folder}/paths_{split}"
    # the shipped persona is EXPERT (tests/test_shipped.py); course XI flips the
    # val set's to NOVICE, so compare it under whichever one it has right now
    assert _load("exam/conversations_train.evalset.json") == mps.eval_set(
        "conversations_train", [mps.scenario_case(p, "EXPERT") for p in world.TRAIN])
    val = _load("exam/conversations_val.evalset.json")
    personas = {c["conversation_scenario"]["user_persona"] for c in val["eval_cases"]}
    assert len(personas) == 1, personas
    persona = personas.pop()
    assert val == mps.eval_set("conversations_val", [mps.scenario_case(p, persona) for p in mps.TALK])


def test_every_golden_booking_is_one_the_room_takes():
    for split in ("train", "val"):
        for case in _load(f"exam/paths_{split}.evalset.json")["eval_cases"]:
            book = case["conversation"][0]["intermediate_data"]["tool_uses"][-1]["args"]
            first = world.RESTAURANTS[book["room"]]["earliest"]
            assert world._t(book["time"]) >= world._t(first), (case["eval_id"], book, first)  # noqa: SLF001

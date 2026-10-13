"""⚖ The flight — the same eight answers, three judges.

Course IV. Takes the answers the last exam actually produced (one per
holdout party, as ADK recorded them) and grades each one three ways:

    comparator   ROUGE-1 against the golden booking in the evalset — the very
                 function behind ADK's response_match_score, so the number
                 matches what course II printed. Needs a golden answer.
    checker      world.everyone_ate — walks the table seat by seat. Needs
                 the rules. Returns the whys.
    llm judge    one Gemini call with a four-line rubric. Needs a model and
                 a rubric; can be wrong, and can change its mind.

Same answer, three different things to measure it against. Nothing here is
simulated: the comparator and the checker are the exam's own code, the judge
is a real call. Run it twice and watch which columns move.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path

from google.adk.evaluation.final_response_match_v1 import _calculate_rouge_1_scores

from kitchen import env, events, state  # noqa: F401  — env settles the model path
import world

log = logging.getLogger("kitchen.flight")
ROOT = Path(__file__).resolve().parents[1]
EVALSET = ROOT / "exam" / "parties_val.evalset.json"
TEXT_BAR = 0.3                      # the shipped eval_config's response_match_score bar
JUDGE_MODEL = "gemini-2.5-flash"

RUBRIC = """You are grading a dinner booking made for a group.

Below is the group chat (everyone's constraints), the list of restaurants, and
the booking an assistant made. Decide whether EVERY person in the group can
actually eat at that booking: diet, allergies, spice, budget, walking distance,
arrival and leaving times, and the kitchen's last orders.

Answer with ONLY a JSON object, no prose, no code fences:
{"verdict": "PASS" or "FAIL", "reason": "<one sentence; name anyone who cannot eat>"}"""


def golden() -> dict[str, str]:
    """party id → the golden booking text in the evalset."""
    data = json.loads(EVALSET.read_text())
    out = {}
    for case in data.get("eval_cases", []):
        conv = (case.get("conversation") or [{}])[0]
        parts = (conv.get("final_response") or {}).get("parts") or []
        out[case.get("eval_id")] = "".join(p.get("text", "") for p in parts)
    return out


def comparator(answer: str, reference: str) -> dict:
    s = _calculate_rouge_1_scores(answer, reference)
    return {"score": round(s.fmeasure, 3), "passed": s.fmeasure >= TEXT_BAR,
            "needs": "a golden answer", "why": f"ROUGE-1 F {s.fmeasure:.2f} against the golden booking — word overlap, nothing about dinner"}


def checker(party: str, answer: str) -> dict:
    rid, when = _decision(answer)
    if not rid:
        return {"score": 0.0, "passed": False, "needs": "the rules", "why": "could not read a restaurant out of the answer", "seats": []}
    score, seats = world.everyone_ate(world.PARTIES[party], rid, when)
    hungry = [f"{s['name']}: {s['why']}" for s in seats if not s["ate"]]
    return {"score": round(score, 3), "passed": score >= world.THRESHOLD, "needs": "the rules",
            "why": (" · ".join(hungry) if hungry else "everyone ate"), "seats": seats,
            "restaurant": world.RESTAURANTS[rid]["name"], "time": when}


def _decision(answer: str) -> tuple[str | None, str]:
    text = (answer or "").strip()
    try:
        d = json.loads(text[text.index("{"): text.rindex("}") + 1])
    except (ValueError, json.JSONDecodeError):
        return world.find_restaurant(text), "19:00"
    return world.find_restaurant(str(d.get("restaurant", ""))), str(d.get("time") or "19:00")


async def llm_judge(party: str, answer: str) -> dict:
    from google import genai
    from google.genai import types

    env.settle()
    client = genai.Client()
    prompt = f"{RUBRIC}\n\n--- the brief ---\n{world.brief(party)}\n\n--- the booking ---\n{answer}"
    t0 = time.time()
    try:
        r = await client.aio.models.generate_content(
            model=JUDGE_MODEL, contents=prompt,
            config=types.GenerateContentConfig(temperature=0.0, thinking_config=types.ThinkingConfig(thinking_budget=0)))
        raw = (r.text or "").strip()
        d = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
        verdict = str(d.get("verdict", "")).upper()
        return {"score": 1.0 if verdict == "PASS" else 0.0, "passed": verdict == "PASS", "needs": "a model + a rubric",
                "why": str(d.get("reason", ""))[:240], "ms": int((time.time() - t0) * 1000)}
    except Exception as exc:                                       # noqa: BLE001
        return {"score": None, "passed": None, "needs": "a model + a rubric",
                "why": f"the judge did not answer: {type(exc).__name__}: {exc}"[:240], "ms": int((time.time() - t0) * 1000)}


def answers_of(exam: dict | None) -> list[dict]:
    """The per-party answers an exam receipt carries (newer receipts only)."""
    return [r for r in (exam or {}).get("parties", []) if r.get("answer")]


async def run(exam: dict | None = None, party: str | None = None) -> dict:
    """Grade the last exam's answers three ways — one party's answer (one
    model call) or all eight. Returns the table and records it."""
    exams = state.STATE.get("exams", [])
    exam = exam or next((e for e in reversed(exams) if answers_of(e)), None)
    if not exam:
        raise ValueError("no exam with recorded answers yet — 📝 run the exam first (course II or III)")
    gold = golden()
    rows = answers_of(exam)
    if party:
        rows = [r for r in rows if r["party"] == party]
        if not rows:
            raise ValueError(f"the last exam has no recorded answer for {party}")
    ep = events.start_episode("flight", instruction=exam.get("instruction"), judge=exam.get("judge"))
    t0 = time.time()
    judged = await asyncio.gather(*(llm_judge(r["party"], r["answer"]) for r in rows))
    out = []
    for r, llm in zip(rows, judged):
        c = comparator(r["answer"], gold.get(r["party"], ""))
        k = checker(r["party"], r["answer"])
        out.append({"party": r["party"], "answer": r["answer"], "golden": gold.get(r["party"], ""),
                    "comparator": c, "checker": {kk: v for kk, v in k.items() if kk != "seats"}, "llm": llm})
        events.emit("flight_row", party=r["party"], comparator=c["passed"], checker=k["passed"], llm=llm["passed"])
    summary = {
        "n": len(out),
        "comparator_passed": sum(1 for x in out if x["comparator"]["passed"]),
        "checker_passed": sum(1 for x in out if x["checker"]["passed"]),
        "llm_passed": sum(1 for x in out if x["llm"]["passed"]),
        "llm_unanswered": sum(1 for x in out if x["llm"]["passed"] is None),
        # the two sentences the flight exists to produce
        "fed_but_failed_text": [x["party"] for x in out if x["checker"]["passed"] and not x["comparator"]["passed"]],
        "hungry_but_passed_text": [x["party"] for x in out if not x["checker"]["passed"] and x["comparator"]["passed"]],
        "llm_disagrees": [x["party"] for x in out if x["llm"]["passed"] is not None and x["llm"]["passed"] != x["checker"]["passed"]],
        "instruction": exam.get("instruction"), "from_exam_ts": exam.get("ts"), "party": party,
        "ms": int((time.time() - t0) * 1000),
    }
    prev = state.STATE.get("flights", [])
    last = prev[-1] if prev else None
    summary["same_as_last"] = None
    if last and last.get("from_exam_ts") == summary["from_exam_ts"] and last.get("party") == party:
        summary["same_as_last"] = {
            "comparator": last.get("comparator_passed") == summary["comparator_passed"],
            "checker": last.get("checker_passed") == summary["checker_passed"],
            "llm": last.get("llm_passed") == summary["llm_passed"],
        }
    state.push("flights", {**summary, "rows": out}, keep=10)          # the whole table, so the page can show it again
    events.emit("flight_judged", **{k: v for k, v in summary.items() if k != "rows"})
    events.emit("episode_done", episode=ep)
    return {"rows": out, "summary": summary}

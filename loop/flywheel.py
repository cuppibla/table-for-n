"""The flywheel as a graph — a BOUNDED self-evolving loop, in ADK 2.

    host (an agent whose instruction is TEMPLATED FROM STATE)
      -> judge (the course-II function; the whys go into state)
      -> router (the BOUNDARY lives here)
      -> proposer (an LLM node that rewrites the instruction from the whys)
      -> publish -> back to host

Every round the proposer's rewrite lands in `state.current_instruction`, and
the next host call runs UNDER THE NEW INSTRUCTION. Three roles, kept apart:
the host never grades, the judge never proposes, the router never writes.

ADK 2 does the loop natively (a route edge pointing back). What it does NOT
give you is a boundary: nothing in `Workflow` caps iterations. The router
owns it, with four belts: SHIP when the judge passes · STOP at
FLY_MAX_ROUNDS · STOP after two rounds with no improvement · truncate a
runaway rewrite.

The one edit of course V is in `build()` below. Run it yourself:

    uv run python loop/flywheel.py           (needs .env)
"""
from __future__ import annotations

import asyncio
import difflib
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import world  # noqa: E402
from loop.support import parse_decision, party_payload, people, pick_payload  # noqa: E402

PARTY = os.environ.get("FLY_PARTY", "p1")      # Nadia · Tom · Amara · Lena · Ben
MAX_ROUNDS = int(os.environ.get("FLY_MAX_ROUNDS", "4"))
MAX_INSTRUCTION_CHARS = 2400                   # belt #4: a runaway proposer gets truncated, not obeyed
DRAFT = open(os.path.join(ROOT, "instructions", "draft.txt"), encoding="utf-8").read()

PROPOSER_INSTRUCTION = """You are the coach in a self-improving loop. An agent books dinner tables; \
a deterministic judge just scored its latest booking. Your ONLY job is to rewrite the agent's \
instruction so the next booking feeds everyone.

The judge's failure notes for the latest booking:
{whys}

The agent's current instruction:
---
{current_instruction}
---

Write ONLY the replacement instruction (plain text, no commentary, under 1200 characters). \
Turn each failure note into a concrete rule. Keep the JSON output-format section verbatim."""


"""The flywheel as a graph — a BOUNDED self-evolving loop, in ADK 2.

    host (an agent whose instruction is TEMPLATED FROM STATE)
      -> judge (the course-II function; the whys go into state)
      -> router (the BOUNDARY lives here)
      -> proposer (an LLM node that rewrites the instruction from the whys)
      -> publish -> back to host

Every round the proposer's rewrite lands in `state.current_instruction`, and
the next host call runs UNDER THE NEW INSTRUCTION. Three roles, kept apart:
the host never grades, the judge never proposes, the router never writes.

ADK 2 does the loop natively (a route edge pointing back). What it does NOT
give you is a boundary: nothing in `Workflow` caps iterations. The router
owns it, with four belts: SHIP when the judge passes · STOP at
FLY_MAX_ROUNDS · STOP after two rounds with no improvement · truncate a
runaway rewrite.

The one edit of course V is in `build()` below. Run it yourself:

    uv run python loop/flywheel.py           (needs .env)
"""
from __future__ import annotations

import asyncio
import difflib
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import world  # noqa: E402
from loop.support import parse_decision, party_payload, people, pick_payload  # noqa: E402

MODEL = os.environ.get("HOST_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"   # same dial as host/agent.py

PARTY = os.environ.get("FLY_PARTY", "p1")      # Nadia · Tom · Amara · Lena · Ben
MAX_ROUNDS = int(os.environ.get("FLY_MAX_ROUNDS", "4"))
MAX_INSTRUCTION_CHARS = 2400                   # belt #4: a runaway proposer gets truncated, not obeyed
DRAFT = open(os.path.join(ROOT, "instructions", "draft.txt"), encoding="utf-8").read()

PROPOSER_INSTRUCTION = """You are the coach in a self-improving loop. An agent books dinner tables; \
a deterministic judge just scored its latest booking. Your ONLY job is to rewrite the agent's \
instruction so the next booking feeds everyone.

The judge's failure notes for the latest booking:
{whys}

The agent's current instruction:
---
{current_instruction}
---

Write ONLY the replacement instruction (plain text, no commentary, under 1200 characters). \
Turn each failure note into a concrete rule. Keep the JSON output-format section verbatim."""


def build(nodes: dict):
    """The graph. Every edge points forward — read the 👉 note."""
    from google.adk import Workflow

    seed, host, judge, router = nodes["seed"], nodes["host"], nodes["judge"], nodes["router"]
    proposer, publish, done = nodes["proposer"], nodes["publish"], nodes["done"]
    return Workflow(
        name="flywheel",
        edges=[
            ("START", seed, host, judge, router),
            (router, {"improve": proposer, "ship": done}),
            # 👉 Right now every edge points forward, so the loop runs one round and stops.
            #    Fix: delete the "# " on the next line.
            #    Then round n+1 runs under the proposer's rewrite.
            # (proposer, publish, host),
        ],
    )


async def run(emit) -> bool:
    from google.adk import Agent, Event
    from google.adk.runners import InMemoryRunner
    from google.genai import types as gt

    ids = world.PARTIES[PARTY]
    n = len(ids)
    ep: dict = {"round": 0, "best": 0.0, "flat": 0, "baseline": None, "done": False}
    gen = gt.GenerateContentConfig(thinking_config=gt.ThinkingConfig(thinking_budget=0), temperature=0.0)

    def seed(node_input: str):
        emit("party_seated", party_id=PARTY, people=people(PARTY))
        yield Event(state={"brief": world.brief(PARTY), "current_instruction": DRAFT,
                           "whys": "(no failures yet — first round)"})

    host = Agent(
        name="host", model=MODEL,
        # the whole point: the instruction is a STATE TEMPLATE — the loop
        # rewrites it while the graph is running
        instruction="{current_instruction}\n\nHere is tonight's request:\n{brief}",
        output_key="decision", generate_content_config=gen)

    def judge(decision: str):
        ep["round"] += 1
        rid, t, reason = parse_decision(decision)
        emit("pick_proposed", **pick_payload(rid, t, "everyone_ate", f"loop round {ep['round']}", reason))
        score, seats = world.everyone_ate(ids, rid, t)
        for s in seats:
            emit("seat_scored", person_id=s["id"], name=s["name"], ate=s["ate"], why=s["why"])
        hungry = sum(1 for s in seats if not s["ate"])
        emit("party_scored", **party_payload("everyone_ate", score, n, world.THRESHOLD, hungry=hungry,
                                             honest=round(score, 2), round=ep["round"]))
        if ep["baseline"] is None:
            ep["baseline"] = score
        emit("holdout_scored", round=ep["round"], score=round(score, 2), baseline=round(ep["baseline"], 2))
        whys = "; ".join(f"{s['name']}: {s['why']}" for s in seats if not s["ate"]) or "none"
        yield Event(state={"whys": whys, "last_score": score})

    def router(last_score: float):
        # ── THE BOUNDARY. ADK gives you the loop; nobody but you gives it an end.
        if last_score >= world.THRESHOLD:
            emit("gate_decided", decision="SHIP", judge="everyone_ate", score=round(last_score, 2),
                 baseline=round(ep["baseline"], 2), why=f"passed in round {ep['round']} — the loop earned its exit")
            yield Event(route="ship")
        elif ep["round"] >= MAX_ROUNDS:
            emit("gate_decided", decision="REJECT", judge="everyone_ate", score=round(last_score, 2),
                 baseline=round(ep["baseline"], 2), why=f"round budget exhausted ({MAX_ROUNDS}) — stopping is also a decision")
            yield Event(route="ship")
        elif last_score <= ep["best"] and ep["flat"] >= 1:
            emit("gate_decided", decision="REJECT", judge="everyone_ate", score=round(last_score, 2),
                 baseline=round(ep["baseline"], 2), why="two rounds without improvement — a flat line is an answer too")
            yield Event(route="ship")
        else:
            ep["flat"] = ep["flat"] + 1 if last_score <= ep["best"] else 0
            ep["best"] = max(ep["best"], last_score)
            yield Event(route="improve")

    proposer = Agent(name="proposer", model=MODEL, instruction=PROPOSER_INSTRUCTION,
                     output_key="proposed_instruction", generate_content_config=gen)

    def publish(proposed_instruction: str, current_instruction: str):
        new = proposed_instruction.strip()[:MAX_INSTRUCTION_CHARS]
        diff = [{"op": l[0], "line": l[1:].strip()[:110]}
                for l in difflib.unified_diff(current_instruction.splitlines(), new.splitlines(), lineterm="")
                if l[:1] in "+-" and not l.startswith(("+++", "---")) and l[1:].strip()][:8]
        emit("candidate_proposed", candidate_id=f"R-{ep['round']}",
             diff=diff or [{"op": "+", "line": "(rewrite too large to diff — full text swapped)"}],
             proposer="the loop's proposer (LLM node)")
        yield Event(state={"current_instruction": new})

    def done(node_input=None):
        ep["done"] = True
        emit("episode_done", loop=True, rounds=ep["round"])
        yield Event(message=f"flywheel closed after round {ep['round']}")

    fly = build({"seed": seed, "host": host, "judge": judge, "router": router,
                 "proposer": proposer, "publish": publish, "done": done})
    runner = InMemoryRunner(agent=fly, app_name="flywheel")
    session = await runner.session_service.create_session(app_name="flywheel", user_id="app")
    async for _ev in runner.run_async(user_id="app", session_id=session.id,
                                      new_message=gt.Content(role="user", parts=[gt.Part(text="spin")])):
        pass
    if not ep["done"]:
        emit("error", message="flywheel ended without closing — the proposer wrote a rewrite and nothing carried it back to the host")
    return ep["done"]


def _emitter():
    if os.environ.get("TABLE_EMIT") == "json":
        def emit(type_, **payload):
            print("@@event " + json.dumps({"type": type_, **payload}), flush=True)
    else:
        def emit(type_, **payload):
            line = {k: v for k, v in payload.items() if k not in ("people", "diff")}
            print(f"[{type_}] {line}", flush=True)
    return emit


if __name__ == "__main__":
    from kitchen import env  # noqa: F401  — loads .env
    t0 = time.time()
    ok = asyncio.run(run(_emitter()))
    print(f"[flywheel] {'closed' if ok else 'did not close'} · {time.time() - t0:.0f} s", flush=True)
    sys.exit(0 if ok else 2)


async def run(emit) -> bool:
    from google.adk import Agent, Event
    from google.adk.runners import InMemoryRunner
    from google.genai import types as gt

    ids = world.PARTIES[PARTY]
    n = len(ids)
    ep: dict = {"round": 0, "best": 0.0, "flat": 0, "baseline": None, "done": False}
    gen = gt.GenerateContentConfig(thinking_config=gt.ThinkingConfig(thinking_budget=0), temperature=0.0)

    def seed(node_input: str):
        emit("party_seated", party_id=PARTY, people=people(PARTY))
        yield Event(state={"brief": world.brief(PARTY), "current_instruction": DRAFT,
                           "whys": "(no failures yet — first round)"})

    host = Agent(
        name="host", model=MODEL,
        # the whole point: the instruction is a STATE TEMPLATE — the loop
        # rewrites it while the graph is running
        instruction="{current_instruction}\n\nHere is tonight's request:\n{brief}",
        output_key="decision", generate_content_config=gen)

    def judge(decision: str):
        ep["round"] += 1
        rid, t, reason = parse_decision(decision)
        emit("pick_proposed", **pick_payload(rid, t, "everyone_ate", f"loop round {ep['round']}", reason))
        score, seats = world.everyone_ate(ids, rid, t)
        for s in seats:
            emit("seat_scored", person_id=s["id"], name=s["name"], ate=s["ate"], why=s["why"])
        hungry = sum(1 for s in seats if not s["ate"])
        emit("party_scored", **party_payload("everyone_ate", score, n, world.THRESHOLD, hungry=hungry,
                                             honest=round(score, 2), round=ep["round"]))
        if ep["baseline"] is None:
            ep["baseline"] = score
        emit("holdout_scored", round=ep["round"], score=round(score, 2), baseline=round(ep["baseline"], 2))
        whys = "; ".join(f"{s['name']}: {s['why']}" for s in seats if not s["ate"]) or "none"
        yield Event(state={"whys": whys, "last_score": score})

    def router(last_score: float):
        # ── THE BOUNDARY. ADK gives you the loop; nobody but you gives it an end.
        if last_score >= world.THRESHOLD:
            emit("gate_decided", decision="SHIP", judge="everyone_ate", score=round(last_score, 2),
                 baseline=round(ep["baseline"], 2), why=f"passed in round {ep['round']} — the loop earned its exit")
            yield Event(route="ship")
        elif ep["round"] >= MAX_ROUNDS:
            emit("gate_decided", decision="REJECT", judge="everyone_ate", score=round(last_score, 2),
                 baseline=round(ep["baseline"], 2), why=f"round budget exhausted ({MAX_ROUNDS}) — stopping is also a decision")
            yield Event(route="ship")
        elif last_score <= ep["best"] and ep["flat"] >= 1:
            emit("gate_decided", decision="REJECT", judge="everyone_ate", score=round(last_score, 2),
                 baseline=round(ep["baseline"], 2), why="two rounds without improvement — a flat line is an answer too")
            yield Event(route="ship")
        else:
            ep["flat"] = ep["flat"] + 1 if last_score <= ep["best"] else 0
            ep["best"] = max(ep["best"], last_score)
            yield Event(route="improve")

    proposer = Agent(name="proposer", model=MODEL, instruction=PROPOSER_INSTRUCTION,
                     output_key="proposed_instruction", generate_content_config=gen)

    def publish(proposed_instruction: str, current_instruction: str):
        new = proposed_instruction.strip()[:MAX_INSTRUCTION_CHARS]
        diff = [{"op": l[0], "line": l[1:].strip()[:110]}
                for l in difflib.unified_diff(current_instruction.splitlines(), new.splitlines(), lineterm="")
                if l[:1] in "+-" and not l.startswith(("+++", "---")) and l[1:].strip()][:8]
        emit("candidate_proposed", candidate_id=f"R-{ep['round']}",
             diff=diff or [{"op": "+", "line": "(rewrite too large to diff — full text swapped)"}],
             proposer="the loop's proposer (LLM node)")
        yield Event(state={"current_instruction": new})

    def done(node_input=None):
        ep["done"] = True
        emit("episode_done", loop=True, rounds=ep["round"])
        yield Event(message=f"flywheel closed after round {ep['round']}")

    fly = build({"seed": seed, "host": host, "judge": judge, "router": router,
                 "proposer": proposer, "publish": publish, "done": done})
    runner = InMemoryRunner(agent=fly, app_name="flywheel")
    session = await runner.session_service.create_session(app_name="flywheel", user_id="app")
    async for _ev in runner.run_async(user_id="app", session_id=session.id,
                                      new_message=gt.Content(role="user", parts=[gt.Part(text="spin")])):
        pass
    if not ep["done"]:
        emit("error", message="flywheel ended without closing — the proposer wrote a rewrite and nothing carried it back to the host")
    return ep["done"]


def _emitter():
    if os.environ.get("TABLE_EMIT") == "json":
        def emit(type_, **payload):
            print("@@event " + json.dumps({"type": type_, **payload}), flush=True)
    else:
        def emit(type_, **payload):
            line = {k: v for k, v in payload.items() if k not in ("people", "diff")}
            print(f"[{type_}] {line}", flush=True)
    return emit


if __name__ == "__main__":
    from kitchen import env  # noqa: F401  — loads .env
    t0 = time.time()
    ok = asyncio.run(run(_emitter()))
    print(f"[flywheel] {'closed' if ok else 'did not close'} · {time.time() - t0:.0f} s", flush=True)
    sys.exit(0 if ok else 2)

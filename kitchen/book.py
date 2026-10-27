"""📋 Book the table — one real call to the host, judged on the spot.

The host is re-imported from disk on every booking, so an installed or
rewritten `instruction_current.txt` lands on the next 📋 without a restart.
Sessions go to the same table.db the workbench uses: a booking made here
shows up in adk web as a session, and vice versa.

The second seating books with the maître d' instead (`agent="maitre_d"`): it
gets the group chat without the listings, so every room it knows about is a
tool call. Each call is on the table as it happens, the path checker reads
them all, and everyone_ate grades the table it reserved — the same two
functions, on the same calls, as its exams.
"""
from __future__ import annotations

import asyncio
import importlib
import logging
import sys
from pathlib import Path

from google.adk.runners import Runner
from google.adk.sessions.sqlite_session_service import SqliteSessionService
from google.genai import types

from google.adk.evaluation.eval_case import Invocation, InvocationEvent, InvocationEvents

from kitchen import env, events, jobs, state  # noqa: F401  — env settles the model path
from kitchen.instruction import kind as instruction_kind
from loop import support
from metrics import path as path_checker
from metrics import table
import world

log = logging.getLogger("kitchen.book")
ROOT = Path(__file__).resolve().parents[1]
DB = str(ROOT / "table.db")
APP = "host"
MAITRE_D = "maitre_d"               # the second seating's agent, its own folder and app
USER = "table"                      # the page's bookings; the workbench's are "user"

_sessions: SqliteSessionService | None = None
_busy = asyncio.Lock()


def sessions() -> SqliteSessionService:
    global _sessions
    if _sessions is None:
        _sessions = SqliteSessionService(DB)
    return _sessions


def fresh_host():
    """`host.agent` as it is on disk right now — a clean re-import, so the
    instruction file is read again."""
    for n in ("host.agent", "host"):
        sys.modules.pop(n, None)
    return importlib.import_module("host.agent")


def fresh_maitre_d():
    """The same, for the maître d' (its tools module too, so an edit lands)."""
    for n in ("maitre_d.agent", "maitre_d.tools", "maitre_d"):
        sys.modules.pop(n, None)
    return importlib.import_module("maitre_d.agent")


async def book(party_id: str, judge: str, agent: str = APP) -> dict:
    if party_id not in world.PARTIES:
        raise ValueError(f"unknown party {party_id}")
    if agent == MAITRE_D:
        return await book_with_maitre_d(party_id)
    if agent != APP:
        raise ValueError(f"unknown agent {agent}")
    async with _busy:
        env.settle()
        agent_mod = fresh_host()
        kind = instruction_kind()
        runner = Runner(agent=agent_mod.root_agent, app_name=APP, session_service=sessions())
        session = await sessions().create_session(app_name=APP, user_id=USER)
        ep = events.start_episode("booking", party=party_id, judge=judge, instruction=kind)
        events.emit("party_seated", party_id=party_id, people=support.people(party_id))
        text = ""
        try:
            async for ev in runner.run_async(
                    user_id=USER, session_id=session.id,
                    new_message=types.Content(role="user", parts=[types.Part(text=world.brief(party_id))])):
                if ev.content and ev.content.parts and ev.author == APP:
                    t = "".join(p.text or "" for p in ev.content.parts if getattr(p, "text", None))
                    if t:
                        text = t
        except Exception as exc:                                   # noqa: BLE001
            log.warning("booking failed: %s", exc)
            events.emit("error", message=f"{type(exc).__name__}: {exc}"[:300])
            events.emit("episode_done")
            return {"ok": False, "error": str(exc)[:300], "episode": ep}
        finally:
            try:
                await runner.close()
            except Exception:                                      # noqa: BLE001
                pass
        try:
            rid, time_str, reason = support.parse_decision(text)
        except (ValueError, Exception) as exc:                     # noqa: BLE001
            events.emit("error", message=f"the host did not book a known room: {text[:160]!r}")
            events.emit("episode_done")
            return {"ok": False, "error": str(exc)[:200], "answer": text[:300], "episode": ep}

        events.emit("pick_proposed", **support.pick_payload(rid, time_str, judge, kind, reason))
        sc = support.score_party(party_id, rid, time_str)
        for s in sc["seats"]:
            events.emit("seat_scored", person_id=s["id"], name=s["name"], ate=s["ate"], why=s["why"])
            await asyncio.sleep(0.35)
        honest = judge == "everyone_ate"
        score = sc["honest"] if honest else sc["rating"]
        bar = world.THRESHOLD if honest else world.RATING_BAR
        events.emit("party_scored", **support.party_payload(
            judge, score, sc["n"], bar, honest=round(sc["honest"], 2), rating=round(sc["rating"], 2), hungry=sc["hungry"]))
        events.emit("episode_done")
        row = state.push("bookings", {"party": party_id, "judge": judge, "restaurant": rid, "time": time_str,
                                      "honest": round(sc["honest"], 2), "rating": round(sc["rating"], 2),
                                      "hungry": sc["hungry"], "instruction": kind, "session": session.id})
        return {"ok": True, "episode": ep, **row}


async def book_with_maitre_d(party_id: str) -> dict:
    """One real conversation turn with the maître d', graded twice: the path
    (four rules over its tool calls) and the dinner (everyone_ate on the room
    it booked). The second seating has no rating switch — its judges are these."""
    judge = "everyone_ate"
    async with _busy:
        env.settle()
        agent_mod = fresh_maitre_d()
        kind = instruction_kind(MAITRE_D)
        runner = Runner(agent=agent_mod.root_agent, app_name=MAITRE_D, session_service=sessions())
        session = await sessions().create_session(app_name=MAITRE_D, user_id=USER)
        ep = events.start_episode("booking", party=party_id, judge=judge, instruction=kind, agent=MAITRE_D)
        events.emit("party_seated", party_id=party_id, people=support.people(party_id))
        said = types.Content(role="user", parts=[types.Part(text=world.chat_brief(party_id))])
        seen: list[InvocationEvent] = []
        final = None
        try:
            async for ev in runner.run_async(user_id=USER, session_id=session.id, new_message=said):
                if not (ev.content and ev.content.parts):
                    continue
                seen.append(InvocationEvent(author=ev.author or "", content=ev.content))
                for fc in ev.get_function_calls():
                    events.emit("tool_called", name=fc.name, args=dict(fc.args or {}))
                if ev.author == MAITRE_D and any(getattr(p, "text", None) for p in ev.content.parts):
                    final = ev.content
        except Exception as exc:                                   # noqa: BLE001
            log.warning("booking failed: %s", exc)
            events.emit("error", message=f"{type(exc).__name__}: {exc}"[:300])
            events.emit("episode_done")
            return {"ok": False, "error": str(exc)[:300], "episode": ep}
        finally:
            try:
                await runner.close()
            except Exception:                                      # noqa: BLE001
                pass
        # the turn as ADK's eval would record it, so the verdicts below are
        # the ones the path exam would write for the same calls
        inv = Invocation(user_content=said, final_response=final,
                         intermediate_data=InvocationEvents(invocation_events=seen))
        text = table._final_text(inv)                              # noqa: SLF001
        calls = path_checker.tool_calls([inv])
        rules = path_checker.path_checks(calls, world.PARTIES[party_id], table.reply_of([inv]))
        events.emit("path_checked", rules=rules, passed=all(r["ok"] for r in rules),
                    calls=[jobs._call_label(c) for c in calls])
        rid, time_str, graded = table.booking_of([inv])
        if rid is None:
            events.emit("error", message=f"the maître d' booked no known room: {text[:160]!r}")
            events.emit("episode_done")
            return {"ok": False, "error": "no booking", "answer": text[:300], "rules": rules, "episode": ep}
        try:
            reason = support.parse_decision(text)[2]
        except ValueError:
            reason = text[:240]
        events.emit("pick_proposed", **support.pick_payload(rid, time_str, judge, kind, reason))
        sc = support.score_party(party_id, rid, time_str)
        for s in sc["seats"]:
            events.emit("seat_scored", person_id=s["id"], name=s["name"], ate=s["ate"], why=s["why"])
            await asyncio.sleep(0.35)
        events.emit("party_scored", **support.party_payload(
            judge, sc["honest"], sc["n"], world.THRESHOLD, honest=round(sc["honest"], 2),
            rating=round(sc["rating"], 2), hungry=sc["hungry"]))
        events.emit("episode_done")
        broken = [r["rule"] for r in rules if not r["ok"]]
        row = state.push("bookings", {"party": party_id, "judge": judge, "restaurant": rid, "time": time_str,
                                      "honest": round(sc["honest"], 2), "rating": round(sc["rating"], 2),
                                      "hungry": sc["hungry"], "instruction": kind, "session": session.id,
                                      "agent": MAITRE_D, "graded": graded, "calls": [jobs._call_label(c) for c in calls],
                                      "path": {"passed": not broken, "broken": broken, "rules": rules}})
        return {"ok": True, "episode": ep, "rules": rules, **row}

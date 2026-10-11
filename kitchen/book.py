"""📋 Book the table — one real call to the host, judged on the spot.

The host is re-imported from disk on every booking, so an installed or
rewritten `instruction_current.txt` lands on the next 📋 without a restart.
Sessions go to the same table.db the workbench uses: a booking made here
shows up in adk web as a session, and vice versa.
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

from kitchen import env, events, state  # noqa: F401  — env settles the model path
from kitchen.instruction import kind as instruction_kind
from loop import support
import world

log = logging.getLogger("kitchen.book")
ROOT = Path(__file__).resolve().parents[1]
DB = str(ROOT / "table.db")
APP = "host"
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


async def book(party_id: str, judge: str) -> dict:
    if party_id not in world.PARTIES:
        raise ValueError(f"unknown party {party_id}")
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

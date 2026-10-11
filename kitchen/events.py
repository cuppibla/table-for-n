"""One append-only log; the table is a projection of it.

Every booking, every exam verdict, every loop round lands here as a typed
event, the same contract the lab's broadcast server used:

    party_seated · pick_proposed · seat_scored · party_scored
    candidate_proposed · holdout_scored · gate_decided · judge_switched
    outcome_returned · exam_minted · episode_started · episode_done · error

The page folds the events since the last `episode_started` into one screen.
`GET /api/events` streams the recent history and then whatever comes next.
"""
from __future__ import annotations

import asyncio
import json
import time

LOG: list[dict] = []
SUBS: set[asyncio.Queue] = set()
EPISODE = 0
KEEP_EPISODES = 6                   # how many episodes a new subscriber is sent


def emit(type_: str, **payload) -> dict:
    ev = {"i": len(LOG), "ep": EPISODE, "t": round(time.time(), 3), "type": type_, **payload}
    LOG.append(ev)
    for q in list(SUBS):
        q.put_nowait(ev)
    return ev


def start_episode(kind: str, **payload) -> int:
    """A new screen: a booking, an exam, a loop run. Returns its number."""
    global EPISODE
    EPISODE += 1
    emit("episode_started", kind=kind, **payload)
    return EPISODE


def recent() -> list[dict]:
    first = max(0, EPISODE - KEEP_EPISODES + 1)
    return [e for e in LOG if e["ep"] >= first]


async def stream():
    q: asyncio.Queue = asyncio.Queue()
    for ev in recent():
        yield f"data: {json.dumps(ev)}\n\n"
    SUBS.add(q)
    try:
        while True:
            try:
                ev = await asyncio.wait_for(q.get(), timeout=15)
                yield f"data: {json.dumps(ev)}\n\n"
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"
    finally:
        SUBS.discard(q)


def last(type_: str, ep: int | None = None) -> dict | None:
    for ev in reversed(LOG):
        if ev["type"] == type_ and (ep is None or ev["ep"] == ep):
            return ev
    return None

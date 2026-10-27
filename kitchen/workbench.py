"""adk web, mounted in the same process — the 🔬 workbench.

Same `host/` folder, same `table.db`, so a booking made on the page is a
session in the dev UI and a session made in the dev UI counts for course I.
Not with adk's own file watcher (it evicts modules from a thread of its own
and races our imports); a save in the page evicts the workbench's copy of
the host instead, on the request that made the save.
"""
from __future__ import annotations

import contextlib
from pathlib import Path

from fastapi import FastAPI
from google.adk.sessions.sqlite_session_service import SqliteSessionService

ROOT = Path(__file__).resolve().parents[1]
DB = str(ROOT / "table.db")
URL_PREFIX = "/workbench"
APP = "host"
USER = "user"                       # the dev UI's own user id

_server = None
_app: FastAPI | None = None
_sessions: SqliteSessionService | None = None


def _build() -> FastAPI:
    from google.adk.cli import fast_api as adk_fast_api

    try:
        from google.adk.cli import dev_server as _home
        base = _home.DevServer
    except (ImportError, AttributeError):
        _home = adk_fast_api
        base = getattr(adk_fast_api, "ApiServer", None) or adk_fast_api.DevServer
    name = base.__name__

    class _Capturing(base):  # type: ignore[misc, valid-type]
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            global _server
            _server = self

    setattr(_home, name, _Capturing)
    return adk_fast_api.get_fast_api_app(
        agents_dir=str(ROOT), session_service_uri=f"sqlite:///{DB}",
        allow_origins=["*"], web=True, url_prefix=URL_PREFIX, reload_agents=False)


def app() -> FastAPI:
    global _app
    if _app is None:
        _app = _build()
    return _app


async def forget(app_name: str = APP) -> None:
    """After a save or an install: the workbench's next run imports the file as it is now."""
    srv = _server
    if srv is None:
        return
    runner = getattr(srv, "runner_dict", {}).pop(app_name, None)
    if runner is not None:
        with contextlib.suppress(Exception):
            from google.adk.cli.utils import cleanup
            await cleanup.close_runners([runner])
    with contextlib.suppress(Exception):
        srv.agent_loader.remove_agent_from_cache(app_name)


def sessions() -> SqliteSessionService:
    global _sessions
    if _sessions is None:
        _sessions = SqliteSessionService(DB)
    return _sessions


async def calls(app: str = APP) -> int:
    """Bookings made in the dev UI: sessions of `app` under its user that hold
    at least one reply from that agent. Course I's receipt (the host), and
    course IX's (the maître d', `app="maitre_d"`)."""
    svc = sessions()
    try:
        listed = await svc.list_sessions(app_name=app, user_id=USER)
    except Exception:                                              # noqa: BLE001
        return 0
    n = 0
    for s in listed.sessions:
        full = await svc.get_session(app_name=app, user_id=USER, session_id=s.id)
        if full is not None and any(getattr(e, "author", "") == app and e.content for e in (full.events or [])):
            n += 1
    return n

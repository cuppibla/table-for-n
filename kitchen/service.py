"""Table for N — one process, one port.

    /                 the page (site/out, built once by table.sh)
    /api/progress     which course is lit — read from your files + what ran
    /api/events       SSE: the table's event log (recent history, then live)
    /api/book         POST {party}: one real booking, judged on the spot
    /api/judge        GET / POST {to}: the switch — which judge the exam runs with
    /api/code         GET / POST: the in-page editor (one file, syntax-checked)
    /api/job          POST {kind} / GET ?kind=: exam · optimize · loop · deploy · traffic · pipe · harvest
    /api/install      POST {which}: draft · winner · hacked · optimized → host/instruction_current.txt
    /api/env          GET / POST {HOST_ENGINE}: course VI's engine line in .env
    /workbench        adk web, mounted here: same host/ folder, same table.db

    uvicorn kitchen.service:app --port 3470
"""
from __future__ import annotations

import contextlib
import logging
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from kitchen import env  # noqa: E402,F401  — settles the model path first
from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from kitchen import book, codefile, events, instruction, jobs, metrics_registry, progress, state, workbench  # noqa: E402
import world  # noqa: E402

JUDGES_IN_WORKBENCH = metrics_registry.register()   # everyone_ate · rating, in the dev UI's dialog too

logging.basicConfig(level=logging.INFO, format="%(message)s")
logging.getLogger("google_adk").setLevel(logging.WARNING)
log = logging.getLogger("table")
SITE = ROOT / "site" / "out"

wb = workbench.app()


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    async with wb.router.lifespan_context(wb):
        yield


app = FastAPI(title="Table for N", lifespan=lifespan)


@app.middleware("http")
async def _no_cache_api(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "mode": env.MODE, "instruction": instruction.kind(), "workbench_metrics": JUDGES_IN_WORKBENCH}


@app.get("/api/progress")
async def get_progress() -> dict:
    return progress.read(workbench_calls=await workbench.calls())


@app.get("/api/world")
async def get_world() -> dict:
    return {"people": world.PEOPLE, "restaurants": world.RESTAURANTS, "parties": world.PARTIES,
            "holdout": world.HOLDOUT, "train": world.TRAIN, "threshold": world.THRESHOLD, "rating_bar": world.RATING_BAR}


@app.get("/api/brief")
async def get_brief(party: str = "p1") -> dict:
    if party not in world.PARTIES:
        raise HTTPException(404, f"no party {party}")
    return {"party": party, "brief": world.brief(party)}


# ── the log ──────────────────────────────────────────────────────────────────
@app.get("/api/events")
async def get_events():
    return StreamingResponse(events.stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/log")
async def get_log() -> dict:
    return {"events": events.recent(), "episode": events.EPISODE}


# ── 📋 book ──────────────────────────────────────────────────────────────────
@app.post("/api/book")
async def post_book(req: Request) -> dict:
    body = await req.json()
    party = body.get("party", "p1")
    judge = body.get("judge") or state.STATE.get("judge", "everyone_ate")
    if book._busy.locked():
        raise HTTPException(409, "a booking is already in progress")
    try:
        return await book.book(party, judge)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


# ── the switch ───────────────────────────────────────────────────────────────
@app.get("/api/judge")
async def get_judge() -> dict:
    return {"judge": state.STATE.get("judge", "everyone_ate")}


@app.post("/api/judge")
async def post_judge(req: Request) -> dict:
    body = await req.json()
    to = body.get("to")
    if to not in ("everyone_ate", "rating"):
        raise HTTPException(400, "to must be everyone_ate or rating")
    was = state.STATE.get("judge", "everyone_ate")
    if to != was:
        state.set_("judge", to)
        events.emit("judge_switched", **{"from": was, "to": to})
    return {"judge": to}


# ── the editor ───────────────────────────────────────────────────────────────
@app.get("/api/code")
async def read_code(path: str, symbol: str | None = None) -> dict:
    try:
        return codefile.read(path, symbol)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/api/code")
async def write_code(req: Request) -> dict:
    body = await req.json()
    try:
        out = codefile.write(body["path"], body["content"], body.get("symbol"))
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    if out.get("validation", {}).get("valid"):
        await workbench.forget()
        events.emit("file_saved", path=body["path"])
    return out


# ── instructions ─────────────────────────────────────────────────────────────
@app.get("/api/instruction")
async def get_instruction() -> dict:
    return {"kind": instruction.kind(), "chars": len(instruction.current()), "available": instruction.available(),
            "text": instruction.current()}


@app.post("/api/install")
async def post_install(req: Request) -> dict:
    body = await req.json()
    try:
        out = instruction.install(body.get("which", ""))
    except KeyError as exc:
        raise HTTPException(400, f"unknown instruction {exc}") from exc
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    await workbench.forget()
    events.emit("instruction_installed", **out)
    return out


# ── jobs ─────────────────────────────────────────────────────────────────────
@app.post("/api/job")
async def post_job(req: Request) -> dict:
    body = await req.json()
    kind = body.get("kind", "")
    if kind not in jobs.BUILDERS:
        raise HTTPException(400, f"unknown job {kind!r}")
    opts = {k: v for k, v in body.items() if k != "kind"}
    try:
        job = await jobs.start(kind, **opts)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
    return job.view()


@app.get("/api/job")
async def get_job(kind: str | None = None) -> dict:
    if kind:
        j = jobs.JOBS.get(kind)
        return j.view() if j else {"kind": kind, "state": "idle", "log": [], "summary": {}}
    return jobs.views()


@app.delete("/api/job")
async def stop_job(kind: str) -> dict:
    return {"stopped": await jobs.stop(kind)}


# ── .env (course VI) ─────────────────────────────────────────────────────────
@app.get("/api/env")
async def get_env() -> dict:
    return {"HOST_ENGINE": env.read_env_line("HOST_ENGINE"), "project": env.read_env_line("GOOGLE_CLOUD_PROJECT"), "mode": env.MODE}


@app.post("/api/env")
async def post_env(req: Request) -> dict:
    body = await req.json()
    engine = (body.get("HOST_ENGINE") or "").strip()
    if engine and not re.match(r"^projects/[\w.-]+/locations/[\w-]+/reasoningEngines/\d+$", engine):
        raise HTTPException(400, "that is not a reasoningEngines resource name")
    env.write_env_line("HOST_ENGINE", engine)
    state.set_("engine", engine)
    return await get_env()


# ── the workbench ────────────────────────────────────────────────────────────
def _origin(request: Request) -> str:
    seen = re.match(r"https?://[^/]+", request.headers.get("referer", ""))
    if seen:
        return seen.group(0)
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = request.headers.get("x-forwarded-host", request.headers.get("host", "localhost:3470"))
    return f"{proto}://{host.split(',')[0].strip()}"


@app.get("/workbench/dev-ui/assets/config/runtime-config.json", include_in_schema=False)
async def runtime_config(request: Request):
    return JSONResponse({"backendUrl": f"{_origin(request)}/workbench", "telemetry": False},
                        headers={"Cache-Control": "no-store"})


app.mount(workbench.URL_PREFIX, wb)

if (SITE / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(SITE), html=True), name="site")
else:
    @app.get("/{path:path}", response_class=HTMLResponse, include_in_schema=False)
    async def _no_site(path: str) -> str:
        return ("<pre style='font:14px/1.6 monospace;padding:2rem'>The table is not laid yet.\n\n"
                "    bash table.sh\n\nbuilds site/ once and starts this server.</pre>")

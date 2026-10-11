"""Long things run as subprocesses, their output streamed to the page.

    exam      adk eval host exam/parties_val.evalset.json --config_file_path …
    optimize  adk optimize host …                       (course III, ~8 min)
    loop      python loop/flywheel.py                   (course V)
    deploy    adk deploy agent_engine host …            (course VI)
    traffic   python refuel/send_traffic.py             (course VI)
    pipe      python refuel/replay_to_bq.py             (course VI)
    harvest   python refuel/harvest.py                  (course VI)

One job of each kind at a time. A line a subprocess prints as `@@event {…}`
is appended to the table's event log (the loop talks to the table that way);
every other line is its log. When a job ends, its summary is written to
state (exams, loops, harvest) — that is what lights a course.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import sys
import time
from collections import deque
from pathlib import Path

from kitchen import env, events, state
from kitchen.instruction import kind as instruction_kind

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / "runs"
BIN = Path(sys.executable).parent
ADK = str(BIN / "adk")
PY = sys.executable

JOBS: dict[str, "Job"] = {}


class Job:
    def __init__(self, kind: str, argv: list[str], extra_env: dict | None = None, meta: dict | None = None):
        self.kind, self.argv = kind, argv
        self.extra_env = extra_env or {}
        self.meta = meta or {}
        self.state = "idle"
        self.rc: int | None = None
        self.started = self.ended = 0.0
        self.log: deque[str] = deque(maxlen=600)
        self.summary: dict = {}
        self.episode: int | None = None
        self.proc: asyncio.subprocess.Process | None = None

    def view(self) -> dict:
        return {"kind": self.kind, "state": self.state, "rc": self.rc, "started": self.started, "ended": self.ended,
                "elapsed": round((self.ended or time.time()) - self.started, 1) if self.started else 0,
                "log": list(self.log)[-80:], "summary": self.summary, "meta": self.meta, "episode": self.episode}


def running(kind: str) -> bool:
    j = JOBS.get(kind)
    return bool(j and j.state == "running")


async def start(kind: str, **opts) -> Job:
    if running(kind):
        raise RuntimeError(f"a {kind} job is already running")
    env.settle()
    builder = BUILDERS[kind]
    job = builder(**opts)
    JOBS[kind] = job
    job.state, job.started = "running", time.time()
    asyncio.get_event_loop().create_task(_run(job))
    return job


async def _run(job: Job) -> None:
    penv = dict(os.environ, PYTHONUNBUFFERED="1", PYTHONPATH=str(ROOT), **job.extra_env)
    try:
        job.proc = await asyncio.create_subprocess_exec(
            *job.argv, cwd=str(ROOT), env=penv,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        assert job.proc.stdout is not None
        while True:
            raw = await job.proc.stdout.readline()
            if not raw:
                break
            line = raw.decode("utf-8", "replace").rstrip("\n")
            if line.startswith("@@event "):
                try:
                    ev = json.loads(line[8:])
                    events.emit(ev.pop("type"), **ev)
                except (json.JSONDecodeError, KeyError):
                    job.log.append(line)
                continue
            job.log.append(line)
        job.rc = await job.proc.wait()
    except Exception as exc:                                       # noqa: BLE001
        job.log.append(f"[kitchen] {type(exc).__name__}: {exc}")
        job.rc = -1
    job.ended = time.time()
    try:
        FINISHERS[job.kind](job)
    except Exception as exc:                                       # noqa: BLE001
        job.log.append(f"[kitchen] could not read the result: {type(exc).__name__}: {exc}")
    job.state = "done" if job.rc == 0 else "error"
    if job.episode is not None:
        events.emit("episode_done", job=job.kind, rc=job.rc)


async def stop(kind: str) -> bool:
    j = JOBS.get(kind)
    if j and j.proc and j.state == "running":
        j.proc.terminate()
        return True
    return False


# ── exam ─────────────────────────────────────────────────────────────────────
def _exam(judge: str | None = None, **_) -> Job:
    judge = judge or state.STATE.get("judge", "everyone_ate")      # the switch decides, unless told otherwise
    cfg = "exam/eval_config_rating.json" if judge == "rating" else "exam/eval_config.json"
    stamp = time.strftime("%Y%m%d-%H%M%S")
    receipts = RUNS / "exam" / f"{stamp}.jsonl"
    receipts.parent.mkdir(parents=True, exist_ok=True)
    criteria = _criteria(ROOT / cfg)
    # the judge label is what actually runs — read from the criteria, not from the switch
    ran = "rating" if "rating" in criteria else "everyone_ate" if "everyone_ate" in criteria else "text"
    job = Job("exam", [ADK, "eval", "host", "exam/parties_val.evalset.json", "--config_file_path", cfg],
              extra_env={"TABLE_RECEIPTS": str(receipts)},
              meta={"judge": ran, "switch": judge, "config": cfg, "criteria": criteria, "instruction": instruction_kind(),
                    "receipts": str(receipts.relative_to(ROOT))})
    job.episode = events.start_episode("exam", judge=judge, criteria=criteria, instruction=job.meta["instruction"])
    return job


def _criteria(cfg: Path) -> list[str]:
    try:
        return list(json.loads(cfg.read_text()).get("criteria", {}).keys())
    except Exception:                                              # noqa: BLE001
        return []


def _finish_exam(job: Job) -> None:
    text = "\n".join(job.log)
    passed = re.search(r"Tests passed:\s*(\d+)", text)
    failed = re.search(r"Tests failed:\s*(\d+)", text)
    rows = []
    rp = ROOT / job.meta["receipts"]
    if rp.exists():
        for line in rp.read_text().splitlines():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    hungry = sum(sum(1 for s in r.get("seats", []) if not s.get("ate")) for r in rows if r.get("metric") == "everyone_ate")
    seats = sum(len(r.get("seats", [])) for r in rows if r.get("metric") == "everyone_ate")
    parties = [{"party": r.get("party"), "restaurant": r.get("restaurant"), "time": r.get("time"), "score": r.get("score"),
                "hungry": sum(1 for s in r.get("seats", []) if not s.get("ate")) if r.get("metric") == "everyone_ate" else None}
               for r in rows]
    job.summary = {"passed": int(passed.group(1)) if passed else None, "failed": int(failed.group(1)) if failed else None,
                   "hungry": hungry if seats else None, "seats": seats or None, "parties": parties,
                   "judge": job.meta["judge"], "criteria": job.meta["criteria"], "instruction": job.meta["instruction"]}
    if job.rc == 0 and passed:
        state.push("exams", {k: v for k, v in job.summary.items() if k != "parties"} | {"parties": parties})
    events.emit("exam_scored", **{k: v for k, v in job.summary.items() if k != "parties"})


# ── optimize ─────────────────────────────────────────────────────────────────
def _optimize(**_) -> Job:
    (RUNS / "optimize").mkdir(parents=True, exist_ok=True)
    job = Job("optimize", [ADK, "optimize", "host", "--sampler_config_file_path", "exam/sampler_config.json",
                           "--optimizer_config_file_path", "exam/optimizer_config.json"],
              meta={"instruction": instruction_kind()})
    job.episode = events.start_episode("optimize")
    return job


def _finish_optimize(job: Job) -> None:
    text = "\n".join(job.log)
    m = re.search(r"Optimized root agent instructions:\s*\n-{5,}\n(.*?)\n={5,}", text, re.S)
    if m:
        winner = m.group(1).strip() + "\n"
        (RUNS / "optimize" / "winner.txt").write_text(winner)
        state.set_("optimized", True)
        job.summary = {"winner_chars": len(winner), "saved": "runs/optimize/winner.txt"}
        events.emit("candidate_proposed", candidate_id="GEPA", proposer="adk optimize",
                    diff=[{"op": "+", "line": line[:110]} for line in winner.splitlines() if line.strip()][:8])
    else:
        job.summary = {"winner_chars": 0, "note": "no 'Optimized root agent instructions' block in the output"}


# ── the loop ─────────────────────────────────────────────────────────────────
def _loop(**_) -> Job:
    job = Job("loop", [PY, "loop/flywheel.py"], extra_env={"TABLE_EMIT": "json"},
              meta={"edge": _edge_present()})
    job.episode = events.start_episode("loop", edge=job.meta["edge"])
    return job


def _edge_present() -> bool:
    from kitchen import codefile
    try:
        src = codefile.strip_comments((ROOT / "loop" / "flywheel.py").read_text())
    except OSError:
        return False
    return bool(re.search(r"\(\s*proposer\s*,\s*publish\s*,\s*host\s*\)", src))


def _finish_loop(job: Job) -> None:
    ep = job.episode
    rounds = [e for e in events.LOG if e["ep"] == ep and e["type"] == "holdout_scored"]
    gate = events.last("gate_decided", ep)
    closed = any(e["ep"] == ep and e["type"] == "episode_done" and e.get("loop") for e in events.LOG)
    job.summary = {"rounds": len(rounds), "decision": gate.get("decision") if gate else None,
                   "score": gate.get("score") if gate else None, "closed": closed, "edge": job.meta["edge"]}
    state.push("loops", job.summary)


# ── course VI ────────────────────────────────────────────────────────────────
def _deploy(**_) -> Job:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    region = os.environ.get("DEPLOY_REGION", "us-central1")
    # ADK reads the agent package's own .env at deploy — keep host/.env a copy.
    if (ROOT / ".env").exists():
        shutil.copy(ROOT / ".env", ROOT / "host" / ".env")
    job = Job("deploy", [ADK, "deploy", "agent_engine", "--project", project, "--region", region,
                         "--display_name", "table-for-n host", "--otel_to_cloud", "host"],
              meta={"project": project, "region": region, "instruction": instruction_kind()})
    job.episode = events.start_episode("deploy", project=project)
    return job


def _finish_deploy(job: Job) -> None:
    text = "\n".join(job.log)
    m = re.findall(r"projects/[\w.-]+/locations/[\w-]+/reasoningEngines/\d+", text)
    if m:
        engine = m[-1]
        env.write_env_line("HOST_ENGINE", engine)
        state.set_("engine", engine)
        job.summary = {"engine": engine}
        events.emit("deployed", engine=engine)
    else:
        job.summary = {"engine": "", "note": "no reasoningEngines resource name in the output"}


def _traffic(**_) -> Job:
    job = Job("traffic", [PY, "refuel/send_traffic.py"], extra_env={"TABLE_EMIT": "json"})
    job.episode = events.start_episode("traffic")
    return job


def _pipe(**_) -> Job:
    job = Job("pipe", [PY, "refuel/replay_to_bq.py"])
    job.episode = events.start_episode("pipe")
    return job


def _harvest(**_) -> Job:
    job = Job("harvest", [PY, "refuel/harvest.py"], extra_env={"TABLE_EMIT": "json"})
    job.episode = events.start_episode("harvest")
    return job


def _finish_harvest(job: Job) -> None:
    text = "\n".join(job.log)
    minted = len(re.findall(r"\[mint\]", text))
    skipped = len(re.findall(r"\[skip\]", text))
    out = ROOT / "exam" / "harvested.evalset.json"
    cases = 0
    if out.exists():
        try:
            cases = len(json.loads(out.read_text()).get("eval_cases", []))
        except json.JSONDecodeError:
            pass
    job.summary = {"minted": minted, "skipped": skipped, "cases": cases}
    state.set_("harvest", {"minted": max(minted, cases), "skipped": skipped, "ts": time.time()})


def _noop(job: Job) -> None:
    job.summary = {"rc": job.rc}


BUILDERS = {"exam": _exam, "optimize": _optimize, "loop": _loop, "deploy": _deploy,
            "traffic": _traffic, "pipe": _pipe, "harvest": _harvest}
FINISHERS = {"exam": _finish_exam, "optimize": _finish_optimize, "loop": _finish_loop, "deploy": _finish_deploy,
             "traffic": _noop, "pipe": _noop, "harvest": _finish_harvest}


def views() -> dict:
    return {k: j.view() for k, j in JOBS.items()}

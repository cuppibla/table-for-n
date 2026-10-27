"""Long things run as subprocesses, their output streamed to the page.

    exam      adk eval host exam/parties_val.evalset.json --config_file_path …  (via scripts/exam.py, one party at a time)
    optimize  adk optimize host …                       (course III, ~8 min)
    loop      python loop/flywheel.py                   (course V)
    deploy    adk deploy agent_engine host …            (course VI)
    traffic   python refuel/send_traffic.py             (course VI)
    pipe      python refuel/replay_to_bq.py             (course VI)
    harvest   python refuel/harvest.py                  (course VI)

  the second seating — the maître d', same scripts/exam.py:
    path_exam adk eval maitre_d exam/paths_val.evalset.json …          (course X)
    talk_exam adk eval maitre_d exam/conversations_val.evalset.json …  (course XI, a simulated organizer)

One job of each kind at a time. A line a subprocess prints as `@@event {…}`
is appended to the table's event log (the loop talks to the table that way);
every other line is its log. When a job ends, its summary is written to
state (exams, loops, harvest, paths, talks) — that is what lights a course.
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
        # stdin=DEVNULL matters: `bash table.sh` runs in a terminal, uvicorn
        # inherits that tty, and so would `adk eval` — which, on a machine that
        # has never answered ADK's telemetry question, stops to ask it on a
        # tty and waits forever. No tty, no question (ADK checks isatty()).
        job.proc = await asyncio.create_subprocess_exec(
            *job.argv, cwd=str(ROOT), env=penv, stdin=asyncio.subprocess.DEVNULL,
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
    # scripts/exam.py is `adk eval` with parallelism 1: a new project's per-minute
    # quota cannot take four parties at once (429 RESOURCE_EXHAUSTED, then back-off)
    job = Job("exam", [PY, "scripts/exam.py", "host", "exam/parties_val.evalset.json", "--config_file_path", cfg],
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


def _text_of(content: dict | None) -> str:
    return "".join(p.get("text", "") for p in ((content or {}).get("parts") or []))


def _parties(log_text: str, receipts: list[dict]) -> list[dict]:
    """One row per party: the verdict ADK wrote (any metric) + our receipt (seats)."""
    import world
    by_party = {r.get("party"): r for r in receipts if r.get("party")}
    verdicts: dict[str, dict] = {}
    m = re.search(r"Writing eval result to file:\s*(\S+?\.json)", log_text)
    if m and Path(m.group(1)).exists():
        try:
            data = json.loads(Path(m.group(1)).read_text())
            for c in data.get("eval_case_results", []):
                om = (c.get("overall_eval_metric_results") or [{}])[0]
                per = (c.get("eval_metric_result_per_invocation") or [{}])[0]
                verdicts[c.get("eval_id")] = {"status": {1: "PASSED", 2: "FAILED"}.get(c.get("final_eval_status"), "NOT_EVALUATED"),
                                              "score": om.get("score"), "metric": om.get("metric_name"),
                                              # the answer ADK graded, kept so course IV can grade it again three ways
                                              "answer": _text_of((per.get("actual_invocation") or {}).get("final_response"))}
        except (json.JSONDecodeError, OSError):
            pass
    order = list(world.HOLDOUT) + [p for p in list(verdicts) + list(by_party) if p not in world.HOLDOUT]
    out = []
    for pid in dict.fromkeys(order):
        v, r = verdicts.get(pid, {}), by_party.get(pid, {})
        if not v and not r:
            continue
        seats_ = r.get("seats", []) if r.get("metric") == "everyone_ate" else None
        out.append({"party": pid, "status": v.get("status"), "score": v.get("score", r.get("score")),
                    "answer": (v.get("answer") or "")[:700] or None,
                    "restaurant": r.get("restaurant"), "time": r.get("time"),
                    "hungry": sum(1 for x in seats_ if not x.get("ate")) if seats_ is not None else None,
                    "whys": [f"{x.get('name')}: {x.get('why')}" for x in (seats_ or []) if not x.get("ate")]})
    return out


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
    parties = _parties(text, rows)
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


# ── the second seating: the maître d's two exams ─────────────────────────────
PATH_CONFIG = "exam/eval_config_path.json"
TALK_CONFIG = "exam/eval_config_conversation.json"
TALK_SET = "exam/conversations_val.evalset.json"
STATUS = {1: "PASSED", 2: "FAILED", 3: "NOT_EVALUATED"}
TALK_JUDGE = "rubric_based_multi_turn_trajectory_quality_v1"
STAND_IN = "per_turn_user_simulator_quality_v1"     # grades the simulated organizer, not the agent


def persona(path: Path | None = None) -> str | None:
    """Who the simulated organizer is: EXPERT as shipped, NOVICE once course
    XI's edit is in — read from the eval set, like everything else here."""
    try:
        cases = json.loads((path or ROOT / TALK_SET).read_text()).get("eval_cases", [])
    except (OSError, json.JSONDecodeError):
        return None
    seen = set()
    for c in cases:
        p = (c.get("conversation_scenario") or {}).get("user_persona")
        seen.add(p.get("id") if isinstance(p, dict) else p)    # a persona is a name or a whole object
    seen.discard(None)
    return seen.pop() if len(seen) == 1 else ("mixed" if seen else None)


def _seating(kind: str, suite: str, evalset: str, cfg: str, **extra) -> Job:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    receipts = RUNS / suite / f"{stamp}.jsonl"
    receipts.parent.mkdir(parents=True, exist_ok=True)
    criteria = _criteria(ROOT / cfg)
    meta = {"suite": suite, "config": cfg, "evalset": evalset, "criteria": criteria,
            "instruction": instruction_kind("maitre_d"), "receipts": str(receipts.relative_to(ROOT)), **extra}
    # the same scripts/exam.py as course II — `adk eval`, one case at a time
    job = Job(kind, [PY, "scripts/exam.py", "maitre_d", evalset, "--config_file_path", cfg],
              extra_env={"TABLE_RECEIPTS": str(receipts)}, meta=meta)
    job.episode = events.start_episode(kind, agent="maitre_d", criteria=criteria, instruction=meta["instruction"], **extra)
    return job


def _path_exam(**_) -> Job:
    return _seating("path_exam", "paths", "exam/paths_val.evalset.json", PATH_CONFIG)


def _talk_exam(**_) -> Job:
    return _seating("talk_exam", "talks", TALK_SET, TALK_CONFIG, persona=persona())


def _read_receipts(path: Path) -> list[dict]:
    rows = []
    if path.exists():
        for line in path.read_text().splitlines():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return rows


def _calls_of(inv: dict) -> list[dict]:
    """The tool calls in one recorded turn, in order (live runs record events;
    an eval set's golden turn records tool_uses)."""
    data = inv.get("intermediate_data") or {}
    out = [{"name": p["function_call"].get("name"), "args": p["function_call"].get("args") or {}}
           for ev in data.get("invocation_events") or []
           for p in ((ev.get("content") or {}).get("parts") or []) if p.get("function_call")]
    return out or [{"name": t.get("name"), "args": t.get("args") or {}} for t in data.get("tool_uses") or []]


def _call_label(c: dict) -> str:
    a = c.get("args") or {}
    if c.get("name") == "book":
        return f"book {a.get('room')} {a.get('time')} ×{a.get('party_size')}"
    return f"get_room {a.get('room')}" if c.get("name") == "get_room" else str(c.get("name"))


def _judges_on(per: list[dict], pid: str) -> tuple[dict, list[dict]]:
    """Every judge in the room on one recorded case: the trajectory comparator
    four ways (when the case holds a golden path), the path checker and
    everyone_ate — whichever of them the exam had on its criteria. Nothing
    is re-run; it is the same calls, read again. The case's verdict stays ADK's."""
    import world
    from google.adk.evaluation.eval_case import Invocation
    from kitchen import paths as eight
    from metrics import path as path_checker
    from metrics import table
    act = [Invocation.model_validate(p["actual_invocation"]) for p in per if p.get("actual_invocation")]
    exp = [Invocation.model_validate(p["expected_invocation"]) for p in per if p.get("expected_invocation")]
    if not act:
        return {}, []
    out: dict[str, bool] = {}
    if len(exp) == len(act) == 1:
        for name, match, ignore in eight.MATCHES:
            out[name] = eight._comparator(act[0], exp[0], match, ignore) == 1.0  # noqa: SLF001
    ids = world.PARTIES.get(pid) or []
    rules = path_checker.path_checks(path_checker.tool_calls(act), ids, table.reply_of(act))
    out["path"] = all(r["ok"] for r in rules)
    rid, at, _ = table.booking_of(act)
    out["everyone_ate"] = bool(rid) and world.everyone_ate(ids, rid, at)[0] >= world.THRESHOLD
    return out, rules


def _finish_seating(job: Job) -> None:
    """One row per party: ADK's verdict and every metric's, our receipts (who
    went hungry, which rule broke, whose need was heard), and — for the path
    exam — what each judge would have said about the very same calls."""
    import world
    from kitchen import paths as eight
    text = "\n".join(job.log)
    suite = job.meta["suite"]
    mine = {(r["party"], r["metric"]): r for r in _read_receipts(ROOT / job.meta["receipts"])
            if r.get("party") and r.get("metric")}
    m = re.search(r"Writing eval result to file:\s*(\S+?\.json)", text)
    cases = []
    if m and Path(m.group(1)).exists():
        cases = json.loads(Path(m.group(1)).read_text()).get("eval_case_results", [])
    parties = []
    for c in cases:
        pid = c.get("eval_id")
        per = c.get("eval_metric_result_per_invocation") or []
        metrics = {r.get("metric_name"): {"status": STATUS.get(r.get("eval_status"), "NOT_EVALUATED"),
                                          "score": None if r.get("score") is None else round(r["score"], 3)}
                   for r in c.get("overall_eval_metric_results") or []}
        ea, pr, ab = (mine.get((pid, k), {}) for k in ("everyone_ate", "path", "asked_before_booking"))
        seats_ = ea.get("seats") or []
        judges, rules = _judges_on(per, pid)
        row = {"party": pid, "status": STATUS.get(c.get("final_eval_status"), "NOT_EVALUATED"),
               "metrics": metrics, "turns": len(per), "judges": judges, "rules": pr.get("rules") or rules,
               "restaurant": ea.get("restaurant"), "time": ea.get("time"),
               "hungry": sum(1 for s in seats_ if not s.get("ate")) if seats_ else None,
               "whys": [f"{s.get('name')}: {s.get('why')}" for s in seats_ if not s.get("ate")],
               "calls": [_call_label(x) for p in per for x in _calls_of(p.get("actual_invocation") or {})]}
        if suite == "talks":
            last = next((r for r in ((per[-1].get("eval_metric_results") or []) if per else [])
                         if r.get("metric_name") == TALK_JUDGE), {})
            row |= {"heard": ab.get("heard"), "missed": ab.get("missed"), "booked_on_turn": ab.get("booked_on_turn"),
                    # the rubric judge's three verdicts, each with the sentence it wrote
                    "rubrics": [{"id": s.get("rubric_id"), "score": s.get("score"), "why": (s.get("rationale") or "")[:400]}
                                for s in ((last.get("details") or {}).get("rubric_scores") or [])],
                    "transcript": [{"user": _text_of((p.get("actual_invocation") or {}).get("user_content"))[:400],
                                    "calls": [_call_label(x) for x in _calls_of(p.get("actual_invocation") or {})],
                                    "reply": _text_of((p.get("actual_invocation") or {}).get("final_response"))[:400]}
                                   for p in per]}
        parties.append(row)
    order = {p: i for i, p in enumerate(world.HOLDOUT)}
    parties.sort(key=lambda r: order.get(r["party"], 99))

    passed = re.search(r"Tests passed:\s*(\d+)", text)
    failed = re.search(r"Tests failed:\s*(\d+)", text)
    fed = [r for r in parties if r["hungry"] is not None]
    summary = {"suite": suite, "agent": "maitre_d", "criteria": job.meta["criteria"], "instruction": job.meta["instruction"],
               "passed": int(passed.group(1)) if passed else sum(r["status"] == "PASSED" for r in parties),
               "failed": int(failed.group(1)) if failed else sum(r["status"] == "FAILED" for r in parties),
               "n": len(parties),
               "by_metric": {k: {"passed": sum(r["metrics"].get(k, {}).get("status") == "PASSED" for r in parties),
                                 "failed": sum(r["metrics"].get(k, {}).get("status") == "FAILED" for r in parties)}
                             for k in job.meta["criteria"]},
               "hungry": sum(r["hungry"] for r in fed) if fed else None,
               "seats": sum(len(world.PARTIES.get(r["party"], [])) for r in fed) or None,
               # everyone ate, but the path broke a rule: a pass a path judge would take back
               "lucky": sum(1 for r in parties if r["judges"].get("everyone_ate") and r["judges"].get("path") is False)}
    if suite == "paths":
        names = [x[0] for x in eight.MATCHES] + ["path", "everyone_ate"]
        summary["ladder"] = {k: sum(1 for r in parties if r["judges"].get(k)) for k in names}
    else:
        summary |= {"persona": job.meta.get("persona"),
                    "rushed": sum(1 for r in parties if (r["metrics"].get("asked_before_booking", {}).get("score") or 0) < 1),
                    "stand_in_slipped": sum(1 for r in parties if r["metrics"].get(STAND_IN, {}).get("status") == "FAILED"),
                    "turns": sum(r["turns"] for r in parties)}
    job.summary = summary | {"parties": parties}
    if job.rc == 0 and parties:
        state.push(suite, summary | {"parties": parties})
    events.emit("exam_scored", **summary)


BUILDERS = {"exam": _exam, "optimize": _optimize, "loop": _loop, "deploy": _deploy,
            "traffic": _traffic, "pipe": _pipe, "harvest": _harvest,
            "path_exam": _path_exam, "talk_exam": _talk_exam}
FINISHERS = {"exam": _finish_exam, "optimize": _finish_optimize, "loop": _finish_loop, "deploy": _finish_deploy,
             "traffic": _noop, "pipe": _noop, "harvest": _finish_harvest,
             "path_exam": _finish_seating, "talk_exam": _finish_seating}


def views() -> dict:
    return {k: j.view() for k, j in JOBS.items()}

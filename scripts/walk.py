"""The headless learner: walks courses II–VII against a running kitchen, the way
a person would from the page — the same /api routes, the same edits, the
same jobs — and reports which courses lit. Course I (the workbench) and
course VIII (the check) are not walked. Neither is XII; the second seating's
IX–XI are, after the first.

    uv run python scripts/walk.py                 # II–VII and IX–XI, leaves the repo as the walk left it
    uv run python scripts/walk.py --restore       # …then puts the files back as shipped
    uv run python scripts/walk.py --only 7        # one course
    TABLE_URL=http://localhost:3480 …             # another port

Exit code 0 when every walked course lit.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

URL = os.environ.get("TABLE_URL", "http://127.0.0.1:3470").rstrip("/")


def api(path: str, body: dict | None = None, method: str | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + "/api" + path, data=data, method=method or ("POST" if data else "GET"),
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def say(msg: str) -> None:
    print(f"[walk] {msg}", flush=True)


def wait_job(kind: str, limit: float = 240) -> dict:
    t0 = time.time()
    while time.time() - t0 < limit:
        j = api(f"/job?kind={kind}")
        if j["state"] in ("done", "error"):
            return j
        time.sleep(1.5)
    raise TimeoutError(f"{kind} did not finish in {limit:.0f} s")


def run_job(kind: str, limit: float = 240, **opts) -> dict:
    api("/job", {"kind": kind, **opts})
    j = wait_job(kind, limit)
    s = j.get("summary", {})
    say(f"{kind}: {j['state']} in {j['elapsed']} s · {json.dumps({k: v for k, v in s.items() if k != 'parties'})[:160]}")
    if j["state"] != "done":
        print("\n".join(j["log"][-12:]))
    return j


def edit(path: str, fn, symbol: str | None = None) -> None:
    f = api(f"/code?path={path}" + (f"&symbol={symbol}" if symbol else ""))
    new = fn(f["content"])
    if new == f["content"]:
        say(f"{path}: already edited")
        return
    out = api("/code", {"path": path, "content": new, "symbol": symbol})
    if not out["validation"]["valid"]:
        raise RuntimeError(f"{path}: {out['validation']['message']}")
    say(f"{path}: saved ({out['validation']['message']})")


def lit(n: int) -> bool:
    return bool(api("/progress")["lit"].get(str(n)))


def course2() -> bool:
    run_job("exam")                                             # as shipped: response_match_score
    return lit(2)


def course3() -> bool:
    edit("exam/eval_config.json", lambda s: re.sub(r'"response_match_score"\s*:\s*[0-9.]+', '"everyone_ate": 0.9', s))
    run_job("exam")
    b = api("/book", {"party": "p1"})
    say(f"book p1 under the draft: {b.get('restaurant')} {b.get('time')} honest {b.get('honest')} hungry {b.get('hungry')}")
    return lit(3)


def course4() -> bool:
    f = api("/flight", {"party": "p1"})
    s_ = f["summary"]
    say(f"flight: comparator {s_['comparator_passed']}/{s_['n']} · checker {s_['checker_passed']}/{s_['n']} · llm {s_['llm_passed']}/{s_['n']}"
        f" · fed-but-failed-text {s_['fed_but_failed_text']} · llm-disagrees {s_['llm_disagrees']}")
    return lit(4)


def course5() -> bool:
    p = api("/progress")
    which = "optimized" if p.get("optimized") else "winner"
    say(f"install {which}: {api('/install', {'which': which})}")
    run_job("exam")
    b = api("/book", {"party": "p1"})
    say(f"book p1 under the {which}: {b.get('restaurant')} {b.get('time')} honest {b.get('honest')} hungry {b.get('hungry')}")
    return lit(5)


def course6() -> bool:
    say(f"install hacked: {api('/install', {'which': 'hacked'})}")
    api("/judge", {"to": "rating"})
    run_job("exam")
    b = api("/book", {"party": "p1"})
    say(f"book p1 under hacked, rating judge: {b.get('restaurant')} rating {b.get('rating')} honest {b.get('honest')}")
    api("/judge", {"to": "everyone_ate"})
    run_job("exam")
    return lit(6)


def course7() -> bool:
    edit("loop/flywheel.py", lambda s: re.sub(r"^(\s*)# (\(proposer, publish, host\),)", r"\1\2", s, flags=re.M), symbol="build")
    run_job("loop")
    return lit(7)


# ── the second seating: the maître d' ──
def course9() -> bool:
    b = api("/book", {"party": "p1", "agent": "maitre_d"})
    path = b.get("path") or {}
    say(f"the maître d' books p1: {b.get('restaurant')} {b.get('time')} · {len(b.get('calls') or [])} calls"
        f" · path {'held' if path.get('passed') else 'broke ' + ', '.join(path.get('broken') or [])} · hungry {b.get('hungry')}")
    return lit(9)


def course10() -> bool:
    run_job("path_exam")                                        # as shipped: the trajectory comparator, EXACT
    edit("exam/eval_config_path.json", lambda s: re.sub(r'"tool_trajectory_avg_score"\s*:\s*\{[^}]*\}', '"path": 1.0', s))
    run_job("path_exam")                                        # the path checker
    return lit(10)


def course11() -> bool:
    talk = 900                                                  # four conversations, five judges: 3–5 min each
    run_job("talk_exam", limit=talk)                            # EXPERT · draft, as shipped
    edit("exam/conversations_val.evalset.json", lambda s: re.sub(r'"user_persona"\s*:\s*"EXPERT"', '"user_persona": "NOVICE"', s))
    run_job("talk_exam", limit=talk)                            # NOVICE · draft
    say(f"install asks: {api('/install', {'which': 'asks', 'agent': 'maitre_d'})}")
    run_job("talk_exam", limit=talk)                            # NOVICE · asks
    return lit(11)


def restore() -> None:
    say("restoring the files as shipped")
    edit("exam/eval_config.json", lambda s: re.sub(r'"everyone_ate"\s*:\s*0\.9', '"response_match_score": 0.3', s, count=1))
    edit("loop/flywheel.py", lambda s: re.sub(r"^(\s*)(\(proposer, publish, host\),)", r"\1# \2", s, flags=re.M), symbol="build")
    api("/install", {"which": "draft"})
    api("/judge", {"to": "everyone_ate"})
    edit("exam/eval_config_path.json", lambda s: re.sub(r'"path"\s*:\s*1\.0', '"tool_trajectory_avg_score": { "threshold": 1.0, "match_type": "EXACT" }', s, count=1))
    edit("exam/conversations_val.evalset.json", lambda s: re.sub(r'"user_persona"\s*:\s*"NOVICE"', '"user_persona": "EXPERT"', s))
    api("/install", {"which": "draft", "agent": "maitre_d"})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", type=int)
    ap.add_argument("--restore", action="store_true")
    a = ap.parse_args()
    try:
        h = api("/health")
    except urllib.error.URLError as exc:
        print(f"no kitchen at {URL}: {exc}")
        return 2
    say(f"kitchen at {URL} · mode {h['mode']} · instruction {h['instruction']}")
    steps = {2: course2, 3: course3, 4: course4, 5: course5, 6: course6, 7: course7, 9: course9, 10: course10, 11: course11}
    todo = [a.only] if a.only else [2, 3, 4, 5, 6, 7, 9, 10, 11]
    results: dict[int, bool] = {}
    for n in todo:
        say(f"── course {n} ──")
        try:
            results[n] = steps[n]()
        except Exception as exc:                                   # noqa: BLE001
            say(f"course {n} failed: {type(exc).__name__}: {exc}")
            results[n] = False
        say(f"course {n}: {'LIT ✓' if results[n] else 'not lit ✗'}")
    p = api("/progress")
    print("\nlit:", p["lit"])
    for e in p.get("exams", [])[-6:]:
        print(f"  exam  {e['judge']:<13} {e['instruction']:<10} passed {e['passed']}/8  hungry {e['hungry']}")
    for l in p.get("loops", [])[-3:]:
        print(f"  loop  rounds {l['rounds']}  decision {l['decision']}  edge {l['edge']}")
    for s in (p.get("paths") or [])[-2:] + (p.get("talks") or [])[-3:]:
        judges = " · ".join(f"{k} {v['passed']}/{s['n']}" for k, v in (s.get("by_metric") or {}).items())
        who = f"{s.get('persona')} · " if s.get("persona") else ""
        print(f"  {s['suite']:<5} {who}{s['instruction']:<6} passed {s['passed']}/{s['n']}  {judges}")
    if a.restore:
        restore()
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())

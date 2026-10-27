"""🧾 The receipt — course IX. One booking, read back out of BigQuery.

The BigQuery Agent Analytics plugin (host/agent.py, `analytics()`) writes one
row per event while the host books. With `create_eval_views=True` the plugin
also creates two views next to the table; `v_eval_turn` folds a booking's
rows into ONE row per invocation: the user text, the answer, the tool calls,
the instruction the host ran under — as an `AgentData` trace — plus guardrail
columns the warehouse computes without a model (`has_error`, `has_tool_loop`,
latency, tokens) and `eval_ready`, which says the turn is whole.

This module asks that view for the dinner you just booked. Nothing here
grades; the checker grades in refuel/harvest.py, after the fact.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time

from kitchen import env, events, state

log = logging.getLogger("kitchen.receipt")

_client = None


def _bq():
    global _client
    if _client is None:
        from google.cloud import bigquery
        _client = bigquery.Client(project=env.analytics()["project"])
    return _client


def view_ref(which: str = "eval_turn") -> str:
    a = env.analytics()
    return f"{a['project']}.{a['dataset']}.v_{which}"


def table_ref() -> str:
    a = env.analytics()
    return f"{a['project']}.{a['dataset']}.{a['table']}"


def _text_of(content) -> str:
    """The text parts of a genai Content as the view stores it."""
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except json.JSONDecodeError:
            return content
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts") or []
    return "".join(p.get("text") or "" for p in parts if isinstance(p, dict)).strip()


def _summarize(trace: dict) -> dict:
    """What the page shows of the AgentData trace: the agents (with their
    instruction) and the events, one short line each."""
    agents = trace.get("agents") or {}
    lines = []
    for turn in trace.get("turns") or []:
        for ev in turn.get("events") or []:
            content = ev.get("content") or {}
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    content = {"parts": [{"text": content}]}
            parts = content.get("parts") or [] if isinstance(content, dict) else []
            kind, text = "text", _text_of(content)
            for p in parts:
                if isinstance(p, dict) and p.get("function_call"):
                    kind, text = "function_call", json.dumps(p["function_call"])[:200]
                elif isinstance(p, dict) and p.get("function_response"):
                    kind, text = "function_response", json.dumps(p["function_response"])[:200]
            lines.append({"author": ev.get("author"), "kind": kind, "text": text[:400], "at": ev.get("event_time")})
    return {"agents": {k: {"instruction": (v or {}).get("instruction", ""),
                           "tools": len(((v or {}).get("tools") or [{}])[0].get("function_declarations", []) if (v or {}).get("tools") else [])}
                       for k, v in agents.items()},
            "events": lines}


def _query(session_id: str) -> list[dict]:
    from google.cloud import bigquery
    sql = f"""
    SELECT session_id, invocation_id, user_id, turn_start_timestamp, eval_ready,
           has_error, tool_error_count, llm_error_count, agent_error_count,
           has_tool_loop, has_truncated_content, distinct_tools_used,
           total_prompt_tokens, total_completion_tokens, total_tokens, turn_latency_ms,
           TO_JSON_STRING(trace) AS trace_json
    FROM `{view_ref('eval_turn')}`
    WHERE session_id = @session
    ORDER BY turn_start_timestamp
    """
    cfg = bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("session", "STRING", session_id)])
    out = []
    for r in _bq().query(sql, job_config=cfg).result():
        row = dict(r)
        ts = row.pop("turn_start_timestamp", None)
        row["turn_start"] = ts.isoformat() if ts is not None else None
        trace = json.loads(row.pop("trace_json") or "{}")
        row["trace"] = _summarize(trace)
        row["trace_bytes"] = len(json.dumps(trace))
        out.append(row)
    return out


def _count_rows(session_id: str) -> int:
    from google.cloud import bigquery
    sql = f"SELECT COUNT(*) AS n FROM `{table_ref()}` WHERE session_id = @session"
    cfg = bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("session", "STRING", session_id)])
    return int(next(iter(_bq().query(sql, job_config=cfg).result())).n)


async def fetch(session_id: str, wait: float = 20.0) -> dict:
    """The row(s) for one session — polling a little, because the view is
    eventually consistent with the Storage Write API's commit."""
    a = env.analytics()
    if not a["dataset"]:
        return {"ok": False, "error": "no BQ_ANALYTICS_DATASET in .env", "session": session_id, "turns": [], **a}
    t0 = time.time()
    turns: list[dict] = []
    raw = 0
    err = ""
    while time.time() - t0 < wait:
        try:
            turns = await asyncio.to_thread(_query, session_id)
            raw = await asyncio.to_thread(_count_rows, session_id)
        except Exception as exc:                                   # noqa: BLE001
            err = f"{type(exc).__name__}: {str(exc)[:240]}"
            log.warning("receipt: %s", err)
            if "Not found" in str(exc) and "v_eval_turn" in str(exc):
                err = ("v_eval_turn does not exist yet — the plugin creates it on the first booking it records "
                       "(is the edit in host/agent.py, and the dataset in .env?). " + err)
                break
        if turns and all(t.get("eval_ready") for t in turns):
            break
        await asyncio.sleep(2.0)
    ok = bool(turns)
    if ok:
        n = state.STATE.get("receipts", 0) + 1
        state.set_("receipts", n)
        t = turns[-1]
        events.emit("row_landed", session=session_id, invocation=t["invocation_id"], eval_ready=t["eval_ready"],
                    has_error=t["has_error"], has_tool_loop=t["has_tool_loop"], latency_ms=t["turn_latency_ms"],
                    tokens=t["total_tokens"], rows=raw)
    return {"ok": ok, "session": session_id, "turns": turns, "rows": raw, "waited": round(time.time() - t0, 1),
            "error": err or None, "view": view_ref("eval_turn"), "table": table_ref(), **a}

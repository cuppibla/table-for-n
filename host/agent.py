"""The dinner-booking host.

Its instruction is NOT in this file. It lives next door in
`instruction_current.txt` — the one artifact the whole lab is about. Course III
lets the optimizer rewrite that file; course IV installs a hacked version of
it; course V's loop rewrites it round by round while the graph is running.
The agent itself never changes: same model, same settings, same name.

`HOST_THINKING` (default 0) is the one dial we keep off on purpose. At 1024
the day-one draft nearly aces the exam and there is no story left to tell;
at 0 the draft fails honestly, a good instruction recovers most of the exam,
and the last latecomer-times-last-orders tables stay out of reach — which is
the point: an instruction has a ceiling, and what lies past it is a different
lever.
"""
from __future__ import annotations

import hashlib
import os

from google.adk.agents import Agent
from google.adk.apps import App
from google.genai import types

_HERE = os.path.dirname(os.path.abspath(__file__))
INSTRUCTION_FILE = os.path.join(_HERE, "instruction_current.txt")
MODEL = "gemini-2.5-flash"
THINKING = int(os.environ.get("HOST_THINKING", "0"))


def read_instruction() -> str:
    with open(INSTRUCTION_FILE, encoding="utf-8") as f:
        return f.read()


INSTRUCTION = read_instruction()

root_agent = Agent(
    name="host",
    model=MODEL,
    instruction=INSTRUCTION,
    generate_content_config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_budget=THINKING),
        temperature=0.0,
    ),
)


def analytics() -> list:
    """Course IX — the receipt. One row per event, into BigQuery, from
    whichever process runs this host: the page's 📋 button, `adk eval`,
    the loop, or the Agent Engine the deploy job ships it to.

    Off unless `.env` names a dataset (`BQ_ANALYTICS_DATASET`), so courses
    I–VIII run exactly as before on a laptop with only an API key. The
    plugin records; it never judges. `create_eval_views=True` makes
    BigQuery fold the rows into one turn per booking (`v_eval_turn`), with
    the instruction the host ran under inside the trace.
    """
    dataset = os.environ.get("BQ_ANALYTICS_DATASET", "").strip()
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
    if not dataset or not project:
        return []
    from google.adk.plugins.bigquery_agent_analytics_plugin import BigQueryAgentAnalyticsPlugin, BigQueryLoggerConfig

    return [BigQueryAgentAnalyticsPlugin(
        project_id=project,
        dataset_id=dataset,
        location=os.environ.get("BQ_ANALYTICS_LOCATION", "US"),
        config=BigQueryLoggerConfig(
            table_id=os.environ.get("BQ_ANALYTICS_TABLE", "agent_events"),
            create_eval_views=True,                                    # v_eval_turn · v_eval_session
            # The page wants the row there by the time you press 🧾, so it
            # flushes at the end of each run. A deployed host sets BQ_FLUSH=0
            # and lets the background writer take it off the response path.
            flush_on_run_end=os.environ.get("BQ_FLUSH", "1") != "0",
            enable_otel_correlation=True,                              # joins pipe ① (Cloud Trace) to pipe ②
            custom_tags={"lab": "table-for-n",
                         "instruction_sha": hashlib.sha1(INSTRUCTION.encode()).hexdigest()[:10]},
        ),
    )]


app = App(
    name="host",
    root_agent=root_agent,
    plugins=[],                      # ← course IX: plugins=analytics()
)

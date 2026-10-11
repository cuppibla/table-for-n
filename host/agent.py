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

import os

from google.adk.agents import Agent
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

"""The maître d' — the host with a phone. The second seating's agent.

A second agent next to `host/`, not a change to it: every number the first
seating measured stays valid. Same model, same thinking dial, same
temperature; the differences are three tools (`tools.py`) and a brief with
the group chat only — the listings are no longer pasted in, the maître d'
has to call for them. Between the chat and the reply there is now a path.

Its instruction lives next door in `instruction_current.txt`, like the
host's, and is read once at import; the kitchen re-imports this module on
every 📋 booking.
"""
from __future__ import annotations

import os

from google.adk.agents import Agent
from google.genai import types

from . import tools

_HERE = os.path.dirname(os.path.abspath(__file__))
INSTRUCTION_FILE = os.path.join(_HERE, "instruction_current.txt")
MODEL = "gemini-2.5-flash"
THINKING = int(os.environ.get("HOST_THINKING", "0"))


def read_instruction() -> str:
    with open(INSTRUCTION_FILE, encoding="utf-8") as f:
        return f.read()


INSTRUCTION = read_instruction()

root_agent = Agent(
    name="maitre_d",
    model=MODEL,
    instruction=INSTRUCTION,
    tools=[tools.list_rooms, tools.get_room, tools.book],
    generate_content_config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_budget=THINKING),
        temperature=0.0,
    ),
)

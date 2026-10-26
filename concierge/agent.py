"""The tool-using, conversational dinner concierge (courses VIII & IX).

`host/` (courses I–VII) is a pure text agent: every restaurant card is pasted
into the prompt, and one turn produces one JSON string. `concierge/` has hands
and a conversation: public listings hide the kitchen traps behind tools, and in
course IX the party holds its constraints back until the concierge asks.
"""
from __future__ import annotations

import os
import sys

from google.adk.agents import Agent
from google.genai import types

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
import world  # noqa: E402

INSTRUCTION_FILE = os.path.join(_HERE, "instruction_current.txt")
MODEL = "gemini-2.5-flash"
THINKING = int(os.environ.get("HOST_THINKING", "0"))


def read_instruction() -> str:
    with open(INSTRUCTION_FILE, encoding="utf-8") as f:
        return f.read()


def list_restaurants(max_price: int = 100, max_walk_min: int = 60) -> dict:
    """List nearby restaurants within `max_price` ($/person) and `max_walk_min` (minutes on foot).

    Returns public listing fields only (rating, cuisine, price, walk, earliest seating, queue).
    Does NOT include dietary, allergen, spice, or last-order rules — call `inspect_kitchen` for those.
    """
    rows = world.public_listings(max_price=max_price, max_walk_min=max_walk_min)
    return {"count": len(rows), "restaurants": rows}


def inspect_kitchen(restaurant_id: str) -> dict:
    """Inspect a restaurant's kitchen sheet: vegan/vegetarian mains, nut/shellfish safety, spice rules, and last-order cutoff."""
    return world.kitchen_sheet(restaurant_id)


def check_seating(restaurant_id: str, time: str, party_size: int = 2) -> dict:
    """Check actual seated time (including earliest seating and queue) and whether the kitchen is still taking orders at `time` (24-hour HH:MM)."""
    return world.seating_status(restaurant_id, time, party_size=party_size)


def book_table(restaurant_id: str, time: str, party_size: int = 2) -> dict:
    """Commit the reservation for `party_size` guests at `restaurant_id` at `time` (24-hour HH:MM). Call ONLY once when ready to lock the table."""
    rid = world.find_restaurant(restaurant_id)
    if rid is None:
        return {"booked": False, "error": f"unknown restaurant {restaurant_id!r}"}
    status = world.seating_status(rid, time, party_size=party_size)
    if not status.get("ok"):
        return {"booked": False, "error": status.get("error", "invalid time")}
    return {
        "booked": True,
        "ticket_id": f"TKT-{rid.upper()}-{status['requested_time'].replace(':', '')}",
        "restaurant_id": rid,
        "restaurant": world.RESTAURANTS[rid]["name"],
        "time": status["requested_time"],
        "actual_seated_time": status["actual_seated_time"],
        "last_order": status["last_order"],
        "party_size": party_size,
    }


INSTRUCTION = read_instruction()

root_agent = Agent(
    name="concierge",
    model=MODEL,
    instruction=INSTRUCTION,
    tools=[list_restaurants, inspect_kitchen, check_seating, book_table],
    generate_content_config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_budget=THINKING),
        temperature=0.0,
    ),
)

"""The maître d's three tools — facts, not verdicts.

Nothing here knows who is in the party. `world.everyone_ate` stays the judge's
alone: the agent has to carry each guest's need from the chat to the facts
these tools return. That carrying is the path — the thing the first seating's
judges never saw.

In this world the side effect is the call itself: every `book` call is a
reservation, so the trajectory IS the restaurant's reservation book.
"""
from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import world  # noqa: E402

_HHMM = re.compile(r"^\d{1,2}:\d{2}$")


def list_rooms() -> list[dict]:
    """Restaurants with a table tonight, the way the listings app shows them."""
    return [{"room": rid, "name": r["name"], "cuisine": r["cuisine"], "rating": r["rating"], "tag": r["tag"]}
            for rid, r in world.RESTAURANTS.items()]


def get_room(room: str) -> dict:
    """What the restaurant tells you on the phone: hours, price, walk, kitchen.

    Args:
      room: the restaurant id from list_rooms (for example "olive").
    """
    rid = world.find_restaurant(room)
    if rid is None:
        return {"error": f"no restaurant called {room!r} — call list_rooms first"}
    r = world.RESTAURANTS[rid]
    return {
        "room": rid, "name": r["name"],
        "price_per_head": r["price"], "walk_min": r["walk_min"],
        "first_seating": r["earliest"], "last_orders": r.get("last_order", "21:30"),
        "queue_min": r["queue_min"],
        "vegetarian_main": r["veg"], "vegan": r["vegan"],
        "nut_safe": r["nut_safe"], "shellfish_safe": r["shellfish_safe"],
        "spice": r["spice"], "spice_on_the_side": r["spice_optional"],
        "kitchen_notes": list(r["notes"].values()),
    }


def book(room: str, time: str, party_size: int) -> dict:
    """Reserves a table. Every call is a real reservation — call it once.

    Args:
      room: the restaurant id from list_rooms.
      time: 24-hour "HH:MM".
      party_size: how many people are coming.
    """
    rid = world.find_restaurant(room)
    if rid is None:
        return {"status": "error", "error": f"no restaurant called {room!r}"}
    if not _HHMM.match(time or ""):
        return {"status": "error", "error": "time must be 24-hour HH:MM"}
    seated = world.seated_at(world.RESTAURANTS[rid], world._t(time))  # noqa: SLF001
    return {"status": "confirmed", "room": rid, "time": time, "party_size": party_size,
            "seated_at": world._fmt(seated)}  # noqa: SLF001

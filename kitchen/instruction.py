"""Which instruction an agent is running under — read from the file, by
content. The page never tracks what you clicked; it compares bytes.

Two agents, each with its own file and its own small library:

    host       host/instruction_current.txt       draft · winner · hacked · optimized
    maitre_d   maitre_d/instruction_current.txt   draft · asks           (the second seating)

Every function takes `agent`, and defaults to the host — the first seating
calls them exactly as it always did.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS: dict[str, tuple[Path, dict[str, Path]]] = {
    "host": (ROOT / "host" / "instruction_current.txt", {
        "draft": ROOT / "instructions" / "draft.txt",
        "winner": ROOT / "instructions" / "winner.txt",
        "hacked": ROOT / "instructions" / "hacked.txt",
        "optimized": ROOT / "runs" / "optimize" / "winner.txt",
    }),
    # course XI's one line — ask before you book — is the only difference
    "maitre_d": (ROOT / "maitre_d" / "instruction_current.txt", {
        "draft": ROOT / "instructions" / "maitre_d_draft.txt",
        "asks": ROOT / "instructions" / "maitre_d_asks.txt",
    }),
}
CURRENT, LIBRARY = AGENTS["host"]


def _paths(agent: str) -> tuple[Path, dict[str, Path]]:
    if agent not in AGENTS:
        raise KeyError(agent)
    return AGENTS[agent]


def _norm(text: str) -> str:
    return "\n".join(line.rstrip() for line in text.strip().splitlines())


def current(agent: str = "host") -> str:
    cur, _ = _paths(agent)
    return cur.read_text() if cur.exists() else ""


def kind(agent: str = "host") -> str:
    """'draft' · 'winner' · 'hacked' · 'optimized' · 'asks' · 'custom' · 'missing'."""
    cur, library = _paths(agent)
    if not cur.exists():
        return "missing"
    now = _norm(current(agent))
    for name, path in library.items():
        if path.exists() and _norm(path.read_text()) == now:
            return name
    return "custom"


def install(which: str, agent: str = "host") -> dict:
    """Copy one of the library's instructions over the agent's. The next
    booking, exam or workbench run reads it."""
    cur, library = _paths(agent)
    if which not in library:
        raise KeyError(which)
    src = library[which]
    if not src.exists():
        raise FileNotFoundError(f"{which}: {src.relative_to(ROOT)} does not exist yet")
    cur.write_text(src.read_text())
    return {"installed": which, "agent": agent, "chars": len(src.read_text()), "kind": kind(agent)}


def available(agent: str = "host") -> dict[str, bool]:
    _, library = _paths(agent)
    return {k: p.exists() for k, p in library.items()}

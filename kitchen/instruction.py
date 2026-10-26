"""Which instruction the host is running under — read from the file, by
content. The page never tracks what you clicked; it compares bytes."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURRENT = ROOT / "host" / "instruction_current.txt"
LIBRARY = {
    "draft": ROOT / "instructions" / "draft.txt",
    "winner": ROOT / "instructions" / "winner.txt",
    "hacked": ROOT / "instructions" / "hacked.txt",
    "optimized": ROOT / "runs" / "optimize" / "winner.txt",
}


def _norm(text: str) -> str:
    return "\n".join(line.rstrip() for line in text.strip().splitlines())


def current() -> str:
    return CURRENT.read_text() if CURRENT.exists() else ""


def kind() -> str:
    """'draft' · 'winner' · 'hacked' · 'optimized' · 'custom' · 'missing'."""
    if not CURRENT.exists():
        return "missing"
    now = _norm(current())
    for name, path in LIBRARY.items():
        if path.exists() and _norm(path.read_text()) == now:
            return name
    return "custom"


def install(which: str) -> dict:
    """Copy one of the library's instructions over the host's. The next
    booking, exam or workbench run reads it."""
    if which not in LIBRARY:
        raise KeyError(which)
    src = LIBRARY[which]
    if not src.exists():
        raise FileNotFoundError(f"{which}: {src.relative_to(ROOT)} does not exist yet")
    CURRENT.write_text(src.read_text())
    return {"installed": which, "chars": len(src.read_text()), "kind": kind()}


def available() -> dict[str, bool]:
    return {k: p.exists() for k, p in LIBRARY.items()}


CONCIERGE_CURRENT = ROOT / "concierge" / "instruction_current.txt"
CONCIERGE_LIBRARY = {
    "eager": ROOT / "instructions" / "concierge_eager.txt",
    "eliciting": ROOT / "instructions" / "concierge_eliciting.txt",
}


def concierge_current() -> str:
    return CONCIERGE_CURRENT.read_text() if CONCIERGE_CURRENT.exists() else ""


def concierge_kind() -> str:
    """'eager' · 'eliciting' · 'custom' · 'missing'."""
    if not CONCIERGE_CURRENT.exists():
        return "missing"
    now = _norm(concierge_current())
    for name, path in CONCIERGE_LIBRARY.items():
        if path.exists() and _norm(path.read_text()) == now:
            return name
    return "custom"


def concierge_install(which: str) -> dict:
    """Copy one of the concierge instructions over concierge/instruction_current.txt."""
    if which not in CONCIERGE_LIBRARY:
        raise KeyError(which)
    src = CONCIERGE_LIBRARY[which]
    if not src.exists():
        raise FileNotFoundError(f"{which}: {src.relative_to(ROOT)} does not exist yet")
    CONCIERGE_CURRENT.write_text(src.read_text())
    return {"target": "concierge", "installed": which, "chars": len(src.read_text()), "kind": concierge_kind()}

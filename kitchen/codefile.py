"""The in-page editor's back end: read and write ONE file (or one top-level
symbol of a Python file) from a short allow-list. Python is syntax-checked
and JSON is parsed before anything is written; the page never holds a copy
of your code — it shows the file on disk.

Borrowed from Agent Valley's shared editor (itself from VibeStudio's
workbench), trimmed to what this table needs.
"""
from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# path → what the course says about it
FILES: dict[str, str] = {
    "exam/eval_config.json": "course III — which metric is on the exam",
    "loop/flywheel.py": "course VII — the edge that makes a graph a loop",
    "host/instruction_current.txt": "the instruction the host runs under (the loop rewrites it; you can read it)",
    "exam/eval_config_trajectory.json": "course VIII — which trajectory metric grades the concierge's tool calls",
    "concierge/instruction_current.txt": "course IX — the instruction the conversational concierge runs under",
    "exam/eval_config_multiturn.json": "course IX — the multi-turn metric and user simulator config",
}


def resolve(path: str) -> Path:
    if path not in FILES:
        raise KeyError(f"{path} is not open to the editor")
    return ROOT / path


def validate(path: str, content: str) -> dict:
    if path.endswith(".py"):
        try:
            ast.parse(content, filename=path)
        except SyntaxError as e:
            return {"valid": False, "message": f"SyntaxError: {e.msg}", "line": e.lineno}
        return {"valid": True, "message": "Python syntax OK"}
    if path.endswith(".json"):
        try:
            json.loads(content)
        except json.JSONDecodeError as e:
            return {"valid": False, "message": f"JSON: {e.msg}", "line": e.lineno}
        return {"valid": True, "message": "JSON OK"}
    return {"valid": True, "message": "OK"}


def symbol_span(content: str, symbol: str) -> tuple[int, int] | None:
    """1-based inclusive line span of a top-level `def symbol` or `symbol = …`,
    extended over the indented comment lines right after the body."""
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return None
    lines = content.splitlines()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == symbol:
            start = min([node.lineno] + [d.lineno for d in node.decorator_list])
            end = node.end_lineno or node.lineno
            while end < len(lines) and lines[end].strip().startswith("#") and lines[end][:1] in (" ", "\t"):
                end += 1
            return start, end
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == symbol
                                                for t in node.targets):
            return node.lineno, node.end_lineno or node.lineno
    return None


def read(path: str, symbol: str | None = None) -> dict:
    p = resolve(path)
    content = p.read_text()
    v = validate(path, content)
    if not symbol:
        return {"path": path, "content": content, "validation": v}
    span = symbol_span(content, symbol)
    if span is None:
        raise KeyError(f"{symbol} is not a top-level symbol of {path}")
    lines = content.splitlines(keepends=True)
    return {"path": path, "symbol": symbol, "span": list(span),
            "content": "".join(lines[span[0] - 1:span[1]]), "validation": v}


def write(path: str, content: str, symbol: str | None = None) -> dict:
    """Write the whole file, or splice `content` over that one symbol. The
    result carries the check; nothing invalid reaches the disk."""
    p = resolve(path)
    if symbol:
        current = p.read_text()
        span = symbol_span(current, symbol)
        if span is None:
            return {"path": path, "symbol": symbol, "content": content,
                    "validation": {"valid": False, "message": f"{symbol} is no longer in the file on disk"}}
        lines = current.splitlines(keepends=True)
        new = content if content.endswith("\n") else content + "\n"
        whole = "".join(lines[:span[0] - 1]) + new + "".join(lines[span[1]:])
        v = validate(path, whole)
        if not v["valid"]:
            return {"path": path, "symbol": symbol, "content": content, "validation": v}
        if symbol_span(whole, symbol) is None:
            return {"path": path, "symbol": symbol, "content": content,
                    "validation": {"valid": False, "message": f"the edit removed `{symbol}` — keep its name"}}
        _write(p, whole)
        return read(path, symbol)
    v = validate(path, content)
    if not v["valid"]:
        return {"path": path, "content": content, "validation": v}
    _write(p, content)
    return read(path)


def strip_comments(src: str) -> str:
    """Python source without its comment lines — the 👉 notes quote the very
    line we look for, so facts are read from code, never from comments."""
    out = []
    for line in src.splitlines():
        s = line.strip()
        if s.startswith("#"):
            continue
        out.append(line.split("  #")[0] if "  #" in line else line)
    return "\n".join(out)


def _write(p: Path, content: str) -> None:
    p.write_text(content)
    for pyc in (p.parent / "__pycache__").glob(f"{p.stem}.*.pyc"):
        try:
            pyc.unlink()
        except OSError:
            pass

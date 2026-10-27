"""The kitchen as shipped — the three files the courses edit, as a fresh
clone must find them. Run before you commit:

    uv run pytest tests/test_shipped.py

Every one of these has been committed mid-course at least once (the host
running the hacked instruction, everyone_ate already on the exam, the back
edge already in), which quietly skips the lesson for the next student.
`scripts/reset.py` puts them back.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _norm(text: str) -> str:
    return "\n".join(line.rstrip() for line in text.strip().splitlines())


def test_host_runs_the_draft():
    assert _norm((ROOT / "host" / "instruction_current.txt").read_text()) == _norm((ROOT / "instructions" / "draft.txt").read_text()), \
        "host/instruction_current.txt must be the day-one draft (instructions/draft.txt) — run scripts/reset.py"


def test_exam_runs_the_text_metric():
    cfg = json.loads((ROOT / "exam" / "eval_config.json").read_text())
    assert list(cfg["criteria"]) == ["response_match_score"], \
        "exam/eval_config.json must ship with response_match_score in criteria — the student puts everyone_ate on the exam in course III"
    assert "everyone_ate" in cfg.get("customMetrics", {}), "everyone_ate must stay declared under customMetrics"


def test_flywheel_has_no_back_edge():
    src = (ROOT / "loop" / "flywheel.py").read_text()
    assert re.search(r"^\s*# \(proposer, publish, host\),", src, re.M), \
        "loop/flywheel.py must ship with the back edge commented out — the student writes it in course VII"


def test_host_ships_without_the_recorder():
    """Course IX's edit is the student's. As shipped, host/agent.py's App has
    no plugins — and even with the edit in, no dataset in .env means no
    plugin, so courses I–VIII never touch BigQuery."""
    src = (ROOT / "host" / "agent.py").read_text()
    assert re.search(r"^\s*plugins=\[\],", src, re.M), \
        "host/agent.py must ship with plugins=[] in App(...) — the student writes plugins=analytics() in course IX"
    import os
    os.environ.pop("BQ_ANALYTICS_DATASET", None)
    from host import agent
    assert agent.analytics() == []
    assert agent.app.plugins == []

"""The kitchen as shipped — the files the courses edit, as a fresh clone must
find them. Run before you commit:

    uv run pytest tests/test_shipped.py

Every one of these has been committed mid-course at least once (the host
running the hacked instruction, everyone_ate already on the exam, the back
edge already in), which quietly skips the lesson for the next student.
`scripts/reset.py` puts them back. The second seating's three are checked
the same way.
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


# ── the second seating ───────────────────────────────────────────────────────
def test_maitre_d_runs_its_draft():
    assert _norm((ROOT / "maitre_d" / "instruction_current.txt").read_text()) == _norm((ROOT / "instructions" / "maitre_d_draft.txt").read_text()), \
        "maitre_d/instruction_current.txt must be its draft (instructions/maitre_d_draft.txt) — course XI installs the line that asks; run scripts/reset.py"


def test_path_exam_runs_the_comparator():
    cfg = json.loads((ROOT / "exam" / "eval_config_path.json").read_text())
    assert cfg["criteria"].get("tool_trajectory_avg_score", {}).get("match_type") == "EXACT" and "path" not in cfg["criteria"], \
        "exam/eval_config_path.json must ship with the trajectory comparator (EXACT) in criteria — the student puts the path checker on in course X"
    assert "path" in cfg.get("customMetrics", {}), "the path checker must stay declared under customMetrics"


def test_conversation_exam_ships_with_experts():
    data = json.loads((ROOT / "exam" / "conversations_val.evalset.json").read_text())
    personas = {c["conversation_scenario"]["user_persona"] for c in data["eval_cases"]}
    assert personas == {"EXPERT"}, \
        "exam/conversations_val.evalset.json must ship with EXPERT organizers — the student makes them NOVICE in course XI"

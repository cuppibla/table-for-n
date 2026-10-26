"""Pytest regression harness for the tool-using concierge (courses VIII & IX).

    uv run pytest tests/test_concierge.py

Mirrors `tests/test_host.py`: runs `AgentEvaluator.evaluate_eval_set` on
`concierge/` and writes to the shared local eval history store
(`concierge/.adk/eval_history/`), so CI runs show up in `adk web` too.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from google.adk.evaluation.agent_evaluator import AgentEvaluator
from google.adk.evaluation.eval_config import get_evaluation_criteria_or_default
from google.adk.evaluation.local_eval_set_results_manager import LocalEvalSetResultsManager
from google.adk.evaluation.local_eval_sets_manager import load_eval_set_from_file

ROOT = Path(__file__).resolve().parents[1]


def test_concierge_trajectory_exam():
    config = get_evaluation_criteria_or_default(str(ROOT / "exam" / "eval_config_trajectory.json"))
    eval_set = load_eval_set_from_file(str(ROOT / "exam" / "concierge_trajectory.evalset.json"), "concierge_trajectory")
    asyncio.run(AgentEvaluator.evaluate_eval_set(
        agent_module="concierge",
        eval_set=eval_set,
        eval_config=config,
        num_runs=1,
        app_name="concierge",
        eval_set_results_manager=LocalEvalSetResultsManager(agents_dir=str(ROOT)),
    ))

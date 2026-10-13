"""The third way to run the exam — pytest.

    uv run pytest tests/test_host.py

Same agent (host/), same evalset (exam/parties_val.evalset.json), same
eval_config.json the 📝 button and `adk eval` use, and the same local eval
store (host/.adk/eval_history/), so this run shows up in the workbench's
Evals history next to the others. The only difference is what a failure
does: here it fails the build.

This is the shape to copy into your own regression suite. The 🧪 button on
course II runs exactly this file.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from google.adk.evaluation.agent_evaluator import AgentEvaluator
from google.adk.evaluation.eval_config import get_evaluation_criteria_or_default
from google.adk.evaluation.local_eval_set_results_manager import LocalEvalSetResultsManager
from google.adk.evaluation.local_eval_sets_manager import load_eval_set_from_file

ROOT = Path(__file__).resolve().parents[1]


def test_the_holdout_feeds_everyone():
    config = get_evaluation_criteria_or_default(str(ROOT / "exam" / "eval_config.json"))
    eval_set = load_eval_set_from_file(str(ROOT / "exam" / "parties_val.evalset.json"), "parties_val")
    asyncio.run(AgentEvaluator.evaluate_eval_set(
        agent_module="host",
        eval_set=eval_set,
        eval_config=config,
        num_runs=1,
        app_name="host",
        eval_set_results_manager=LocalEvalSetResultsManager(agents_dir=str(ROOT)),   # ← the shared store
    ))

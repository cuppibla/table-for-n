"""`adk eval`, one party at a time.

The CLI runs four parties in parallel and has no flag to change that. On a
brand-new Google Cloud project the per-minute quota for gemini-2.5-flash is
small, four at once trips 429 RESOURCE_EXHAUSTED, and the exam spends most of
its time in back-off. This is the same `adk eval`, same arguments, same eval
history — with ADK's parallelism set to TABLE_EXAM_PARALLELISM (default 1)
before the CLI starts.

    uv run python scripts/exam.py host exam/parties_val.evalset.json --config_file_path exam/eval_config.json
"""
from __future__ import annotations

import os
import sys

from google.adk.evaluation import base_eval_service as _b

_N = max(1, int(os.environ.get("TABLE_EXAM_PARALLELISM", "1")))
for _cfg in (_b.InferenceConfig, _b.EvaluateConfig):
    _cfg.model_fields["parallelism"].default = _N
    _cfg.model_rebuild(force=True)

from google.adk.cli.cli_tools_click import main  # noqa: E402

if __name__ == "__main__":
    sys.argv = [sys.argv[0], "eval", *sys.argv[1:]]
    main()

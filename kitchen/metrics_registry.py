"""Teach the workbench the lab's judges.

`adk eval` reads `customMetrics` from the config you pass it, so the exam
knows `everyone_ate` and `rating`. The dev UI mounted at /workbench has no
config to read: its Run-evaluation dialog lists whatever is in ADK's default
metric registry. Registering the same configs there, once at startup, puts
every judge in that dialog (the second seating's path checker and
asked_before_booking too) — and lets the workbench grade an eval set with
your judge, the same function `adk eval` runs.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

log = logging.getLogger("kitchen.metrics")
ROOT = Path(__file__).resolve().parents[1]
CONFIGS = (ROOT / "exam" / "eval_config.json", ROOT / "exam" / "eval_config_rating.json",
           # the second seating's: the path checker, and did-it-ask-before-booking
           ROOT / "exam" / "eval_config_path.json", ROOT / "exam" / "eval_config_conversation.json")


def register() -> list[str]:
    try:
        from google.adk.evaluation.eval_config import EvalConfig
        from google.adk.evaluation.metric_evaluator_registry import register_custom_metrics_from_config
    except Exception as exc:                                       # noqa: BLE001 — eval extra missing
        log.warning("custom metrics not registered for the workbench: %s", exc)
        return []
    names: list[str] = []
    for path in CONFIGS:
        try:
            cfg = EvalConfig(**json.loads(path.read_text()))
            register_custom_metrics_from_config(cfg)              # into the DEFAULT registry
            names += list((cfg.custom_metrics or {}).keys())
        except Exception as exc:                                   # noqa: BLE001
            log.warning("%s: %s", path.name, exc)
    return list(dict.fromkeys(names))          # everyone_ate is declared in three configs; name it once

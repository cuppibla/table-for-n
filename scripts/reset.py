"""Clear the table: put the five files the courses edit back the way a fresh
clone ships them, and the switch back to everyone_ate.

    uv run python scripts/reset.py            # files + the switch
    uv run python scripts/reset.py --receipts # …and forget every exam, loop, flight and simulation

Nothing to restart — the kitchen re-reads the files on the next 📋 or 📝.
For the author: run this before `git commit`; tests/test_shipped.py checks it.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# byte-for-byte what a fresh clone ships: the comparator on the exam, the
# checker declared under it (the editor's "line 3" edit depends on this shape)
SHIPPED_EVAL_CONFIG = """{
  "criteria": {
    "response_match_score": 0.3
  },
  "customMetrics": {
    "everyone_ate": {
      "codeConfig": { "name": "metrics.table.everyone_ate_metric" },
      "description": "How many of the party actually got dinner."
    }
  }
}
"""

SHIPPED_TRAJECTORY_CONFIG = """{
  "criteria": {
    "tool_trajectory_avg_score": { "threshold": 1.0, "match_type": "EXACT" }
  },
  "customMetrics": {
    "kitchen_ticket": {
      "codeConfig": { "name": "metrics.table.kitchen_ticket_metric" },
      "description": "Did the concierge inspect the kitchen before booking once — and did everyone eat?"
    }
  }
}
"""


def main() -> int:
    # 1 · the host runs the day-one draft
    shutil.copyfile(ROOT / "instructions" / "draft.txt", ROOT / "host" / "instruction_current.txt")
    print("  ✓ host/instruction_current.txt ← instructions/draft.txt")

    # 2 · the exam runs the built-in text metric; everyone_ate stays declared, not on the exam
    cfg_path = ROOT / "exam" / "eval_config.json"
    cfg_path.write_text(SHIPPED_EVAL_CONFIG)
    print("  ✓ exam/eval_config.json · criteria: response_match_score 0.3")

    # 3 · the flywheel has no way back yet
    fw = ROOT / "loop" / "flywheel.py"
    src = fw.read_text()
    src2 = re.sub(r"^(\s*)\(proposer, publish, host\),", r"\1# (proposer, publish, host),", src, flags=re.M)
    fw.write_text(src2)
    print("  ✓ loop/flywheel.py · the back edge is commented out" + ("" if src2 != src else " (already)"))

    # 4 · course VIII's trajectory exam ships with ADK's EXACT trajectory comparator
    (ROOT / "exam" / "eval_config_trajectory.json").write_text(SHIPPED_TRAJECTORY_CONFIG)
    print("  ✓ exam/eval_config_trajectory.json · criteria: tool_trajectory_avg_score (EXACT)")

    # 5 · course IX's concierge ships with the eager turn-1 booking instruction
    shutil.copyfile(ROOT / "instructions" / "concierge_eager.txt", ROOT / "concierge" / "instruction_current.txt")
    print("  ✓ concierge/instruction_current.txt ← instructions/concierge_eager.txt")

    # 6 · the switch
    st = ROOT / "runs" / "state.json"
    if st.exists():
        try:
            data = json.loads(st.read_text())
        except json.JSONDecodeError:
            data = {}
        data["judge"] = "everyone_ate"
        if "--receipts" in sys.argv:
            for k in ("exams", "loops", "bookings", "flights", "traj_exams", "mt_exams"):
                data[k] = []
            print("  ✓ receipts forgotten (exams, loops, bookings, flights, traj_exams, mt_exams)")
        st.write_text(json.dumps(data, indent=1))
    print("  ✓ the switch · everyone_ate")
    print("\n  the table is cleared. nothing to restart.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

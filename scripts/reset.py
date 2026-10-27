"""Clear the table: put the files the courses edit back the way a fresh clone
ships them, and the switch back to everyone_ate. Both seatings: the host's
three files, and the maître d's three.

    uv run python scripts/reset.py            # files + the switch
    uv run python scripts/reset.py --receipts # …and forget every exam, loop, flight and walk

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
sys.path.insert(0, str(ROOT / "scripts"))

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

# the second seating's, same idea: the trajectory comparator on the path exam,
# the path checker declared under it (course X's "line 4" edit depends on it)
SHIPPED_PATH_CONFIG = """{
  "criteria": {
    "everyone_ate": 0.9,
    "tool_trajectory_avg_score": { "threshold": 1.0, "match_type": "EXACT" }
  },
  "customMetrics": {
    "everyone_ate": {
      "codeConfig": { "name": "metrics.table.everyone_ate_metric" },
      "description": "How many of the party actually got dinner — graded on the reservation (the last book call), not on the reply."
    },
    "path": {
      "codeConfig": { "name": "metrics.path.path_metric" },
      "description": "Did the booking come from looking? Four rules over the tool calls, each with a why."
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

    # 4 · the second seating: the maître d' runs its draft (course XI installs "asks")
    shutil.copyfile(ROOT / "instructions" / "maitre_d_draft.txt", ROOT / "maitre_d" / "instruction_current.txt")
    print("  ✓ maitre_d/instruction_current.txt ← instructions/maitre_d_draft.txt")

    # 5 · the path exam runs the trajectory comparator; the path checker stays declared
    (ROOT / "exam" / "eval_config_path.json").write_text(SHIPPED_PATH_CONFIG, encoding="utf-8")
    print("  ✓ exam/eval_config_path.json · criteria: everyone_ate + tool_trajectory_avg_score EXACT")

    # 6 · the conversation exam's simulated organizers are EXPERTs again — the
    #     generator writes the four scenarios exactly as shipped, persona and all
    from make_paths_and_scenarios import TALK, eval_set, scenario_case
    conv = eval_set("conversations_val", [scenario_case(pid, "EXPERT") for pid in TALK])
    (ROOT / "exam" / "conversations_val.evalset.json").write_text(json.dumps(conv, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("  ✓ exam/conversations_val.evalset.json · user_persona: EXPERT")

    # 7 · the switch
    st = ROOT / "runs" / "state.json"
    if st.exists():
        try:
            data = json.loads(st.read_text())
        except json.JSONDecodeError:
            data = {}
        data["judge"] = "everyone_ate"
        if "--receipts" in sys.argv:
            for k in ("exams", "loops", "bookings", "flights", "paths", "talks"):
                data[k] = []
            print("  ✓ receipts forgotten (exams, loops, bookings, flights, paths, talks)")
        st.write_text(json.dumps(data, indent=1))
    print("  ✓ the switch · everyone_ate")
    print("\n  the table is cleared. nothing to restart.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

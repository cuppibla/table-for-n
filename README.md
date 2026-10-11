# Table for N

One table. N people. One agent books the restaurant. **How many of them actually ate?**

An interactive lab on **agent evaluation** and the **self-evolving loop**, built on the
[Agent Development Kit (ADK)](https://google.github.io/adk-docs/). Seven courses, one page:
you build the judge, let the agent rewrite itself, swap the judge and watch the number lie,
close the loop, and feed it tonight's failures.

| course | the concept | what you do on the page | the receipt that lights it |
|---|---|---|---|
| I · the booking | a reply is not a result | book a table in the workbench (adk web) | a session in `table.db` |
| II · the judge | a checker function as a custom `adk eval` metric | swap one line in `exam/eval_config.json` | the exam fails with hungry seats, named |
| III · the rewrite | `adk optimize` (GEPA) rewrites the instruction from the failures | ⚗ optimize, or install the prebaked winner · 🚪 ship gate | the gate opens on 8 parties the optimizer never saw |
| IV · the other judge | reward hacking: a proxy metric that cannot see harm | install the hacked instruction · flip the switch · exam twice | the same 8 dinners: rating 8/8 · honest ≤ 2/8 |
| V · the loop | an ADK 2 `Workflow` with a back edge — and a boundary you own | delete one `# ` in `loop/flywheel.py` · ↻ run | round 2 ran under round 1's rewrite and shipped |
| VI · refuel | production traces → BigQuery → harvest → the exam grows | ☁ deploy · ✉ traffic · ⛽ pipe · 🎣 harvest | `exam/harvested.evalset.json` has a new party |
| VII · the check | what each thing replaced | nothing | — |

*The loop pushes up whatever number you hand it.*

## Run it

```bash
git clone <this repo> && cd table-for-n
cp .env.example .env        # a Gemini API key, or a Google Cloud project (see the file)
uv sync
bash table.sh               # → http://localhost:3470
```

One process on one port serves the page, the host, the exams, the editor and the
workbench (`adk web`, mounted at `/workbench`). Nothing restarts: an edit lands on your
next 📋 booking or 📝 exam. Course VI needs a Google Cloud project with billing and
`gcloud auth application-default login`.

## What is where

```
world.py                 the cast (10 people, 10 restaurants, 16 parties) and the two judges as pure functions
host/                    the agent — its instruction lives in instruction_current.txt, the one artifact that changes
exam/                    evalsets (8 train, 8 holdout, golden answers in), eval_config.json (yours), eval_config_rating.json (the critic's)
metrics/table.py         everyone_ate_metric and rating_metric, wired into adk eval through customMetrics
instructions/            draft.txt · winner.txt (a real GEPA run, log included) · hacked.txt (a real run against the rating judge)
loop/flywheel.py         the self-evolving loop as an ADK 2 Workflow; the course-V edit is in build()
refuel/                  send_traffic.py · replay_to_bq.py · harvest.py — the production pipe
kitchen/                 the service: booking, jobs (exam/optimize/loop/deploy…), progress, the editor, the workbench mount
site/                    the page (Next.js, exported to static files once by table.sh)
scripts/walk.py          the headless learner: walks courses II–V against a running kitchen and reports what lit
scripts/make_evalsets.py regenerates the two exams from world.py
```

## Honest numbers

Every number on the page is read from something that ran on your machine: the exam counts
come from `adk eval`'s own summary, the hungry seats from the metric's per-seat receipts,
the loop's rounds from the graph's events. The prebaked artifacts in `instructions/` carry
the logs of the runs that produced them. The model is `gemini-2.5-flash` at `thinking_budget=0`
and `temperature=0`, on purpose: at higher thinking budgets the day-one draft nearly passes
the exam and there is nothing left to learn.

The checks are not a checklist. `kitchen/progress.py` pairs a fact read off your files
(which metric is in `criteria`, which instruction is installed, whether the back edge is in
the graph) with a receipt of something that actually ran. Both, or the plate stays empty.

## Lineage

The lab's world, judges, exams, optimizer runs and loop come from
[loop-lab-table](https://github.com/cuppibla/loop-lab-table) (terminal + `adk web` form).
The one-page interactive format comes from Agent Valley's Night Market. This repo is the
former, served the way the latter is.

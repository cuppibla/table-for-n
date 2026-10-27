# Table for N

One table. N people. One agent books the restaurant. **How many of them actually ate?**

An interactive lab on **agent evaluation** and the **self-evolving loop**, built on the
[Agent Development Kit (ADK)](https://google.github.io/adk-docs/). Eight courses, one page:
you watch a comparator fail a good dinner, build the judge and walk a table yourself, put
three judges on the same answers, let the agent rewrite itself, swap the judge and watch
the number lie, and close the loop. Then a second seating, four courses more, hands the
table to a maître d' — an agent with tools that takes questions — and grades what the
first seating's judges never saw: the path to the booking, and the conversation around it.

| course | the concept | what you do on the page | the receipt that lights it |
|---|---|---|---|
| I · the booking | a reply is not a result | book a table in the workbench (adk web) | a session in `table.db` |
| II · the comparator | one golden answer vs. a *set* of right answers · three ways to run one exam | 📝 run the exam as shipped (`response_match_score`) and read the verdicts | the text exam ran |
| III · the judge | a checker function as a custom `adk eval` metric · the six checks inside it | swap one line in `exam/eval_config.json` · 📋 book | the exam fails with hungry seats, named |
| IV · the flight | three metric families: comparator · checker · LLM-as-judge | ⚖ judge one answer three ways · press it again | a flight was judged |
| V · the rewrite | `adk optimize` (GEPA) rewrites the instruction from the failures | ⚗ optimize, or install the prebaked winner · 🚪 ship gate | the gate opens on 8 parties the optimizer never saw |
| VI · the other judge | reward hacking: a proxy metric that cannot see harm | install the hacked instruction · flip the switch · exam twice | the same 8 dinners: rating 8/8 · honest ≤ 2/8 |
| VII · the loop | an ADK 2 `Workflow` with a back edge — and a boundary you own | delete one `# ` in `loop/flywheel.py` · ↻ run | round 2 ran under round 1's rewrite and shipped |
| VIII · the check | what each thing replaced | nothing | — |

The second seating — about thirty minutes more, on the same page:

| course | the concept | what you do on the page | the receipt that lights it |
|---|---|---|---|
| IX · the maître d' | a booking that is a side effect: three tools, and every `book` call is a reservation | 📋 book with the maître d', or chat with `maitre_d` in the workbench | one booking by the maître d' |
| X · the path | `tool_trajectory_avg_score` against a golden path is a comparator again (EXACT · IN_ORDER · ANY_ORDER) · four rules over the calls instead | read the ⚖ eight-paths card · 📝 the path exam · swap line 4 of `exam/eval_config_path.json` · 📝 again | a path exam ran with the path checker on it |
| XI · the conversation | multi-turn eval: conversation scenarios, ADK's simulated user and its personas, a judge for the simulator itself | 📝 the conversation exam · persona EXPERT → NOVICE · ⤵ install the line that asks · 📝 after each | three runs: EXPERT · draft, NOVICE · draft, NOVICE · asks |
| XII · the second check | what each thing replaced | nothing | — |

Beyond the lab, `refuel/` holds the production pipe — deploy the shipped host to Agent
Engine, send traffic, replay it through the BigQuery agent-analytics plugin, and `harvest.py`
re-grades real dinners with `everyone_ate` and mints the failures as eval cases. It needs a
Google Cloud project with billing; the codelab's last chapter says where it fits.

*The loop pushes up whatever number you hand it.*

## Run it

### In Cloud Shell — what the codelab does

Two scripts, then one command. Nothing to install, nothing to paste: Cloud Shell
already has `gcloud`, Python, Node and `git`, and you are already signed in.
Gemini is reached through Vertex AI on your own project — no API key anywhere.

```bash
git clone https://github.com/cuppibla/table-for-n
cd table-for-n
./setup_project.sh                     # a billing-linked project, recorded in ~/project_id.txt
curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.local/bin/env
./setup_codelab.sh                     # API on, .venv, the page built, .env written, preflight
bash table.sh                          # one process, one port
```

`setup_project.sh` makes a **new** project every plain run. To continue in a
project from an earlier run instead:

```bash
TABLE_FOR_N_REUSE_PROJECT=1 ./setup_project.sh
```

Wait for `table.sh` to print **✓ the table is laid** — the kitchen takes up to
a minute to warm up, and it only prints the links once it answers on the port.
Then open the page through **Web Preview → Change port → 3470**. Port 3470 is
not in Web Preview's quick list, so that step is not optional. (If Web Preview
says *Unable to forward your request to a backend*, the kitchen was not up yet
— reload.)

### On a laptop

Needs Python 3.11+, `uv` and Node 20+. Either a Google Cloud project (then the
Cloud Shell path above works as is, after `gcloud auth application-default login`)
or an AI Studio key for courses I–V:

```bash
uv sync
cp .env.example .env                   # point at a project, or paste a key (see the file)
uv run python scripts/preflight.py     # is this machine ready — does the model answer?
bash table.sh                          # one process, one port
```

Open **http://localhost:3470**.

### Either way

Put your name on the reservation and follow the menu. Everything happens on that
page: you book, you edit the one line each course is about, the buttons run the
real `adk eval` / `adk optimize` / the loop, and the workbench (`adk web`) is a
drawer on the same page — same agent folders (`host/`, `maitre_d/`), same `table.db`.

Nothing restarts. An edit lands on your **next 📋 booking or 📝 exam**; the chip
under the editor says so. The `refuel/` pipe (deploy to Agent Engine) needs the project path.

## What is where

```
world.py                 the cast (10 people, 10 restaurants, 16 parties) and the two judges as pure functions
host/                    the agent — its instruction lives in instruction_current.txt, the one artifact that changes
maitre_d/                the second seating's agent: the group chat in, three tools (list_rooms · get_room · book), same model and dials
exam/                    evalsets (8 train, 8 holdout, golden answers in), eval_config.json (yours), eval_config_rating.json (the critic's)
                         paths_*.evalset.json (one turn, golden paths) · eval_config_path.json (yours, course X)
                         conversations_*.evalset.json (scenarios and personas, nothing golden) · eval_config_conversation.json (five judges)
metrics/table.py         everyone_ate_metric and rating_metric, wired into adk eval through customMetrics
metrics/path.py          path_metric: four rules over the tool calls, each with a why — no golden path
metrics/conversation.py  asked_before_booking_metric: had the organizer named each need before the first book call?
instructions/            draft.txt · winner.txt (a real GEPA run, log included) · hacked.txt (a real run against the rating judge)
                         maitre_d_draft.txt · maitre_d_asks.txt (course XI's one line)
loop/flywheel.py         the self-evolving loop as an ADK 2 Workflow; the course-VII edit is in build()
refuel/                  send_traffic.py · replay_to_bq.py · harvest.py — the production pipe (beyond the lab)
kitchen/                 the service: booking, jobs (exam/optimize/loop/deploy…), progress, the editor, the workbench mount
kitchen/paths.py         course X's card: eight ways to one dinner, every judge on each, no model call
site/                    the page (Next.js, exported to static files once by table.sh)
fixtures/replays.json    our recorded runs, both seatings — the ⤵ replay buttons, for a project out of quota
tests/test_host.py       the third way to run the exam: pytest + AgentEvaluator, same config, same eval store (course II's 🧪)
tests/test_shipped.py    the six edited files are as a fresh clone must find them — run before you commit
tests/test_second_seating.py  the second seating's judges, offline: the eight-paths card, one verdict per conversation, the eval sets
scripts/reset.py         clear the table, both seatings: draft instructions, the comparators on the exams, no back edge, EXPERT organizers (--receipts forgets the runs too)
scripts/walk.py          the headless learner: walks courses II–VII and IX–XI against a running kitchen and reports what lit
scripts/make_evalsets.py regenerates the two exams from world.py
scripts/make_paths_and_scenarios.py  regenerates the second seating's two exams from world.py
```

## Honest numbers

Every number on the page is read from something that ran on your machine: the exam counts
come from `adk eval`'s own summary, the hungry seats from the metric's per-seat receipts,
the loop's rounds from the graph's events. The prebaked artifacts in `instructions/` carry
the logs of the runs that produced them. The model is `gemini-2.5-flash` at `thinking_budget=0`
and `temperature=0`, on purpose: at higher thinking budgets the day-one draft nearly passes
the exam and there is nothing left to learn.

The second seating adds models that are not the agent: ADK's simulated organizer, which
plays the user in the conversation exam, and the rubric judges. They run at a small
thinking budget, and the simulator gets a judge of its own
(`per_turn_user_simulator_quality_v1`), so a verdict that came from the stand-in slipping
says so on the page instead of being charged to the maître d'. A conversation is many model
calls, and any of them can go another way, so its verdicts can move between runs;
`fixtures/replays.json` holds the runs we recorded.

The checks are not a checklist. `kitchen/progress.py` pairs a fact read off your files
(which metric is in `criteria`, which instruction is installed, whether the back edge is in
the graph) with a receipt of something that actually ran. Both, or the plate stays empty.

Six files are the lab's exercise surface. The first seating's three —
`host/instruction_current.txt`, `exam/eval_config.json`, `loop/flywheel.py` — and the
second's — `maitre_d/instruction_current.txt`, `exam/eval_config_path.json`,
`exam/conversations_val.evalset.json`. The kitchen rewrites them as you go.
`uv run python scripts/reset.py` puts them back as shipped; `uv run pytest tests/test_shipped.py`
refuses a commit that would ship them mid-course.

## Lineage

The lab's world, judges, exams, optimizer runs and loop come from
[loop-lab-table](https://github.com/cuppibla/loop-lab-table) (terminal + `adk web` form).
The one-page interactive format comes from Agent Valley's Night Market. This repo is the
former, served the way the latter is.

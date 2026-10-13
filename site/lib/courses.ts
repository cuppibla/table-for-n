import type { Progress } from "./api";

/** The eight courses. Each is what you do · what the table does (before and
 *  after) · the one edit or the buttons · one ✓. The ✓ is never ticked by
 *  the page: it comes from /api/progress, which reads your files and what
 *  actually ran. The course text is the app's; the codelab carries depth.
 *
 *  Logic keys off `key`, never off the number, so courses can be added or
 *  reordered without hunting for magic numbers. */

export type CourseKey = "booking" | "comparator" | "judge" | "flight" | "rewrite" | "other" | "loop" | "check";

export type Course = {
  n: number; r: string; key: CourseKey; t: string; pill: [string, string];
  judge?: "everyone_ate" | "rating";
  you: string; brief?: boolean;
  table: string; tableAfter?: string;
  after: (p: Progress) => boolean;          // the code fact that flips the copy to "after"
  editor?: { path: string; symbol?: string; marker?: string; afterMarker?: string; readOnly?: boolean; fix?: (s: string) => string; afterHint?: string; foot?: string; change?: [string, string, string] };
  run?: "compare" | "exam" | "flight" | "rewrite" | "switch" | "loop" | "cloud";
  check: string;
  swap?: string[][];
  sources?: [string, string][];              // [label, repo path] — opens the file on GitHub
};

/** Where the ↗ source links go. The page used to serve the file itself
 *  (/api/source); GitHub is the same bytes with line numbers and history. */
export const REPO = "https://github.com/cuppibla/table-for-n";
export const sourceUrl = (path: string) => `${REPO}/blob/main/${path}`;

const swapCriteria = (src: string) =>
  src.replace(/"response_match_score"\s*:\s*[0-9.]+/, "\"everyone_ate\": 0.9");
const uncommentEdge = (src: string) =>
  src.replace(/^(\s*)# (\(proposer, publish, host\),)/m, "$1$2");

export const COURSES: Course[] = [
  { n: 1, r: "I", key: "booking", t: "the booking", pill: ["read", "READ ONLY"],
    you: "Open 🔬 <b>workbench</b> (top right), pick <b>host</b>, paste the brief, send.", brief: true,
    table: "The host books a room and says why. Nothing in the system can say whether that is good — the booking is a reply, not a result. The table is laid; nobody is judged.",
    after: () => false,
    editor: { path: "host/instruction_current.txt", readOnly: true,
      foot: "four lines, day one. the model, the settings and the name never change in this lab — only this file does." },
    sources: [["host/agent.py", "host/agent.py"], ["instruction_current.txt", "host/instruction_current.txt"], ["world.py · the cast", "world.py"]],
    check: "one booking in the session log, made from the workbench" },

  { n: 2, r: "II", key: "comparator", t: "the comparator", pill: ["olive", "RUN"],
    you: "📝 <b>Run the exam</b> as shipped. One metric runs: <code>response_match_score</code>, the built-in comparator. Read which tables pass and fail — and notice that it cannot say <i>why</i>.",
    table: "The exam file has two parts. <b>criteria</b> is the exam paper — the metrics that actually run. <b>customMetrics</b> is the staff directory — names mapped to Python, available but not on duty. As shipped the paper has one question on it: a word-overlap score against a golden booking.",
    tableAfter: "The comparator passed and failed tables for how many words matched the golden answer — not for anyone’s dinner. It fails a correct booking worded differently, and passes a wrong one that happens to overlap. A dinner has a <i>set</i> of right answers (one to six of the ten rooms, depending on the party); a golden answer is one of them. The metric is not broken. It is the wrong kind of metric for this problem.",
    after: (p) => (p.exams || []).some((e) => e.judge === "text"),
    editor: { path: "exam/eval_config.json", readOnly: true,
      foot: "👉 <b>criteria</b> = what runs (one metric, response_match_score). <b>customMetrics</b> = a declaration only: your judge, everyone_ate, is in the directory but not on the exam. Course III moves it onto the exam by changing one line." },
    run: "compare",
    sources: [["exam/eval_config.json", "exam/eval_config.json"], ["parties_val.evalset.json · the golden answers", "exam/parties_val.evalset.json"], ["world.rooms · how many rooms feed each party", "world.py"], ["tests/test_host.py · the exam as a pytest", "tests/test_host.py"]],
    check: "the exam ran as shipped — graded by the comparator, no reasons" },

  { n: 3, r: "III", key: "judge", t: "the judge", pill: ["olive", "EDIT ONE"], judge: "everyone_ate",
    you: "Change <b>line 3</b> of <code>exam/eval_config.json</code> so the exam runs your judge instead, and 📝 run it again. Then 📋 <b>Book the table</b> and, before the kitchen judges it, <b>be the judge yourself</b>: mark each chair, then 🍽 walk the table.",
    table: "The exam fails on a text score with no reason attached. <code>world.everyone_ate</code> is the other kind of metric — a checker. It needs no golden answer; it needs the rules, and it walks every seat against them.",
    tableAfter: "<b>everyone_ate</b> is on the exam. Now a failure names the seat and the why: Tom over budget, Lena after last orders. Hungry seats become the number you hold — and you have walked the same six checks the function walks.",
    after: (p) => Boolean(p.code?.honest_on_exam),
    editor: { path: "exam/eval_config.json", marker: "\"response_match_score\"", afterMarker: "\"everyone_ate\": 0.9", fix: swapCriteria, afterHint: "It lands on your next 📝 exam.",
      change: ["line 3", "\"response_match_score\": 0.3", "\"everyone_ate\": 0.9"],
      foot: "👉 <b>criteria</b> names the metrics that run; <b>customMetrics</b> maps a name to a dotted Python import. ADK does not apply your threshold to a custom metric — your function returns PASSED or FAILED itself." },
    run: "exam",
    sources: [["metrics/table.py · the adapter", "metrics/table.py"], ["world.everyone_ate · the six checks", "world.py"], ["exam/eval_config.json", "exam/eval_config.json"], ["parties_val.evalset.json", "exam/parties_val.evalset.json"]],
    check: "the exam fails for the right reason — hungry seats, named — and you walked a table seat by seat" },

  { n: 4, r: "IV", key: "flight", t: "the flight", pill: ["gold", "THREE JUDGES"], judge: "everyone_ate",
    you: "⚖ <b>Judge the last exam three ways</b>. The same eight answers the host already gave — a comparator, your checker, and an LLM with a rubric, side by side. Then press it <b>again</b> and watch which columns move.",
    table: "Three metric families, one answer each. The comparator needs a golden answer. The checker needs the rules. The LLM judge needs a model and a rubric — and can be wrong.",
    tableAfter: "Same answer, three different things to measure it against, three costs, three blind spots. Two columns never move between runs; one can. When somebody asks how to evaluate an agent, this table is the answer to the question behind the question.",
    after: (p) => (p.flights || []).length > 0,
    run: "flight",
    sources: [["kitchen/flight.py · the three rows", "kitchen/flight.py"], ["world.everyone_ate", "world.py"], ["parties_val.evalset.json · the golden answers", "exam/parties_val.evalset.json"]],
    check: "the same eight answers, judged three ways" },

  { n: 5, r: "V", key: "rewrite", t: "the rewrite", pill: ["olive", "RUN"], judge: "everyone_ate",
    you: "⚗ <b>optimize</b> — 150 model calls, about eight minutes. Or ⤵ install the winner. Then 🚪 <b>ship gate</b>, and 📋 book the table again.",
    table: "Same brief, same booking, same hungry seats. The instruction is four lines and starts with “lead with the highest-rated room”.",
    tableAfter: "The instruction is a numbered procedure now. Book again and the table fills. The ship gate reads the eight parties the optimizer never saw.",
    after: (p) => ["winner", "optimized"].includes(p.code?.instruction || ""),
    run: "rewrite",
    sources: [["instruction_current.txt", "host/instruction_current.txt"], ["instructions/winner.txt · our run", "instructions/winner.txt"], ["exam/sampler_config.json", "exam/sampler_config.json"], ["exam/optimizer_config.json", "exam/optimizer_config.json"], ["gepa_run_log.txt", "instructions/gepa_run_log.txt"]],
    check: "the gate opened on parties the optimizer never saw — 5 of 8 or better" },

  { n: 6, r: "VI", key: "other", t: "the other judge", pill: ["gold", "THE SWITCH"],
    you: "⤵ Install the <b>hacked</b> instruction and read it below — it was written for the rating judge. Flip the switch above the table to <b>rating</b> and 📝 run the exam. Flip it back and run it again.",
    table: "Smoke &amp; Barrel, ★4.9. The honest judge greys the seats that cannot eat there. On the exam: one table in eight, at best.",
    tableAfter: "The page becomes a review app. ★4.9 · PASSED. The table is a thumbnail in the corner, and the same chairs are still grey. The rating judge never reads the party.",
    after: (p) => p.judge === "rating",
    editor: { path: "exam/eval_config.json", readOnly: true,
      foot: "👉 the switch decides which config the exam runs with: this file, or exam/eval_config_rating.json — <b>rating_score(party, pick)</b>, where <b>party</b> is never read. your linter will warn you. that warning is the entire lesson." },
    run: "switch",
    sources: [["metrics/table.py · rating_metric", "metrics/table.py"], ["world.rating_score", "world.py"], ["exam/eval_config_rating.json", "exam/eval_config_rating.json"], ["instructions/hacked.txt", "instructions/hacked.txt"], ["the run that produced it", "instructions/gepa_run_log_rating.txt"]],
    check: "the same eight dinners, judged twice: rating 8/8 · honest 2/8 or worse" },

  { n: 7, r: "VII", key: "loop", t: "the loop", pill: ["olive", "EDIT TWO"], judge: "everyone_ate",
    you: "↻ <b>Run the loop</b>. It ends after one round: <code>flywheel ended without closing</code>. Delete the “# ” on the green line. Run it again.",
    table: "Round 1: the day-one draft books, the judge greys seats, the proposer writes rules from the whys — then nothing. Every edge points forward. The graph has no way back.",
    tableAfter: "Round 2 runs under the rewritten instruction. When the judge passes, the bell rings · SHIP. The loop earned its exit — and the router, not the framework, decided where it ends.",
    after: (p) => Boolean(p.code?.edge),
    editor: { path: "loop/flywheel.py", symbol: "build", marker: "# (proposer, publish, host),", afterMarker: "(proposer, publish, host),", fix: uncommentEdge, afterHint: "It lands on your next ↻ run.",
      change: ["line 15", "# (proposer, publish, host),", "(proposer, publish, host),"],
      foot: "👉 ADK gives you the loop; it does not give you the boundary. the router keeps four belts: pass · 4 rounds · two flat rounds · length." },
    run: "loop",
    sources: [["loop/flywheel.py · the whole graph", "loop/flywheel.py"], ["loop/support.py", "loop/support.py"], ["instructions/draft.txt · the seed", "instructions/draft.txt"]],
    check: "a run reached round 2 under round 1’s rewrite and shipped" },

  { n: 8, r: "VIII", key: "check", t: "the check", pill: ["gold", "THE CHECK"], judge: "everyone_ate",
    you: "Nothing. Eight courses served.", table: "Everyone ate. The check is on the table.",
    after: () => false,
    swap: [["before", "after"], ["a demo that looks right", "an exam that counts who ate"], ["one golden answer", "a set of right answers, and a rule"],
      ["a prompt you edit by hand", "an instruction the loop rewrites"],
      ["a number that goes up", "a judge that explains itself"], ["one run", "a round, with a way back"], ["the metric you were handed", "the number you chose"]],
    sources: [["kitchen/progress.py · what lights a plate", "kitchen/progress.py"], ["scripts/walk.py · the headless learner", "scripts/walk.py"]],
    check: "eight courses · the check" },
];

export const LAST = COURSES.length;
export const byKey = (k: CourseKey): Course => COURSES.find((c) => c.key === k)!;
export const keyOf = (n: number): CourseKey => (COURSES[n - 1] || COURSES[0]).key;
/** n is at or past the course with this key — for the floor plan's "lit so far". */
export const reached = (n: number, k: CourseKey) => n >= byKey(k).n;

export const CLOSING = "The loop pushes up whatever number you hand it.";
export const GUESTS: Record<string, { name: string; img: string }> = {
  nadia: { name: "Nadia", img: "/art/nadia.jpg" }, tom: { name: "Tom", img: "/art/tom.jpg" }, amara: { name: "Amara", img: "/art/amara.jpg" },
  lena: { name: "Lena", img: "/art/lena.jpg" }, ben: { name: "Ben", img: "/art/ben.jpg" },
  marcus: { name: "Marcus", img: "/art/marcus.jpg" }, priya: { name: "Priya", img: "/art/priya.jpg" }, sam: { name: "Sam", img: "/art/sam.jpg" },
  yuki: { name: "Yuki", img: "/art/yuki.jpg" }, diego: { name: "Diego", img: "/art/diego.jpg" },
};
export const SHORT_TAG: Record<string, string> = {
  nadia: "vegan", tom: "budget $25", amara: "10-min walk", lena: "arrives 19:45", ben: "easy",
  marcus: "vegetarian", priya: "nut allergy", sam: "shellfish allergy", yuki: "leaves 19:15", diego: "no spicy",
};

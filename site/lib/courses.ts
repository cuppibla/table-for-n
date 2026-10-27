import type { Progress } from "./api";

/** The eight courses. Each is what you do · what the table does (before and
 *  after) · the one edit or the buttons · one ✓. The ✓ is never ticked by
 *  the page: it comes from /api/progress, which reads your files and what
 *  actually ran. The course text is the app's; the codelab carries depth.
 *
 *  Logic keys off `key`, never off the number, so courses can be added or
 *  reordered without hunting for magic numbers. */

export type CourseKey = "booking" | "comparator" | "judge" | "flight" | "rewrite" | "other" | "loop" | "check" | "receipt";

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
const turnOnAnalytics = (src: string) =>
  src.replace(/plugins=\[\],(\s*)(#.*)?$/m, "plugins=analytics(),$1$2");

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
    you: "Change <b>line 3</b> of <code>exam/eval_config.json</code> so the exam runs your judge instead of the comparator, and 📝 run it again. Then 📋 <b>Book the table</b> and watch the same judge grey the chairs.",
    table: "<code>world.everyone_ate</code> is the other kind of metric — a checker. It needs no golden answer; it needs the rules. It walks every seat: diet, allergy, spice, budget, walk, timing — six checks per person — and returns a score <i>and a sentence</i> for every seat that fails. No model call anywhere: same answer, same verdict, every time.",
    tableAfter: "<b>everyone_ate</b> is on the exam. A failure names the seat and the why: Tom over budget, Lena after last orders. Hungry seats become the number you hold — and the verdict is your function’s own: ADK does not apply the threshold for you.",
    after: (p) => Boolean(p.code?.honest_on_exam),
    editor: { path: "exam/eval_config.json", marker: "\"response_match_score\"", afterMarker: "\"everyone_ate\": 0.9", fix: swapCriteria, afterHint: "It lands on your next 📝 exam.",
      change: ["line 3", "\"response_match_score\": 0.3", "\"everyone_ate\": 0.9"],
      foot: "👉 <b>criteria</b> names the metrics that run; <b>customMetrics</b> maps a name to a dotted Python import. ADK does not apply your threshold to a custom metric — your function returns PASSED or FAILED itself." },
    run: "exam",
    sources: [["metrics/table.py · the adapter", "metrics/table.py"], ["world.everyone_ate · the six checks", "world.py"], ["exam/eval_config.json", "exam/eval_config.json"], ["parties_val.evalset.json", "exam/parties_val.evalset.json"]],
    check: "the exam fails for the right reason — hungry seats, named" },

  { n: 4, r: "IV", key: "flight", t: "the flight", pill: ["gold", "THREE JUDGES"], judge: "everyone_ate",
    you: "One answer the host already gave — party <b>p1</b>, the booking the exam recorded — put in front of three judges. Press ⚖ <b>judge this answer three ways</b>, read the three cards, then press it <b>again</b>.",
    table: "Same answer. Three different things to measure it against: a golden answer (the comparator), the rules (the checker), a rubric and a model (the LLM judge). That single difference is what separates the three metric families.",
    tableAfter: "Three verdicts, three reasons, three costs, three blind spots. Two of the judges never change their mind between presses; one can. When somebody asks how to evaluate an agent, the question behind the question is: what can you write down — the answer, the rules, or only a description of good?",
    after: (p) => (p.flights || []).length > 0,
    run: "flight",
    sources: [["kitchen/flight.py · the three judges", "kitchen/flight.py"], ["world.everyone_ate · the checker", "world.py"], ["parties_val.evalset.json · the golden answers", "exam/parties_val.evalset.json"]],
    check: "one answer, judged three ways" },

  { n: 5, r: "V", key: "rewrite", t: "the rewrite", pill: ["olive", "RUN"], judge: "everyone_ate",
    you: "⚗ <b>optimize</b> — 150 model calls, about eight minutes. Or ⤵ install the winner. Then 🚪 <b>ship gate</b>, and 📋 book the table again.",
    table: "Same brief, same booking, same hungry seats. The instruction is four lines and starts with “lead with the highest-rated room”.",
    tableAfter: "The instruction is a numbered procedure now. Book again and the table fills. The ship gate reads the eight parties the optimizer never saw.",
    after: (p) => ["winner", "optimized"].includes(p.code?.instruction || ""),
    run: "rewrite",
    sources: [["instruction_current.txt", "host/instruction_current.txt"], ["instructions/winner.txt · our run", "instructions/winner.txt"], ["exam/sampler_config.json", "exam/sampler_config.json"], ["exam/optimizer_config.json", "exam/optimizer_config.json"], ["gepa_run_log.txt", "instructions/gepa_run_log.txt"]],
    check: "the gate opened on parties the optimizer never saw — 5 of 8 or better" },

  { n: 6, r: "VI", key: "other", t: "the other judge", pill: ["gold", "ONE BUTTON"],
    you: "Press ⭐ <b>book with the hacked instruction</b>. One press: it installs an instruction a real optimizer wrote for a different judge, and books tonight’s table under it. Then read the one sentence highlighted below.",
    table: "Same host, same brief, one different file. <code>rating_score(party, pick)</code> returns <code>pick.rating / 5</code> — <b>party</b> is never read. We pointed <code>adk optimize</code> at that judge once. This is what it learned.",
    tableAfter: "The page became a review app: ★4.9 · PASSED. Behind the thumbnail the chairs went grey — the honest judge still counts who eats. On our full exam: rating <b>8/8</b>, everyone_ate <b>1/8</b>, the same eight answers. The loop pushes up whatever number you hand it.",
    after: (p) => p.code?.instruction === "hacked",
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

  { n: 9, r: "IX", key: "receipt", t: "the receipt", pill: ["gold", "BEYOND THE MENU"], judge: "everyone_ate",
    you: "Name a dataset below (it needs your project). Swap the marked line in <code>host/agent.py</code>. Then 📋 <b>book the table</b> — the same button as course I — and press 🧾 <b>show the row</b>. Last, ⛏ <b>harvest</b>.",
    table: "Every dinner so far was graded because you asked: an exam you wrote, a party you picked. Production is dinners nobody planned to grade. Today the host answers and the answer is gone.",
    tableAfter: "The host writes one row per event <i>while</i> it books — here, in <code>adk eval</code>, and on Agent Engine, the same object — and BigQuery folds them into one turn per booking with the instruction inside it. The checker grades that row after the fact; the failures become next round’s exam. The plugin records; it never judges.",
    after: (p) => Boolean(p.code?.analytics),
    editor: { path: "host/agent.py", symbol: "app", marker: "plugins=[],", afterMarker: "plugins=analytics(),", fix: turnOnAnalytics,
      afterHint: "It lands on your next 📋 booking — the plugin makes the table and the views on the first row it writes.",
      change: ["one line", "plugins=[],", "plugins=analytics(),"],
      foot: "👉 one plugin on the <b>App</b>, nothing on the agent: same model, same instruction, same tools. <code>analytics()</code> is off unless .env names a dataset, so courses I–VIII never touched BigQuery. <code>create_eval_views=True</code> is what makes BigQuery build <b>v_eval_turn</b> — one row per booking, the trace in the shape the evaluators eat." },
    run: "cloud",
    sources: [["host/agent.py · analytics()", "host/agent.py"], ["kitchen/receipt.py · the row, read back", "kitchen/receipt.py"], ["refuel/harvest.py · the checker, after the fact", "refuel/harvest.py"], ["refuel/send_traffic.py · real parties to a deployed host", "refuel/send_traffic.py"]],
    check: "a row came back for a dinner you booked, and a harvest graded the view" },
];

/** The last plate on the menu proper — the check. IX is beyond the menu. */
export const CHECK = COURSES.find((c) => c.key === "check")!.n;

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

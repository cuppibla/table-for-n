import type { Progress } from "./api";

/** The courses, in two seatings. Each is what you do · what the table does
 *  (before and after) · the one edit or the buttons · one ✓. The ✓ is never
 *  ticked by the page: it comes from /api/progress, which reads your files
 *  and what actually ran. The course text is the app's; the codelab carries
 *  depth.
 *
 *  The first seating (I–VIII) is the host: one reply, graded. The second
 *  (IX–XII) is the maître d': it uses tools and takes questions, so the path
 *  and the conversation get graded too.
 *
 *  Logic keys off `key`, never off the number, so courses can be added or
 *  reordered without hunting for magic numbers. */

export type CourseKey = "booking" | "comparator" | "judge" | "flight" | "rewrite" | "other" | "loop" | "check"
  | "maitre" | "path" | "talk" | "check2";

export type Course = {
  n: number; r: string; key: CourseKey; t: string; pill: [string, string];
  seating?: 1 | 2;                           // 1 when absent — the host's eight courses
  judge?: "everyone_ate" | "rating";
  you: string; brief?: boolean;
  table: string; tableAfter?: string;
  after: (p: Progress) => boolean;          // the code fact that flips the copy to "after"
  editor?: { path: string; symbol?: string; marker?: string; afterMarker?: string; readOnly?: boolean; fix?: (s: string) => string; afterHint?: string; foot?: string; change?: [string, string, string] };
  run?: "compare" | "exam" | "flight" | "rewrite" | "switch" | "loop" | "cloud" | "maitre" | "paths" | "talk";
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
// course X: the comparator's criterion object → the path checker, declared in customMetrics
const swapPath = (src: string) =>
  src.replace(/"tool_trajectory_avg_score"\s*:\s*\{[^}]*\}/, "\"path\": 1.0");
// course XI: every scenario's simulated organizer, EXPERT → NOVICE
const toNovice = (src: string) =>
  src.replace(/"user_persona"\s*:\s*"EXPERT"/g, "\"user_persona\": \"NOVICE\"");

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

  // ── the second seating: the maître d' ──────────────────────────────────────
  { n: 9, r: "IX", key: "maitre", t: "the maître d’", pill: ["read", "READ ONLY"], seating: 2, judge: "everyone_ate",
    you: "📋 <b>Book the table</b> on the left — the maître d’ is booking now — or open 🔬 <b>workbench</b>, pick <b>maitre_d</b>, paste the group chat, send. Watch the calls.", brief: true,
    table: "The second seating’s agent gets the group chat and nothing else — no listings. Every fact about a room is a tool call (<code>list_rooms</code>, <code>get_room</code>), and every <code>book</code> is a real reservation. The booking is not a reply any more; it is a side effect. Every judge in the first seating read the answer. None of them saw how it was reached.",
    tableAfter: "The calls are on the table, in order. everyone_ate grades the table it <i>reserved</i>, not the one its reply names — a reply is a claim, a reservation is a result. Four rules read the calls themselves: did it look before it booked, book once, book the whole party, and say what it reserved?",
    after: (p) => Boolean(p.maitre_calls) || Boolean(p.last_maitre_booking),
    editor: { path: "maitre_d/instruction_current.txt", readOnly: true,
      foot: "the same model and settings as the host, and the same opening — “lead with the highest-rated room”. three tools instead of a listings app: the rooms are facts it has to go and get." },
    run: "maitre",
    sources: [["maitre_d/agent.py", "maitre_d/agent.py"], ["maitre_d/tools.py · three tools", "maitre_d/tools.py"], ["instruction_current.txt", "maitre_d/instruction_current.txt"], ["world.chat_brief · the chat, no listings", "world.py"]],
    check: "one booking by the maître d’ — in the workbench, or with 📋" },

  { n: 10, r: "X", key: "path", t: "the path", pill: ["olive", "EDIT ONE"], seating: 2, judge: "everyone_ate",
    you: "Read the ⚖ card: eight ways to one dinner, every judge on each. Then 📝 run the path exam as shipped, change <b>line 4</b> of <code>exam/eval_config_path.json</code> so it runs the path checker instead of the comparator, and 📝 run it again.",
    table: "ADK’s trajectory metric, <code>tool_trajectory_avg_score</code>, compares the calls to a golden path. p3 has ten right (room, time) answers and any number of right orders to look in; a golden path holds one. EXACT fails the agent that rang three rooms first. IN_ORDER and ANY_ORDER fail the other right room. <code>ignore_args</code> passes the agent that booked the wrong one. It is a comparator again — course II’s lesson, on the path.",
    tableAfter: "The path checker is on the exam: four rules over the calls, each with a why, and no golden path at all — so it grades a one-turn case, a conversation and a production trace the same way. It never checks whether the room was right; that stays everyone_ate’s job. A path can hold up and still feed nobody: that is a reasoning failure, and its fix is not the same.",
    after: (p) => Boolean(p.code?.path_on_exam),
    editor: { path: "exam/eval_config_path.json", marker: "\"tool_trajectory_avg_score\"", afterMarker: "\"path\": 1.0", fix: swapPath, afterHint: "It lands on your next 📝 path exam.",
      change: ["line 4", "\"tool_trajectory_avg_score\": { \"threshold\": 1.0, \"match_type\": \"EXACT\" }", "\"path\": 1.0"],
      foot: "👉 the comparator is a built-in with a criterion object — a threshold and a <b>match_type</b> (EXACT · IN_ORDER · ANY_ORDER). the path checker is declared below in <b>customMetrics</b>, the way everyone_ate was in course III. same move, one level down." },
    run: "paths",
    sources: [["metrics/path.py · four rules", "metrics/path.py"], ["kitchen/paths.py · the eight paths", "kitchen/paths.py"], ["exam/eval_config_path.json", "exam/eval_config_path.json"], ["paths_val.evalset.json · the golden paths", "exam/paths_val.evalset.json"]],
    check: "the path checker is on the exam, and a path exam ran with it" },

  { n: 11, r: "XI", key: "talk", t: "the conversation", pill: ["gold", "EDIT ONE"], seating: 2, judge: "everyone_ate",
    you: "📝 <b>Run the conversation exam</b> as shipped — four simulated organizers, about four minutes. Change the persona in <code>exam/conversations_val.evalset.json</code> from <b>EXPERT</b> to <b>NOVICE</b> (four lines) and run it again. Then ⤵ install the line that asks, and run it a third time.",
    table: "Nobody can write down a golden conversation, so ADK writes the other side: each case is a scenario — the opening line, a plan (the group chat, and how to pass it on) and a <b>persona</b>. As shipped the persona is EXPERT: it volunteers details and corrects the agent. Five judges read each conversation — everyone_ate, the path, asked_before_booking, a rubric judge, and one more that grades the simulated organizer itself.",
    tableAfter: "The NOVICE gives the goal, answers what it is asked, and takes the first table it is offered. Whatever the EXPERT was catching and correcting now lands on the table. The fix under test is one line — ask before you book — and the stand-in’s own judge says when a verdict was about the simulator, not the agent.",
    after: (p) => p.code?.persona === "NOVICE",
    editor: { path: "exam/conversations_val.evalset.json", marker: "\"user_persona\": \"EXPERT\"", afterMarker: "\"user_persona\": \"NOVICE\"", fix: toNovice, afterHint: "It lands on your next 📝 conversation exam.",
      change: ["four lines", "\"user_persona\": \"EXPERT\"", "\"user_persona\": \"NOVICE\""],
      foot: "👉 a persona is a set of behaviors the simulator follows. EXPERT and NOVICE ship with ADK; a scenario can also carry a whole persona object of its own. the plan is the same in every run — only who is holding the phone changes." },
    run: "talk",
    sources: [["conversations_val.evalset.json · four scenarios", "exam/conversations_val.evalset.json"], ["exam/eval_config_conversation.json · five judges", "exam/eval_config_conversation.json"], ["metrics/conversation.py · asked_before_booking", "metrics/conversation.py"], ["instructions/maitre_d_asks.txt · the line that asks", "instructions/maitre_d_asks.txt"]],
    check: "the conversation exam ran three ways: EXPERT · draft, NOVICE · draft, NOVICE · asks" },

  { n: 12, r: "XII", key: "check2", t: "the second check", pill: ["gold", "THE CHECK"], seating: 2, judge: "everyone_ate",
    you: "Nothing. Four more courses served.", table: "The reservation book is clean. The check is on the table.",
    after: () => false,
    swap: [["before", "after"], ["a booking that is a reply", "a booking that is a side effect"], ["one golden path", "four rules over the calls, each with a why"],
      ["a brief with everything in it", "an organizer who says only what is asked"], ["the user you script", "a stand-in with a persona — and a judge of its own"],
      ["grade the answer", "grade the path where it has side effects; grade the outcome where it is a search"]],
    sources: [["kitchen/progress.py · what lights a plate", "kitchen/progress.py"], ["scripts/walk.py · the headless learner", "scripts/walk.py"]],
    check: "four more courses · the second check" },
];

export const LAST = COURSES.length;
export const byKey = (k: CourseKey): Course => COURSES.find((c) => c.key === k)!;
export const keyOf = (n: number): CourseKey => (COURSES[n - 1] || COURSES[0]).key;
/** n is at or past the course with this key — for the floor plan's "lit so far". */
export const reached = (n: number, k: CourseKey) => n >= byKey(k).n;

/** Which seating course n belongs to, and that seating's courses. A seating
 *  ends with its check, which is not counted among the courses served. */
export type SeatingNo = 1 | 2;
export const seatingOf = (n: number): SeatingNo => (COURSES[n - 1]?.seating || 1);
export const coursesOf = (s: SeatingNo) => COURSES.filter((c) => (c.seating || 1) === s);
export const isCheck = (k: CourseKey) => k === "check" || k === "check2";
export const SEATINGS: Record<SeatingNo, { label: string; count: string; agent: "host" | "maitre_d" }> = {
  1: { label: "first seating", count: "EIGHT COURSES", agent: "host" },
  2: { label: "second seating", count: "FOUR COURSES", agent: "maitre_d" },
};

export const CLOSING = "The loop pushes up whatever number you hand it.";
export const CLOSING2 = "A golden path is one right answer. A rule is all of them.";
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

import type { Progress } from "./api";

/** The seven courses. Each is what you do · what the table does (before and
 *  after) · the one edit or the buttons · one ✓. The ✓ is never ticked by
 *  the page: it comes from /api/progress, which reads your files and what
 *  actually ran. The course text is the app's; the codelab carries depth. */

export type Course = {
  n: number; r: string; t: string; pill: [string, string];
  judge?: "everyone_ate" | "rating";
  you: string; brief?: boolean;
  table: string; tableAfter?: string;
  after: (p: Progress) => boolean;          // the code fact that flips the copy to "after"
  editor?: { path: string; symbol?: string; marker?: string; afterMarker?: string; readOnly?: boolean; fix?: (s: string) => string; afterHint?: string; foot?: string; change?: [string, string, string] };
  run?: "exam" | "rewrite" | "switch" | "loop" | "cloud";
  check: string;
  swap?: string[][];
  sources?: [string, string][];              // [label, repo path] — opens the file as text in a new tab
};

const swapCriteria = (src: string) =>
  src.replace(/"response_match_score"\s*:\s*[0-9.]+/, "\"everyone_ate\": 0.9");
const uncommentEdge = (src: string) =>
  src.replace(/^(\s*)# (\(proposer, publish, host\),)/m, "$1$2");

export const COURSES: Course[] = [
  { n: 1, r: "I", t: "the booking", pill: ["read", "READ ONLY"],
    you: "Open 🔬 <b>workbench</b> (top right), pick <b>host</b>, paste the brief, send.", brief: true,
    table: "The host books a room and says why. Nothing in the system can say whether that is good — the booking is a reply, not a result. The table is laid; nobody is judged.",
    after: () => false,
    editor: { path: "host/instruction_current.txt", readOnly: true,
      foot: "four lines, day one. the model, the settings and the name never change in this lab — only this file does." },
    sources: [["host/agent.py", "host/agent.py"], ["instruction_current.txt", "host/instruction_current.txt"], ["world.py · the cast", "world.py"]],
    check: "one booking in the session log, made from the workbench" },

  { n: 2, r: "II", t: "the judge", pill: ["olive", "EDIT ONE"], judge: "everyone_ate",
    you: "📝 <b>Run the exam</b> first, as shipped — eight parties graded by the built-in text metric. Read what it says. Then change <b>line 3</b> of <code>exam/eval_config.json</code> so the exam runs your judge instead, and run it again.",
    table: "The exam fails most tables — on a text score against a golden answer, with no reason attached. 0.26 is not a hungry person. It even fails tables where everyone ate.",
    tableAfter: "<b>everyone_ate</b> is on the exam. Now a failure names the seat and the why: Tom over budget, Lena after last orders. Hungry seats become the number you hold.",
    after: (p) => Boolean(p.code?.honest_on_exam),
    editor: { path: "exam/eval_config.json", marker: "\"response_match_score\"", afterMarker: "\"everyone_ate\": 0.9", fix: swapCriteria, afterHint: "It lands on your next 📝 exam.",
      change: ["line 3", "\"response_match_score\": 0.3", "\"everyone_ate\": 0.9"],
      foot: "👉 the exam only runs the metrics named in <b>criteria</b>. your judge is already in the file — it just isn't on the exam yet." },
    run: "exam",
    sources: [["metrics/table.py · the adapter", "metrics/table.py"], ["world.everyone_ate", "world.py"], ["exam/eval_config.json", "exam/eval_config.json"], ["parties_val.evalset.json", "exam/parties_val.evalset.json"]],
    check: "the exam fails for the right reason — hungry seats, named" },

  { n: 3, r: "III", t: "the rewrite", pill: ["olive", "RUN"], judge: "everyone_ate",
    you: "⚗ <b>optimize</b> — 150 model calls, about eight minutes. Or ⤵ install the winner. Then 🚪 <b>ship gate</b>, and 📋 book the table again.",
    table: "Same brief, same booking, same hungry seats. The instruction is four lines and starts with “lead with the highest-rated room”.",
    tableAfter: "The instruction is a numbered procedure now. Book again and the table fills. The ship gate reads the eight parties the optimizer never saw.",
    after: (p) => ["winner", "optimized"].includes(p.code?.instruction || ""),
    run: "rewrite",
    sources: [["instruction_current.txt", "host/instruction_current.txt"], ["instructions/winner.txt · our run", "instructions/winner.txt"], ["exam/sampler_config.json", "exam/sampler_config.json"], ["exam/optimizer_config.json", "exam/optimizer_config.json"], ["gepa_run_log.txt", "instructions/gepa_run_log.txt"]],
    check: "the gate opened on parties the optimizer never saw — 5 of 8 or better" },

  { n: 4, r: "IV", t: "the other judge", pill: ["gold", "THE SWITCH"],
    you: "⤵ Install the <b>hacked</b> instruction and read it below — it was written for the rating judge. Flip the switch above the table to <b>rating</b> and 📝 run the exam. Flip it back and run it again.",
    table: "Smoke &amp; Barrel, ★4.9. The honest judge greys the seats that cannot eat there. On the exam: one table in eight, at best.",
    tableAfter: "The page becomes a review app. ★4.9 · PASSED. The table is a thumbnail in the corner, and the same chairs are still grey. The rating judge never reads the party.",
    after: (p) => p.judge === "rating",
    editor: { path: "exam/eval_config.json", readOnly: true,
      foot: "👉 the switch decides which config the exam runs with: this file, or exam/eval_config_rating.json — <b>rating_score(party, pick)</b>, where <b>party</b> is never read. your linter will warn you. that warning is the entire lesson." },
    run: "switch",
    sources: [["metrics/table.py · rating_metric", "metrics/table.py"], ["world.rating_score", "world.py"], ["exam/eval_config_rating.json", "exam/eval_config_rating.json"], ["instructions/hacked.txt", "instructions/hacked.txt"], ["the run that produced it", "instructions/gepa_run_log_rating.txt"]],
    check: "the same eight dinners, judged twice: rating 8/8 · honest 2/8 or worse" },

  { n: 5, r: "V", t: "the loop", pill: ["olive", "EDIT TWO"], judge: "everyone_ate",
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

  { n: 6, r: "VI", t: "the check", pill: ["gold", "THE CHECK"], judge: "everyone_ate",
    you: "Nothing. Six courses served.", table: "Everyone ate. The check is on the table.",
    after: () => false,
    swap: [["before", "after"], ["a demo that looks right", "an exam that counts who ate"], ["a prompt you edit by hand", "an instruction the loop rewrites"],
      ["a number that goes up", "a judge that explains itself"], ["one run", "a round, with a way back"],       ["the metric you were handed", "the number you chose"]],
    sources: [["kitchen/progress.py · what lights a plate", "kitchen/progress.py"], ["scripts/walk.py · the headless learner", "scripts/walk.py"]],
    check: "six courses · the check" },
];

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

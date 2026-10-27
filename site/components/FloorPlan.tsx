"use client";
import type { Progress } from "@/lib/api";
import type { Folded } from "@/lib/useEvents";
import { keyOf, reached, seatingOf } from "@/lib/courses";

/** The floor plan: the architecture, alive. Three rows — the exam and the
 *  exam above, brief → host → judge → gate → shipped, proposer and publish
 *  below. Nodes light as courses enable them; plates move while something
 *  runs. The back edge is dashed when you walk it by hand (course V) and
 *  solid once the graph walks it (course VII).
 *
 *  The second seating has its own plan (FloorPlan2, below): the chat and the
 *  maître d' on top, the tools and the reservation book underneath — the
 *  judges read all three: the calls, the reservation, the conversation. */

const N = {
  exam:     { x: 346, y: 12, w: 164, h: 44, l: "🗂 the exam", s: "evalset · 8 parties" },
  brief:    { x: 14,  y: 90, w: 104, h: 52, l: "📋 the brief", s: "the party" },
  host:     { x: 150, y: 90, w: 164, h: 52, l: "🦊 host", s: "LlmAgent · the instruction" },
  judge:    { x: 346, y: 90, w: 164, h: 52, l: "🐧 judge", s: "everyone_ate" },
  gate:     { x: 542, y: 90, w: 104, h: 52, l: "🔔 the gate", s: "score ≥ 0.9" },
  ship:     { x: 678, y: 90, w: 88,  h: 52, l: "✓ shipped", s: "deploy" },
  publish:  { x: 150, y: 180, w: 164, h: 48, l: "📝 publish", s: "instruction_current.txt" },
  proposer: { x: 346, y: 180, w: 164, h: 48, l: "👨‍🍳 proposer", s: "GEPA · reads the runs" },
} as const;
const E = {
  "brief-host": "M118 116 L150 116", "host-judge": "M314 116 L346 116", "judge-gate": "M510 116 L542 116", "gate-ship": "M646 116 L678 116",
  "exam-judge": "M428 56 L428 90",
  "gate-proposer": "M594 142 L594 204 L510 204", "proposer-publish": "M346 204 L314 204", "publish-host": "M232 180 L232 142",
} as const;
const P = {
  book:    { d: "M60 116 L150 116 L232 116", cls: "pk", dur: "1.6s" },
  exam:    { d: "M60 116 L232 116 L428 116 L594 116", cls: "pk", dur: "2.6s" },
  install: { d: "M428 204 L314 204 L232 204 L232 142", cls: "pk loop", dur: "2.2s" },
  loop:    { d: "M594 142 L594 204 L314 204 L232 204 L232 142 L232 116 L428 116 L594 116", cls: "pk loop", dur: "4s" },
} as const;

export default function FloorPlan({ n, p, f }: { n: number; p: Progress | null; f: Folded }) {
  if (seatingOf(n) === 2) return <FloorPlan2 n={n} p={p} f={f} />;
  const code = p?.code;
  const judge = p?.judge || "everyone_ate";
  const edge = Boolean(code?.edge);
  const loop = p?.loops?.[p.loops.length - 1];
  const gateOpen = (p?.exams || []).some((e) => e.judge === "everyone_ate" && ["winner", "optimized"].includes(e.instruction) && (e.passed || 0) >= 5);

  const key = keyOf(n);
  const lit = new Set<string>(["host"]);
  if (f.people.length || n >= 1) lit.add("brief");
  if (reached(n, "comparator")) { lit.add("judge"); lit.add("exam"); }
  if (reached(n, "rewrite")) { lit.add("gate"); lit.add("proposer"); lit.add("publish"); }
  if (reached(n, "other") || gateOpen) lit.add("ship");
  const edges = new Set<string>(["brief-host"]);
  if (reached(n, "comparator")) { edges.add("host-judge"); edges.add("exam-judge"); }
  if (reached(n, "rewrite")) { edges.add("judge-gate"); edges.add("gate-proposer"); edges.add("proposer-publish"); edges.add("publish-host"); }
  if (reached(n, "other") || gateOpen) edges.add("gate-ship");
  if (key === "loop" && !edge) edges.delete("publish-host");
  const packets: (keyof typeof P)[] = [];
  if (f.running) {
    if (f.kind === "booking") packets.push("book");
    if (f.kind === "exam") packets.push("exam");
    if (f.kind === "loop") packets.push(edge ? "loop" : "exam");
    if (f.kind === "optimize") packets.push("install");
  }
  const critic = judge === "rating";
  const bell = reached(n, "loop") && loop?.decision === "SHIP";
  const judgeSub = critic ? "rating · pick.rating / 5" : (code?.criteria?.length ? code.criteria.join(", ") : "everyone_ate");

  const legend =
    key === "booking" ? "the workbench talks to the same host. a booking is a reply; nothing grades it." :
    key === "comparator" ? "the built-in judge compares your reply to a golden string. it never looks at the table — and a dinner has a set of right answers, not one." :
    key === "judge" ? (code?.honest_on_exam ? "everyone_ate walks the table seat by seat. pure python, deterministic, wired into adk eval." : "a checker needs no golden answer — it needs the rules. put it on the exam and walk a table yourself.") :
    key === "flight" ? "same answer, three judges: a comparator (a golden answer), a checker (the rules), an llm with a rubric (a model). three costs, three blind spots." :
    key === "rewrite" ? (["winner", "optimized"].includes(code?.instruction || "") ? "the gate reads the eight parties the optimizer never saw. one artifact changed — the instruction." : "one pass: the proposer reads the failures, writes a candidate, you install it. the dashed edge is you — a file copy, by hand.") :
    key === "other" ? (critic ? "✕ the rating judge never looks at the table. the gate opens on a number that cannot see harm." : "hacked instruction, honest judge: the honest judge reads every seat and says why.") :
    key === "loop" ? (edge ? "the back edge: publish → host. round n+1 runs under round n’s rewrite. the bell is the gate." : "✕ the proposer writes a rewrite — and nothing carries it back to the host. the graph ends. the loop is one missing edge.") :
    "one host · one judge · one gate · one back edge.";

  return (
    <div className="card floor">
      <svg viewBox="0 0 780 236" role="img" aria-label="the floor plan: brief, host, judge, gate; the exam above; proposer and publish below">
        <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#6F7F3F" /></marker></defs>
        {Object.entries(E).map(([k, d]) => {
          const isLit = edges.has(k);
          const cls = "edge" + (isLit ? " lit" : "") + (k === "publish-host" ? " back" + (edge || reached(n, "check") ? " solid" : "") : "") + (k === "exam-judge" ? " pipe" : "");
          return <path key={k} d={d} className={cls} markerEnd="url(#a)" />;
        })}
        {Object.entries(N).map(([k, nd]) => {
          const isLit = lit.has(k);
          const label = k === "judge" && critic ? "🦚 judge" : nd.l;
          // course V's proposer is GEPA: it reads the failed runs (brief, reply,
          // pass/fail), never the judge's reasons. Course VII's is an agent
          // node, and the whys are its prompt.
          const sub = k === "judge" ? judgeSub : k === "host" ? `LlmAgent · ${code?.instruction || "the instruction"}`
            : k === "proposer" && key === "loop" ? "agent · reads the whys" : nd.s;
          return (
            <g key={k}>
              <rect x={nd.x} y={nd.y} width={nd.w} height={nd.h} rx="9" className={"node" + (isLit ? " lit" : "") + (critic && k === "judge" ? " hot" : "") + (bell && k === "gate" ? " bell" : "")} />
              <text x={nd.x + nd.w / 2} y={nd.y + (nd.h > 46 ? 22 : 19)} textAnchor="middle" className={"nl" + (isLit ? " lit" : "")}>{label}</text>
              <text x={nd.x + nd.w / 2} y={nd.y + (nd.h > 46 ? 40 : 35)} textAnchor="middle" className="ns">{sub}</text>
            </g>
          );
        })}
        {critic && <><path d="M428 90 L428 56" className="edge cut" markerEnd="url(#a)" style={{ strokeDasharray: "none" }} /><text x="440" y="78" className="nl" style={{ fill: "#D9603F", fontWeight: 600 }}>✕ never looks at the table</text></>}
        {key === "loop" && !edge && <text x="150" y="172" className="nl" style={{ fill: "#D9603F", fontWeight: 600 }}>✕ proposed — nothing carries it back</text>}
        {bell && <text x="594" y="84" textAnchor="middle" className="nl" style={{ fill: "#A8771C", fontWeight: 600 }}>🔔 SHIP</text>}
        {packets.map((k) => Array.from({ length: 3 }, (_, i) => (
          <circle key={`${k}${i}`} r="4.5" className={P[k].cls}>
            <animateMotion dur={P[k].dur} repeatCount="indefinite" begin={`${(i * 0.9).toFixed(1)}s`} path={P[k].d} />
          </circle>
        )))}
      </svg>
      <div className="lg">{legend}</div>
    </div>
  );
}

// ── the second seating ───────────────────────────────────────────────────────
const N2 = {
  exam:    { x: 362, y: 12,  w: 184, h: 44, l: "🗂 the exam", s: "" },
  chat:    { x: 14,  y: 90,  w: 120, h: 52, l: "📋 the chat", s: "no listings" },
  maitre:  { x: 166, y: 90,  w: 164, h: 52, l: "🦊 maître d’", s: "" },
  judges:  { x: 362, y: 90,  w: 184, h: 52, l: "🐧 the judges", s: "" },
  receipt: { x: 578, y: 90,  w: 188, h: 52, l: "🧾 the receipt", s: "" },
  tools:   { x: 166, y: 180, w: 164, h: 48, l: "☎ three tools", s: "list_rooms · get_room · book" },
  book:    { x: 362, y: 180, w: 184, h: 48, l: "📖 reservation book", s: "every book call is one" },
} as const;
const E2 = {
  "chat-maitre": "M134 116 L166 116", "maitre-judges": "M330 116 L362 116", "judges-receipt": "M546 116 L578 116",
  "maitre-tools": "M248 142 L248 180", "tools-book": "M330 204 L362 204", "book-judges": "M454 180 L454 142",
  "exam-judges": "M454 56 L454 90",
} as const;
const P2 = {
  book: { d: "M74 116 L248 116 L248 204 L454 204 L454 116", dur: "2.4s" },
  path: { d: "M74 116 L248 116 L248 204 L454 204 L454 116 L672 116", dur: "2.8s" },
  talk: { d: "M74 116 L248 116 L74 116 L248 116 L248 204 L454 204 L454 116 L672 116", dur: "4.6s" },
} as const;
const short = (c: string) => (c === "tool_trajectory_avg_score" ? "comparator" : c === "asked_before_booking" ? "asked" : c.startsWith("rubric_") ? "rubric" : c.startsWith("per_turn_user_simulator") ? "🎭 stand-in" : c);

function FloorPlan2({ n, p, f }: { n: number; p: Progress | null; f: Folded }) {
  const code = p?.code;
  const key = keyOf(n);
  const talk = key === "talk" || key === "check2";
  const exam = key !== "maitre";
  const persona = code?.persona || "EXPERT";
  const mk = code?.maitre_instruction || "the instruction";
  const comparatorOn = (code?.path_criteria || []).includes("tool_trajectory_avg_score");
  const paths = p?.paths || [], talks = p?.talks || [];
  const mb = p?.last_maitre_booking;

  const lit = new Set<string>(["chat", "maitre", "tools", "book", "judges"]);
  if (exam) { lit.add("exam"); lit.add("receipt"); }
  const edges = new Set<string>(["chat-maitre", "maitre-tools", "tools-book", "book-judges", "maitre-judges"]);
  if (exam) { edges.add("exam-judges"); edges.add("judges-receipt"); }

  const judgesSub = key === "path" ? (code?.path_criteria || []).map(short).join(" · ")
    : talk ? "fed · path · asked · rubric · 🎭" : "everyone_ate · path";
  const last = key === "path" ? paths.slice(-1)[0] : talk ? talks.slice(-1)[0] : undefined;
  const receiptSub = last
    ? (last.suite === "talks" ? `${last.persona} · ${last.instruction} · ${last.passed}/${last.n}` : Object.entries(last.by_metric || {}).map(([k, v]) => `${short(k).replace("everyone_ate", "fed")} ${v.passed}/${last.n}`).join(" · "))
    : key === "maitre" && mb ? `${mb.hungry} hungry · path ${mb.path.passed ? "held" : "broke"}` : "a why for every fail";
  const sub: Record<string, string> = {
    exam: talk ? "conversations_val · 4 scenarios" : "paths_val · 8 parties · golden paths",
    chat: talk ? `simulated · ${persona}` : "the group chat · no listings",
    maitre: `LlmAgent · ${mk}`, judges: judgesSub, receipt: receiptSub,
  };
  const label = (k: string, l: string) => (k === "chat" && talk ? "🎭 the organizer" : l);

  const packets: (keyof typeof P2)[] = [];
  if (f.running) {
    if (f.kind === "booking" && f.agent === "maitre_d") packets.push("book");
    if (f.kind === "path_exam") packets.push("path");
    if (f.kind === "talk_exam") packets.push("talk");
  }
  const legend =
    key === "maitre" ? "the group chat goes in; the listings do not. every fact about a room is a call, every book is a reservation — between the chat and the reply there is now a path." :
    key === "path" ? (comparatorOn ? "✕ the comparator holds one golden path. p3 has ten right answers and any number of right orders to look in — it passes one." : "the path checker reads the calls: four rules, a why each, no golden path. everyone_ate reads the reservation. two judges, two questions.") :
    key === "talk" ? (persona === "NOVICE" ? `the novice answers what it is asked and takes the first table offered — what the agent never asked about lands on the table.${mk === "asks" ? " one line now asks first." : ""}` : "the organizer is simulated — an EXPERT volunteers details and corrects the agent. it rescues dinners, and hides the problem.") :
    "one maître d’ · three tools · four rules · a stand-in with a judge of its own.";

  return (
    <div className="card floor">
      <svg viewBox="0 0 780 236" role="img" aria-label="the second seating: the chat and the maître d', its tools and the reservation book, the judges and the exam">
        <defs><marker id="a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#6F7F3F" /></marker></defs>
        {Object.entries(E2).map(([k, d]) => (
          <path key={k} d={d} className={"edge" + (edges.has(k) ? " lit" : "") + (k === "exam-judges" ? " pipe" : "")} markerEnd="url(#a2)"
            markerStart={k === "chat-maitre" && talk ? "url(#a2)" : undefined} />
        ))}
        {talk && <><path d="M400 90 C 380 64, 110 64, 74 90" className="edge lit back" markerEnd="url(#a2)" /><text x="236" y="70" textAnchor="middle" className="nl" style={{ fill: "#A8771C", fontWeight: 600 }}>🎭 the stand-in is judged too</text></>}
        {key === "path" && comparatorOn && <text x="466" y="78" className="nl" style={{ fill: "#D9603F", fontWeight: 600 }}>✕ one golden path</text>}
        {Object.entries(N2).map(([k, nd]) => {
          const isLit = lit.has(k);
          return (
            <g key={k}>
              <rect x={nd.x} y={nd.y} width={nd.w} height={nd.h} rx="9" className={"node" + (isLit ? " lit" : "") + (k === "book" && (mb?.path.broken || []).includes("booked_once") && key === "maitre" ? " hot" : "")} />
              <text x={nd.x + nd.w / 2} y={nd.y + (nd.h > 46 ? 22 : 19)} textAnchor="middle" className={"nl" + (isLit ? " lit" : "")}>{label(k, nd.l)}</text>
              <text x={nd.x + nd.w / 2} y={nd.y + (nd.h > 46 ? 40 : 35)} textAnchor="middle" className="ns">{sub[k] ?? nd.s}</text>
            </g>
          );
        })}
        {packets.map((k) => Array.from({ length: 3 }, (_, i) => (
          <circle key={`${k}${i}`} r="4.5" className="pk">
            <animateMotion dur={P2[k].dur} repeatCount="indefinite" begin={`${(i * 0.9).toFixed(1)}s`} path={P2[k].d} />
          </circle>
        )))}
      </svg>
      <div className="lg">{legend}</div>
    </div>
  );
}

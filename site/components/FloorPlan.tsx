"use client";
import type { Progress } from "@/lib/api";
import type { Folded } from "@/lib/useEvents";

/** The floor plan: the architecture, alive. Three rows — the exam and the
 *  exam above, brief → host → judge → gate → shipped, proposer and publish
 *  below. Nodes light as courses enable them; plates move while something
 *  runs. The back edge is dashed when you walk it by hand (course III) and
 *  solid once the graph walks it (course V). */

const N = {
  exam:     { x: 346, y: 12, w: 164, h: 44, l: "🗂 the exam", s: "evalset · 8 parties" },
  brief:    { x: 14,  y: 90, w: 104, h: 52, l: "📋 the brief", s: "the party" },
  host:     { x: 150, y: 90, w: 164, h: 52, l: "🦊 host", s: "LlmAgent · the instruction" },
  judge:    { x: 346, y: 90, w: 164, h: 52, l: "🐧 judge", s: "everyone_ate" },
  gate:     { x: 542, y: 90, w: 104, h: 52, l: "🔔 the gate", s: "score ≥ 0.9" },
  ship:     { x: 678, y: 90, w: 88,  h: 52, l: "✓ shipped", s: "deploy" },
  publish:  { x: 150, y: 180, w: 164, h: 48, l: "📝 publish", s: "instruction_current.txt" },
  proposer: { x: 346, y: 180, w: 164, h: 48, l: "👨‍🍳 proposer", s: "GEPA · reads the whys" },
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
  const code = p?.code;
  const judge = p?.judge || "everyone_ate";
  const edge = Boolean(code?.edge);
  const loop = p?.loops?.[p.loops.length - 1];
  const gateOpen = (p?.exams || []).some((e) => e.judge === "everyone_ate" && ["winner", "optimized"].includes(e.instruction) && (e.passed || 0) >= 5);

  const lit = new Set<string>(["host"]);
  if (f.people.length || n >= 1) lit.add("brief");
  if (n >= 2) { lit.add("judge"); lit.add("exam"); }
  if (n >= 3) { lit.add("gate"); lit.add("proposer"); lit.add("publish"); }
  if (n >= 4 || gateOpen) lit.add("ship");
  const edges = new Set<string>(["brief-host"]);
  if (n >= 2) { edges.add("host-judge"); edges.add("exam-judge"); }
  if (n >= 3) { edges.add("judge-gate"); edges.add("gate-proposer"); edges.add("proposer-publish"); edges.add("publish-host"); }
  if (n >= 4 || gateOpen) edges.add("gate-ship");
  if (n === 5 && !edge) edges.delete("publish-host");
  const packets: (keyof typeof P)[] = [];
  if (f.running) {
    if (f.kind === "booking") packets.push("book");
    if (f.kind === "exam") packets.push("exam");
    if (f.kind === "loop") packets.push(edge ? "loop" : "exam");
    if (f.kind === "optimize") packets.push("install");
  }
  const critic = judge === "rating";
  const bell = n >= 5 && loop?.decision === "SHIP";
  const judgeSub = critic ? "rating · pick.rating / 5" : (code?.criteria?.length ? code.criteria.join(", ") : "everyone_ate");

  const legend =
    n === 1 ? "the workbench talks to the same host. a booking is a reply; nothing grades it." :
    n === 2 ? (code?.honest_on_exam ? "everyone_ate walks the table seat by seat. pure python, deterministic, wired into adk eval." : "the built-in judge compares your reply to a golden string. it never looks at the table.") :
    n === 3 ? (["winner", "optimized"].includes(code?.instruction || "") ? "the gate reads the eight parties the optimizer never saw. one artifact changed — the instruction." : "one pass: the proposer reads the failures, writes a candidate, you install it. the dashed edge is you — a file copy, by hand.") :
    n === 4 ? (critic ? "✕ the rating judge never looks at the table. the gate opens on a number that cannot see harm." : "hacked instruction, honest judge: the honest judge reads every seat and says why.") :
    n === 5 ? (edge ? "the back edge: publish → host. round n+1 runs under round n’s rewrite. the bell is the gate." : "✕ the proposer writes a rewrite — and nothing carries it back to the host. the graph ends. the loop is one missing edge.") :
    "one host · one judge · one gate · one back edge.";

  return (
    <div className="card floor">
      <svg viewBox="0 0 780 236" role="img" aria-label="the floor plan: brief, host, judge, gate; the exam above; proposer and publish below">
        <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#6F7F3F" /></marker></defs>
        {Object.entries(E).map(([k, d]) => {
          const isLit = edges.has(k);
          const cls = "edge" + (isLit ? " lit" : "") + (k === "publish-host" ? " back" + (edge || n >= 6 ? " solid" : "") : "") + (k === "exam-judge" ? " pipe" : "");
          return <path key={k} d={d} className={cls} markerEnd="url(#a)" />;
        })}
        {Object.entries(N).map(([k, nd]) => {
          const isLit = lit.has(k);
          const label = k === "judge" && critic ? "🦚 judge" : nd.l;
          const sub = k === "judge" ? judgeSub : k === "host" ? `LlmAgent · ${code?.instruction || "the instruction"}` : nd.s;
          return (
            <g key={k}>
              <rect x={nd.x} y={nd.y} width={nd.w} height={nd.h} rx="9" className={"node" + (isLit ? " lit" : "") + (critic && k === "judge" ? " hot" : "") + (bell && k === "gate" ? " bell" : "")} />
              <text x={nd.x + nd.w / 2} y={nd.y + (nd.h > 46 ? 22 : 19)} textAnchor="middle" className={"nl" + (isLit ? " lit" : "")}>{label}</text>
              <text x={nd.x + nd.w / 2} y={nd.y + (nd.h > 46 ? 40 : 35)} textAnchor="middle" className="ns">{sub}</text>
            </g>
          );
        })}
        {critic && <><path d="M428 90 L428 56" className="edge cut" markerEnd="url(#a)" style={{ strokeDasharray: "none" }} /><text x="440" y="78" className="nl" style={{ fill: "#D9603F", fontWeight: 600 }}>✕ never looks at the table</text></>}
        {n === 5 && !edge && <text x="150" y="172" className="nl" style={{ fill: "#D9603F", fontWeight: 600 }}>✕ proposed — nothing carries it back</text>}
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

"use client";
import type { Progress } from "@/lib/api";
import { CLOSING, COURSES, LAST } from "@/lib/courses";

/** The check: eight lines, your own numbers, and what tonight cost. */
export default function Check({ p, name, onClose }: { p: Progress | null; name: string; onClose: () => void }) {
  const exams = p?.exams || [];
  const honest = exams.filter((e) => e.judge === "everyone_ate");
  const draft = honest.filter((e) => e.instruction === "draft").slice(-1)[0];
  const win = honest.filter((e) => ["winner", "optimized"].includes(e.instruction)).slice(-1)[0];
  const hr = exams.filter((e) => e.judge === "rating" && e.instruction === "hacked").slice(-1)[0];
  const hh = honest.filter((e) => e.instruction === "hacked").slice(-1)[0];
  const lp = p?.loops?.[p.loops.length - 1];
  const lb = p?.last_booking as { hungry?: number; restaurant?: string; party?: string } | null;
  const text = exams.filter((e) => e.judge === "text").slice(-1)[0];
  const rooms = p?.rooms?.[p.rooms.length - 1];
  const walk = p?.walks?.[p.walks.length - 1];
  const fl = p?.flights?.[p.flights.length - 1];
  const lines: [string, string][] = [
    [`the booking${p?.workbench_calls ? ` · ${p.workbench_calls} in the workbench` : ""}`, p?.workbench_calls ? "served" : "—"],
    ["the comparator · response_match_score", text ? `${text.passed}/8 · no reasons${rooms ? ` · ${rooms.actual.length} right answer${rooms.actual.length === 1 ? "" : "s"}` : ""}` : "—"],
    ["the judge · everyone_ate", draft ? `${draft.passed}/8 · ${draft.hungry} hungry${walk ? ` · walked ${walk.correct}/${walk.seats}` : ""}` : "—"],
    ["the flight · three judges", fl ? `${fl.comparator_passed} · ${fl.checker_passed} · ${fl.llm_passed} of ${fl.n}` : "—"],
    ["the rewrite · " + (win?.instruction === "optimized" ? "your winner" : "the winner"), win ? `${win.passed}/8 · ${win.hungry} hungry` : "—"],
    ["the other judge · rating", hr || hh ? `★ ${hr ? hr.passed : "–"}/8 · honest ${hh ? hh.passed : "–"}/8` : "—"],
    ["the loop · (proposer, publish, host)", lp ? `R${lp.rounds} · ${lp.decision || "stalled"}` : "—"],
    ["the check", p?.lit?.[String(LAST)] ? "paid" : "open"],
  ];
  return (
    <div className="sheet" onClick={onClose}>
      <div className="receipt" onClick={(e) => e.stopPropagation()}>
        <div className="t">Table for N</div>
        <div className="s">the check · {name || "tonight"}{lb?.party ? ` · party ${lb.party}` : ""}</div>
        {lines.map(([k, v], i) => <div key={i} className={"ln" + (v === "—" ? " dim" : "")}><span>{COURSES[i].r}</span><span>{k}</span><span>{v}</span></div>)}
        <div className="tot"><span>hungry tonight</span><span>{lb?.hungry ?? "—"}</span></div>
        <div className="ty">paid one line at a time · thank you, come back hungry<em>“{CLOSING}”</em></div>
        <div style={{ textAlign: "center", marginTop: 14 }}><button className="btn on" onClick={onClose}>close</button></div>
      </div>
    </div>
  );
}

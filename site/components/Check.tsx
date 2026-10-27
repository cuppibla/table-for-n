"use client";
import type { Progress } from "@/lib/api";
import { CLOSING, CLOSING2, byKey, coursesOf, type SeatingNo } from "@/lib/courses";

/** The check: one line per course, your own numbers, and what tonight cost.
 *  Each seating gets its own — the host's eight lines, the maître d's four. */
export default function Check({ p, name, seating = 1, onClose }: { p: Progress | null; name: string; seating?: SeatingNo; onClose: () => void }) {
  const exams = p?.exams || [];
  const honest = exams.filter((e) => e.judge === "everyone_ate");
  const draft = honest.filter((e) => e.instruction === "draft").slice(-1)[0];
  const win = honest.filter((e) => ["winner", "optimized"].includes(e.instruction)).slice(-1)[0];
  const hr = exams.filter((e) => e.judge === "rating" && e.instruction === "hacked").slice(-1)[0];
  const hh = honest.filter((e) => e.instruction === "hacked").slice(-1)[0];
  const lp = p?.loops?.[p.loops.length - 1];
  const lb = p?.last_booking as { hungry?: number; restaurant?: string; party?: string } | null;
  const text = exams.filter((e) => e.judge === "text").slice(-1)[0];
  const fl = p?.flights?.[p.flights.length - 1];
  const lines: [string, string][] = [
    [`the booking${p?.workbench_calls ? ` · ${p.workbench_calls} in the workbench` : ""}`, p?.workbench_calls ? "served" : "—"],
    ["the comparator · response_match_score", text ? `${text.passed}/8 · for word overlap, no reasons` : "—"],
    ["the judge · everyone_ate", draft ? `${draft.passed}/8 · ${draft.hungry} hungry` : "—"],
    ["the flight · three judges", fl ? `${fl.comparator_passed} · ${fl.checker_passed} · ${fl.llm_passed} of ${fl.n}` : "—"],
    ["the rewrite · " + (win?.instruction === "optimized" ? "your winner" : "the winner"), win ? `${win.passed}/8 · ${win.hungry} hungry` : "—"],
    ["the other judge · rating", hr || hh ? `★ ${hr ? hr.passed : "–"}/8 · honest ${hh ? hh.passed : "–"}/8` : "—"],
    ["the loop · (proposer, publish, host)", lp ? `R${lp.rounds} · ${lp.decision || "stalled"}` : "—"],
    ["the check", p?.lit?.[String(byKey("check").n)] ? "paid" : "open"],
  ];

  // the second seating
  const mb = p?.last_maitre_booking;
  const runs = p?.paths || [];
  const cmp = runs.filter((s) => s.criteria.includes("tool_trajectory_avg_score")).slice(-1)[0];
  const chk = runs.filter((s) => s.criteria.includes("path")).slice(-1)[0];
  const talk = (pe: string, k: string) => (p?.talks || []).filter((s) => s.persona === pe && s.instruction === k).slice(-1)[0];
  const three = [talk("EXPERT", "draft"), talk("NOVICE", "draft"), talk("NOVICE", "asks")];
  const lines2: [string, string][] = [
    [`the maître d’${p?.maitre_calls ? ` · ${p.maitre_calls} in the workbench` : ""}`, mb ? `${mb.calls.length} calls · path ${mb.path.passed ? "held" : "broke"}` : p?.maitre_calls ? "served" : "—"],
    ["the path · comparator → path checker", cmp || chk ? `EXACT ${cmp ? `${cmp.by_metric.tool_trajectory_avg_score?.passed ?? 0}/${cmp.n}` : "–"} · path ${chk ? `${chk.by_metric.path?.passed ?? 0}/${chk.n}` : "–"}` : "—"],
    ["the conversation · E·d, N·d, N·a", three.some(Boolean) ? three.map((s) => (s ? `${s.passed}/${s.n}` : "–")).join(" · ") : "—"],
    ["the second check", p?.lit?.[String(byKey("check2").n)] ? "paid" : "open"],
  ];
  const second = seating === 2;
  const rows = second ? lines2 : lines;
  const numerals = coursesOf(seating).map((c) => c.r);
  const party = second ? mb?.party : lb?.party;
  const hungry = second ? mb?.hungry : lb?.hungry;
  return (
    <div className="sheet" onClick={onClose}>
      <div className="receipt" onClick={(e) => e.stopPropagation()}>
        <div className="t">Table for N</div>
        <div className="s">{second ? "the second check" : "the check"} · {name || "tonight"}{party ? ` · party ${party}` : ""}</div>
        {rows.map(([k, v], i) => <div key={i} className={"ln" + (v === "—" ? " dim" : "")}><span>{numerals[i]}</span><span>{k}</span><span>{v}</span></div>)}
        <div className="tot"><span>hungry tonight</span><span>{hungry ?? "—"}</span></div>
        <div className="ty">paid one line at a time · thank you, come back hungry<em>“{second ? CLOSING2 : CLOSING}”</em></div>
        <div style={{ textAlign: "center", marginTop: 14 }}><button className="btn on" onClick={onClose}>close</button></div>
      </div>
    </div>
  );
}

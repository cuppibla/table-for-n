"use client";
import { useState } from "react";
import { judgeFlight, type FlightReply, type FlightRow, type Progress } from "@/lib/api";

/** ⚖ The flight — course IV. The last exam's eight answers, each judged by
 *  a comparator (ROUGE-1 against the golden booking — ADK's own
 *  response_match_score), the checker (world.everyone_ate), and an LLM with
 *  a rubric. Same answer, three things to measure it against. */
const V = ({ passed }: { passed: boolean | null }) => <b className={passed === null ? "na" : passed ? "p" : "f"}>{passed === null ? "—" : passed ? "PASS" : "FAIL"}</b>;

export default function Flight({ p, onJudged }: { p: Progress | null; onJudged: () => void }) {
  const [res, setRes] = useState<FlightReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const flights = p?.flights || [];
  const last = flights[flights.length - 1];
  const shown: FlightReply | null = res || (last?.rows ? { rows: last.rows, summary: last } : null);
  const srcExam = (p?.exams || []).slice().reverse().find((e) => (e.parties || []).some((r) => r.answer));
  const go = async () => {
    setBusy(true);
    try { const r = await judgeFlight(); setRes(r); onJudged(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };
  const rows: FlightRow[] = shown?.rows || [];
  const s = shown?.summary;

  return (
    <div className="flight">
      <div className="k">⚖ THE SAME ANSWERS, THREE JUDGES{srcExam ? <> · the last exam · {srcExam.instruction} instruction · {srcExam.judge === "text" ? "graded by the text metric" : `graded by ${srcExam.judge}`}</> : ""}</div>
      <div className="hint">{!srcExam
        ? <>No exam with recorded answers yet — 📝 run the exam on course II or III first. The flight grades the answers the host already gave; it never books anything new.</>
        : s
          ? <>Eight answers, nothing re-booked. <b>comparator {s.comparator_passed}/{s.n}</b> · <b>checker {s.checker_passed}/{s.n}</b> · <b>llm judge {s.llm_passed}/{s.n}</b>{s.llm_unanswered ? ` (${s.llm_unanswered} unanswered)` : ""} in {(s.ms / 1000).toFixed(1)} s.
              {s.fed_but_failed_text.length > 0 && <> The comparator <b>failed {s.fed_but_failed_text.join(", ")}</b>, where everyone ate — the words were different from the golden booking.</>}
              {s.hungry_but_passed_text.length > 0 && <> It <b>passed {s.hungry_but_passed_text.join(", ")}</b>, where somebody went hungry — the words overlapped.</>}
              {s.llm_disagrees.length > 0 ? <> The LLM judge disagreed with the checker on <b>{s.llm_disagrees.join(", ")}</b>.</> : <> The LLM judge agreed with the checker on every table this time.</>}
              {s.same_as_last && <> Against the last flight: comparator {s.same_as_last.comparator ? "unchanged" : "changed"}, checker {s.same_as_last.checker ? "unchanged" : "changed"}, llm judge <b>{s.same_as_last.llm ? "unchanged" : "changed"}</b>.</>}</>
          : <>One table, three columns, one real model call per row for the third. The first two are the exam’s own code — the number in the comparator column is exactly what course II printed.</>}</div>

      <div className="opts">
        <button className="btn gold" disabled={busy || !srcExam} onClick={go}>{busy ? "⚖ judging… (eight model calls)" : res || last ? "⚖ judge it again" : "⚖ judge it three ways"}</button>
        {s && !res && <span className="art">your last flight, from the kitchen’s receipt — press ⚖ for a fresh one</span>}
      </div>

      <table className="three">
        <thead><tr><th></th>
          <th>comparator<small>needs a golden answer · ROUGE-1 ≥ 0.3</small></th>
          <th>checker<small>needs the rules · everyone_ate ≥ 0.9</small></th>
          <th>llm judge<small>needs a model + a rubric</small></th></tr></thead>
        <tbody>
          {rows.length ? rows.map((r) => (
            <tr key={r.party} className={open === r.party ? "open" : ""} onClick={() => setOpen(open === r.party ? null : r.party)} title="click for the answer, the golden booking and the three whys">
              <td className="pid">{r.party}<small>{r.checker.restaurant ? `${r.checker.restaurant} · ${r.checker.time}` : "?"}</small></td>
              <td><V passed={r.comparator.passed} /><small>{r.comparator.score.toFixed(2)}</small></td>
              <td><V passed={r.checker.passed} /><small>{r.checker.score.toFixed(2)}{r.checker.passed ? "" : ` · ${r.checker.why.split(" · ").length} hungry`}</small></td>
              <td><V passed={r.llm.passed} /><small>{r.llm.ms ? `${(r.llm.ms / 1000).toFixed(1)} s` : ""}</small></td>
            </tr>
          )) : (
            <tr className="empty"><td colSpan={4}>{srcExam ? "press ⚖ — the eight answers are already in the exam receipt" : "run an exam first"}</td></tr>
          )}
        </tbody>
      </table>
      {open && rows.find((r) => r.party === open) && (() => { const r = rows.find((x) => x.party === open)!; return (
        <div className="detail">
          <div><span className="k">THE ANSWER</span><pre>{r.answer}</pre></div>
          <div><span className="k">THE GOLDEN BOOKING</span><pre>{r.golden || "—"}</pre></div>
          <div className="whys">
            <div><b>comparator</b> {r.comparator.why}</div>
            <div><b>checker</b> {r.checker.why}</div>
            <div><b>llm judge</b> {r.llm.why}</div>
          </div>
        </div>
      ); })()}
      <div className="foot">three blind spots: the comparator punishes a correct answer worded differently · the checker sees nothing outside the rules you wrote · the judge can be wrong, and can change its mind. Gut check: if you can write the answer down, use a comparator; if you can only write down what makes an answer <i>valid</i>, you need a checker.</div>
    </div>
  );
}

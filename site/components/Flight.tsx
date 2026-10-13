"use client";
import { useState } from "react";
import { judgeFlight, type FlightReply, type FlightRow, type Progress } from "@/lib/api";

/** ⚖ The flight — course IV. ONE answer the host already gave (the party
 *  picked on the left; p1 is tonight's), judged three ways: a comparator
 *  (ROUGE-1 against the golden booking — ADK's own response_match_score),
 *  the checker (world.everyone_ate), and an LLM with a rubric. Same answer,
 *  three things to measure it against. "All eight" is a fold-out. */
const V = ({ passed }: { passed: boolean | null }) => <b className={"vd " + (passed === null ? "na" : passed ? "p" : "f")}>{passed === null ? "no answer" : passed ? "PASS" : "FAIL"}</b>;

const JUDGES = [
  { key: "comparator", name: "the comparator", metric: "response_match_score", asks: "is this the same as my answer?", needs: "a golden answer — a human wrote one booking per party into the evalset", bar: "ROUGE-1 word overlap ≥ 0.3",
    blind: "a correct answer worded differently gets punished; a wrong one with the right words slips through. It never read the party." },
  { key: "checker", name: "the checker", metric: "everyone_ate", asks: "does this answer actually hold up?", needs: "the rules — six checks per seat, no golden answer at all", bar: "seats fed ÷ seats at the table ≥ 0.9",
    blind: "sees nothing outside the rules you wrote. Deterministic: same answer, same verdict, same sentences, every time." },
  { key: "llm", name: "the llm judge", metric: "gemini-2.5-flash + a rubric", asks: "does everyone get to eat? (asked of a model)", needs: "a model and a four-line rubric — one real call each time you press", bar: "the model says PASS",
    blind: "can be wrong, and can change its mind between presses. Costs a call. No golden answer needed, and nothing to read the rules from." },
] as const;

export default function Flight({ p, party, onJudged, onRunExam, examRunning, stopBtn }: {
  p: Progress | null; party: string; onJudged: () => void; onRunExam: () => void; examRunning: boolean; stopBtn: React.ReactNode;
}) {
  const [res, setRes] = useState<FlightReply | null>(null);
  const [busy, setBusy] = useState(false);
  const flights = p?.flights || [];
  const last = flights.slice().reverse().find((f) => f.rows?.some((r) => r.party === party));
  const shown: FlightReply | null = res && res.rows.some((r) => r.party === party) ? res : last?.rows ? { rows: last.rows, summary: last } : null;
  const srcExam = (p?.exams || []).slice().reverse().find((e) => (e.parties || []).some((r) => r.answer));
  const recorded = srcExam?.parties?.find((r) => r.party === party);
  const go = async () => {
    setBusy(true);
    try { const r = await judgeFlight(party); setRes(r); onJudged(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };
  const row: FlightRow | undefined = shown?.rows.find((r) => r.party === party);
  const s = shown?.summary;
  const verdictOf = (r: FlightRow, k: string) => k === "comparator" ? r.comparator : k === "checker" ? r.checker : r.llm;
  const n = (p?.flights || []).filter((f) => f.party === party).length;

  return (
    <div className="flight">
      <div className="k">⚖ ONE ANSWER, THREE JUDGES · party {party}{srcExam ? <> · the booking the exam recorded under the {srcExam.instruction} instruction</> : ""}</div>

      {!srcExam ? (
        <>
          <div className="hint">The flight never books anything new — it re-grades an answer the host already gave on the exam. There is no exam with recorded answers yet (a fresh start, or receipts cleared), so run one first; about a minute, then the ⚖ button appears here.</div>
          <div className="opts">
            <button className="btn gold" disabled={examRunning} onClick={onRunExam}>{examRunning ? "📝 the exam is running…" : "📝 run the exam · about a minute"}</button>
            {stopBtn}
          </div>
        </>
      ) : !recorded ? (
        <div className="hint">The last exam has no recorded answer for {party}. Pick one of the exam’s eight parties on the left (p1 is tonight’s).</div>
      ) : (
        <>
          <div className="pair">
            <div><span className="k">WHAT THE HOST ANSWERED · {party}</span><pre>{recorded.answer}</pre></div>
            <div><span className="k">THE GOLDEN BOOKING IN THE EVALSET</span><pre>{row?.golden || "(press ⚖ to load it)"}</pre></div>
          </div>
          <div className="hint">Same answer, three different things to measure it against. Press once to see the three verdicts. Press again and watch which of the three can change its mind.</div>
          <div className="opts">
            <button className="btn gold" disabled={busy} onClick={go}>{busy ? "⚖ judging… (one model call)" : row ? "⚖ judge it again" : "⚖ judge this answer three ways"}</button>
            {row && n > 1 && <span className="art">press {n} for {party}{s?.same_as_last ? <> · against the last press: comparator <b>{s.same_as_last.comparator ? "same" : "changed"}</b> · checker <b>{s.same_as_last.checker ? "same" : "changed"}</b> · llm judge <b>{s.same_as_last.llm ? "same" : "changed"}</b></> : ""}</span>}
          </div>

          <div className="judges">
            {JUDGES.map((j) => {
              const v = row ? verdictOf(row, j.key) : null;
              return (
                <div key={j.key} className={"judgecard" + (v ? (v.passed === null ? "" : v.passed ? " pass" : " fail") : "")}>
                  <div className="head"><b>{j.name}</b><span className="mono">{j.metric}</span>{v && <V passed={v.passed} />}</div>
                  <div className="row"><span className="lbl">asks</span><span><i>{j.asks}</i></span></div>
                  <div className="row"><span className="lbl">needs</span><span>{j.needs}</span></div>
                  <div className="row"><span className="lbl">passes if</span><span>{j.bar}</span></div>
                  {v && <div className="row verdict"><span className="lbl">said</span><span><b>{v.passed === null ? "—" : v.passed ? "PASS" : "FAIL"}</b>{v.score !== null && v.score !== undefined && j.key !== "llm" ? <> · {v.score.toFixed(2)}</> : ""}{"ms" in v && v.ms ? <> · {(v.ms / 1000).toFixed(1)} s</> : ""} — {v.why}</span></div>}
                  <div className="row blind"><span className="lbl">blind spot</span><span>{j.blind}</span></div>
                </div>
              );
            })}
          </div>

          {row && (
            <div className="hint">
              {row.comparator.passed !== row.checker.passed && <>The comparator and the checker <b>disagree</b> on this very answer — {row.comparator.passed ? <>the words overlapped the golden booking enough to pass, while {row.checker.why}</> : <>the words differed from the golden booking, while the checker says {row.checker.why}</>}. </>}
              {row.comparator.passed === row.checker.passed && <>Both the comparator and the checker say <b>{row.checker.passed ? "PASS" : "FAIL"}</b> here — for different reasons: one counted words, one counted seats. Try another party on the left; they do not always agree. </>}
              {row.llm.passed !== null && row.llm.passed !== row.checker.passed && <>The LLM judge <b>disagreed with the checker</b>: “{row.llm.why}” — read it against the whys above. </>}
              {row.llm.passed !== null && row.llm.passed === row.checker.passed && <>The LLM judge agreed with the checker this time. </>}
            </div>
          )}

          <div className="foot">Gut check: if you can confidently write down <i>the answer</i>, use a comparator. If you can only write down <i>what makes an answer valid</i>, you need a checker. If you can only describe good in prose, you are asking a model — and you should check the model.</div>

        </>
      )}
    </div>
  );
}

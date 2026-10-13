"use client";
import { useEffect, useState } from "react";
import { getWalk, walkTable, type Progress, type WalkReply, type WalkSeat } from "@/lib/api";
import { GUESTS, SHORT_TAG } from "@/lib/courses";

/** 🍽 Be the judge — course III. The table the host just booked. Mark each
 *  chair ate / hungry yourself, then walk it: world.ate runs seat by seat
 *  and the page shows which of the six checks each person stopped at.
 *  Run it again — same verdict, same sentences, microseconds, no model. */
const CHECK_LABEL: Record<string, string> = { diet: "diet", allergy: "allergy", spice: "spice", budget: "budget", walk: "walk", timing: "timing" };

export default function Walk({ party, p, lastBookingTs, onWalked }: { party: string; p: Progress | null; lastBookingTs: number | null; onWalked: () => void }) {
  const [table, setTable] = useState<WalkReply | null>(null);
  const [pred, setPred] = useState<Record<string, boolean>>({});
  const [out, setOut] = useState<WalkReply | null>(null);
  const [shown, setShown] = useState(0);              // how many seats the replay has revealed
  const [runs, setRuns] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOut(null); setPred({}); setShown(0); setRuns(0);
    getWalk(party).then((t) => {
      setTable(t);
      // a walk you already made of THIS table comes back revealed, no replay
      const prev = (p?.walks || []).filter((w) => w.party === party && w.restaurant === t.restaurant && w.time === t.time).slice(-1)[0];
      if (prev) {
        const pr: Record<string, boolean> = {};
        prev.detail.forEach((s) => { if (s.predicted !== null && s.predicted !== undefined) pr[s.id] = s.predicted; });
        setPred(pr);
        setOut({ ...t, seats: prev.detail, score: prev.score, passed: prev.passed, threshold: prev.threshold, correct: prev.correct, guessed: prev.guessed, us: prev.us, checks: prev.checks });
        setShown(prev.detail.length); setRuns(1);
      }
    }).catch(() => setTable(null));
  }, [party, lastBookingTs]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the replay: one seat every 650 ms, so the six checks read as a walk and not a dump
  useEffect(() => {
    if (!out) return;
    if (shown >= out.seats.length) return;
    const t = setTimeout(() => setShown((s) => s + 1), runs > 1 ? 120 : 650);
    return () => clearTimeout(t);
  }, [out, shown, runs]);

  const people = table?.people || [];
  const ready = Boolean(table?.restaurant);
  const mark = (id: string, v: boolean) => { if (out && shown < out.seats.length) return; setPred((p) => ({ ...p, [id]: v })); };
  const walk = async () => {
    if (!table?.restaurant) return;
    setBusy(true);
    try { const r = await walkTable(party, table.restaurant, table.time || "19:00", pred); setOut(r); setShown(0); setRuns((n) => n + 1); onWalked(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };
  const done = out && shown >= out.seats.length;
  const seatOut = (id: string): WalkSeat | undefined => out?.seats.find((s) => s.id === id);
  const idx = (id: string) => out ? out.seats.findIndex((s) => s.id === id) : -1;

  return (
    <div className="walk">
      <div className="k">🍽 BE THE JUDGE · {ready ? <>{table!.restaurant_name} · {table!.time} · party {party}</> : <>party {party}</>}</div>
      {!ready ? (
        <div className="hint">Nothing to walk yet — 📋 <b>Book the table</b> on the left first. The host picks a room; then you judge it before the kitchen does.</div>
      ) : (
        <div className="hint">{done
          ? <>The function stopped where you see it stop. <b>{out!.correct} of {out!.guessed || out!.seats.length}</b> chairs as you called them · score {out!.score.toFixed(2)} → <b>{out!.passed ? "PASSED" : "FAILED"}</b> (the bar is {out!.threshold}, and the verdict is the function’s own). {out!.us.toLocaleString()} µs, no model call{runs > 1 ? <> · run {runs}: <b>identical</b>. Same input, same verdict, same sentences, every time.</> : ""}</>
          : out ? <>walking the table…</>
          : <>For each chair: can this person eat at <b>{table!.restaurant_name}</b> at {table!.time}? Mark <i>ate</i> or <i>hungry</i>, then walk it. The kitchen runs the same six checks per seat, in the same order, and shows where each one stopped.</>}</div>
      )}
      <div className="seats">
        {people.map((p) => {
          const g = GUESTS[p.id]; const so = seatOut(p.id); const i = idx(p.id);
          const revealed = out ? i < shown : false;
          const st = !revealed ? "" : so?.ate ? " ate" : " hungry";
          return (
            <div key={p.id} className={"wseat" + st}>
              <img src={g?.img || "/art/ben.jpg"} alt={p.name} />
              <div className="who"><b>{p.name}</b><span>{SHORT_TAG[p.id] || p.label}</span></div>
              <div className="guess">
                <button className={"chip" + (pred[p.id] === true ? " on" : "")} onClick={() => mark(p.id, true)} disabled={!ready}>ate</button>
                <button className={"chip" + (pred[p.id] === false ? " on bad" : "")} onClick={() => mark(p.id, false)} disabled={!ready}>hungry</button>
              </div>
              {revealed && so && (
                <div className="checks">
                  {out!.checks.map((c) => {
                    const stoppedHere = so.check === c;
                    const passedIt = so.ate || out!.checks.indexOf(c) < out!.checks.indexOf(so.check);
                    return <i key={c} className={stoppedHere ? "stop" : passedIt ? "ok" : "na"} title={c}>{CHECK_LABEL[c]}</i>;
                  })}
                  <span className={"why" + (so.ate ? " ok" : "")}>{so.ate ? "ate" : so.why}{so.correct === true ? " · you said so ✓" : so.correct === false ? " · you called it the other way" : ""}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="opts">
        <button className="btn gold" disabled={!ready || busy || Boolean(out && !done)} onClick={walk}>{out ? "↻ walk it again" : "🍽 walk the table"}</button>
        {ready && !out && <span className="art">{Object.keys(pred).length} of {people.length} chairs marked — the walk runs either way; a guess just gets scored.</span>}
        {done && <span className="art">diet → allergy → spice → budget → walk → timing: six checks, per person, every time. Then seats fed ÷ seats at the table, and <b>your</b> function returns PASSED or FAILED.</span>}
      </div>
    </div>
  );
}

"use client";
import { useMemo } from "react";
import type { Progress } from "@/lib/api";
import type { Folded, Seat } from "@/lib/useEvents";
import { GUESTS, SHORT_TAG, type Course } from "@/lib/courses";
import Console from "./Console";

/** The stage: the judge switch, the table, the host and the judge talking,
 *  📋 Book, and one number. The table is a projection of the event log —
 *  nothing here computes a score. */

export const PARTIES = ["p1", "p2", "p3", "p10", "p13", "p14", "p15", "p16"];

export default function Stage({ course, p, f, view, party, setParty, onJudge, onBook, booking, fallback }: {
  course: Course; p: Progress | null; f: Folded; view: "show" | "console";
  party: string; setParty: (s: string) => void;
  onJudge: (to: "everyone_ate" | "rating") => void; onBook: () => void; booking: boolean;
  fallback: Seat[];
}) {
  const judge = p?.judge || "everyone_ate";
  const seats: Seat[] = f.people.length ? f.people : fallback;
  const N = seats.length || 5;
  const review = judge === "rating" && view === "show";
  const exams = p?.exams || [];
  const honestExams = exams.filter((e) => e.judge === "everyone_ate");
  const lastHonest = honestExams[honestExams.length - 1];
  const lastText = exams.filter((e) => e.judge === "text").slice(-1)[0];
  const scored = f.scored;
  const ateCount = scored ? Math.round((scored.honest ?? scored.score) * scored.total) : null;
  const examEp = f.kind === "exam";
  const examNow = f.exam || (examEp ? null : null);

  const num = useMemo<[string, string, string]>(() => {
    const loop = p?.loops?.[p.loops.length - 1];
    const gate = honestExams.filter((e) => ["winner", "optimized"].includes(e.instruction)).slice(-1)[0];
    const r = exams.filter((e) => e.judge === "rating" && e.instruction === "hacked").slice(-1)[0];
    const h = honestExams.filter((e) => e.instruction === "hacked").slice(-1)[0];
    const lb = p?.last_booking as { hungry?: number } | null;
    const k = course.key;
    const rooms = p?.rooms?.[p.rooms.length - 1];
    const fl = p?.flights?.[p.flights.length - 1];
    if (k === "booking") return ["hungry", "?", ""];
    if (k === "comparator") return lastText
      ? ["exam", `${lastText.passed}/8 · no reasons${rooms ? ` · ${rooms.actual.length} right answer${rooms.actual.length === 1 ? "" : "s"}` : ""}`, "bad"]
      : ["exam", "not run yet", ""];
    if (k === "judge") return p?.code?.honest_on_exam
      ? (lastHonest ? ["exam", `${lastHonest.passed}/8 · ${lastHonest.hungry} hungry`, "good"] : ["exam", "run it", ""])
      : ["exam", "your judge is not on it yet", "bad"];
    if (k === "flight") return fl ? ["three judges", `${fl.comparator_passed} · ${fl.checker_passed} · ${fl.llm_passed} of ${fl.n}`, "good"] : ["three judges", "—", ""];
    if (k === "rewrite") return gate ? ["holdout", `${gate.passed}/8${(gate.passed || 0) >= 5 ? " · SHIP" : ""}`, (gate.passed || 0) >= 5 ? "good" : "bad"]
      : [`holdout`, lastHonest ? `${lastHonest.passed}/8` : "—", "bad"];
    if (k === "other") return ["exam", `★ ${r ? r.passed : "–"}/8 · honest ${h ? h.passed : "–"}/8`, r && h ? "bad" : ""];
    if (k === "loop") return ["rounds", loop ? `${loop.rounds} · ${loop.decision || "stalled"}` : "—", loop?.decision === "SHIP" ? "good" : "bad"];
    return ["hungry tonight", lb?.hungry === undefined ? "—" : String(lb.hungry), lb?.hungry === 0 ? "good" : "bad"];
  }, [course.key, p, exams, honestExams, lastHonest, lastText]);

  const whys = seats.filter((s) => s.ate === false && s.why).map((s) => `${s.name}: ${s.why}`);
  const judgeLine = scored
    ? (judge === "everyone_ate"
      ? `${ateCount} of ${scored.total} ate.${whys.length ? " " + whys.join(" · ") : ""}`
      : `rating ${scored.rating?.toFixed(2)} ≥ ${scored.threshold} — ${scored.passed ? "PASSED" : "FAILED"}. (it read the stars. it did not read the party.)`)
    : examEp
      ? (f.exam ? `exam · ${f.exam.criteria.join(", ")} · ${f.exam.passed} passed, ${f.exam.failed} failed${f.exam.hungry !== null ? ` · ${f.exam.hungry} hungry seats` : " · no seats counted"}`
        : "the exam is running — eight parties, one call each…")
      : f.kind === "loop" ? (f.gate ? `${f.gate.decision} · ${f.gate.why}` : "the loop is running…")
      : "no judge yet — you already know who goes hungry. Nothing else does.";
  const judgeDim = !scored && !f.exam && !f.gate;

  const center = scored
    ? { big: <>{ateCount} <span className="dim">/ {scored.total}</span></>, pill: judge === "everyone_ate" ? (scored.passed ? "pass" : "fail") : (scored.passed ? "pass" : "fail"),
        line: <><b>{f.pick?.restaurant_name}</b> · {f.pick?.time}<br /><span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>{judge} · {(judge === "everyone_ate" ? scored.honest ?? scored.score : scored.rating ?? scored.score)?.toFixed(2)}{f.kind === "loop" && f.climbs.length ? ` · round ${f.climbs[f.climbs.length - 1].round}` : ""}</span></> }
    : f.exam
      ? { big: <>{f.exam.passed} <span className="dim">/ {(f.exam.passed || 0) + (f.exam.failed || 0)}</span></>, pill: f.exam.failed === 0 ? "pass" : "fail",
          line: <><b>the exam</b> · {f.exam.criteria.join(", ")}<br /><span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>{f.exam.hungry !== null ? `${f.exam.hungry} hungry of ${f.exam.seats}` : "no seats counted"} · {f.exam.instruction}</span></> }
      : f.pick
        ? { big: <>— <span className="dim">/ {N}</span></>, pill: "", line: <><b>{f.pick.restaurant_name}</b> · {f.pick.time}<br /><span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>no judge yet</span></> }
        : { big: <>— <span className="dim">/ {N}</span></>, pill: "", line: <><b>{examEp ? "the exam" : "table for " + N}</b><br /><span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>{examEp ? "running…" : "not booked yet"}</span></> };

  const unlaid = !f.pick && !f.exam;
  const climbRows = course.key === "loop" && f.kind === "loop"
    ? f.climbs.map((c) => ({ k: `R${c.round}`, v: c.score, l: c.score.toFixed(2) + (f.gate?.decision === "SHIP" && c === f.climbs[f.climbs.length - 1] ? " ✓" : "") }))
    : course.key === "rewrite" && honestExams.length
      ? honestExams.slice(-3).map((e) => ({ k: e.instruction === "optimized" ? "yours" : e.instruction, v: (e.passed || 0) / 8, l: `${e.passed}/8${(e.passed || 0) >= 5 ? " ✓" : ""}` }))
      : [];

  return (
    <div className={"card stage-card" + (review ? " review" : "")}>
      <div className="judge">
        <span className="k">JUDGE</span>
        <div className={"seg" + (f.kind === "loop" && f.running ? " armed" : "")}>
          <button className={judge === "everyone_ate" ? "on" : ""} onClick={() => onJudge("everyone_ate")}><img src="/art/maitre.jpg" alt="" />everyone_ate</button>
          <button className={judge === "rating" ? "on rating" : ""} onClick={() => onJudge("rating")}><img src="/art/critic.jpg" alt="" />rating</button>
        </div>
        <span className={"feedchip " + (f.connected ? "live" : "off")}>{f.connected ? `● LIVE · ${p?.mode === "vertex" ? "Vertex AI" : "real model"}` : "○ the kitchen is away"}</span>
      </div>

      {review && (
        <div className="reviewcard">
          <div className="photo"><span>TRENDING</span></div>
          <div className="body">
            <h3>{f.pick?.restaurant_name || "Smoke & Barrel"}</h3>
            <div className="stars">{"★".repeat(Math.round(f.pick?.rating || 4.9))} <b>{(f.pick?.rating || 4.9).toFixed(1)}</b> · 2,311 reviews</div>
            <div className="meta">{f.pick ? `${(f.pick as unknown as { cuisine?: string }).cuisine || ""} · ` : ""}the room everyone is talking about · avg. wait 45 min</div>
            <div className="meta">“{f.pick?.reason || "Brisket flights, live fire, big communal tables."}”</div>
            <div className={"verdict" + (scored && !scored.passed ? " bad" : "")}>
              {scored ? `rating ${scored.rating?.toFixed(2)} ${scored.passed ? "≥" : "<"} ${scored.threshold} · ${scored.passed ? "PASSED" : "FAILED"}` : "rating_score(party, pick) → pick.rating / 5"}
              {(() => { const r = exams.filter((e) => e.judge === "rating").slice(-1)[0]; return r ? ` · exam ${r.passed} / 8` : ""; })()}
            </div>
          </div>
        </div>
      )}

      {view === "console" ? <Console f={f} judge={judge} /> : (
        <div className={"tablewrap" + (unlaid ? " unlaid" : "")}>
          {f.kind === "loop" && f.climbs.length > 0 && (
            <div className="round">R{f.climbs[f.climbs.length - 1].round} · <b>{f.climbs[f.climbs.length - 1].score.toFixed(2)}</b>{f.gate ? <> · <b style={{ color: f.gate.decision === "SHIP" ? "var(--sage-ink)" : "var(--tomato)" }}>{f.gate.decision}{f.gate.decision === "SHIP" ? " 🔔" : ""}</b></> : f.running ? " · …" : <> · <span style={{ color: "var(--tomato)" }}>stalled</span></>}</div>
          )}
          {climbRows.length > 0 && (
            <div className="climb">
              <div className="k">{course.key === "loop" ? "ROUNDS" : "HOLDOUT · 8 PARTIES"}</div>
              {climbRows.map((r, i) => <div key={i} className={"row" + (r.v >= 0.6 ? " ship" : "")}><span>{r.k}</span><span className="bar"><i style={{ width: `${Math.round(r.v * 100)}%` }} /></span><b>{r.l}</b></div>)}
            </div>
          )}
          <div className="tabletop">
            <div className="score">
              <div className="big display">{center.big}</div>
              {center.pill && <div style={{ marginTop: 4 }}><span className={"pill " + center.pill}>{center.pill === "pass" ? "PASSED" : "FAILED"}</span></div>}
              <div className="pickline">{center.line}</div>
            </div>
          </div>
          <div>
            {seats.map((s, i) => {
              const deg = i * 360 / N - 90 + 18, rad = deg * Math.PI / 180;
              const st = s.flash ? "flash" : s.ate === false ? "hungry" : s.ate ? "ate" : "wait";
              const R = st === "hungry" ? 190 : 168;
              const x = Math.cos(rad) * R, y = Math.sin(rad) * R;
              const side = x > 120 ? "r" : x < -120 ? "l" : "c";
              const g = GUESTS[s.id];
              return (
                <div key={s.id} className={"seat " + st} style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }}>
                  <img src={g?.img || "/art/ben.jpg"} alt={s.name} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                  <div className="nm">{s.name}</div>
                  <div className="tag">{SHORT_TAG[s.id] || s.label}</div>
                  {(st === "hungry" || st === "flash") && s.why && <div className={"why " + side}>{s.why}</div>}
                </div>
              );
            })}
          </div>
          {f.minted.length > 0 && (
            <div className="examcard"><div className="k">🗂 MINTED · next round’s exam</div>{f.minted[0].case_id}{f.minted.length > 1 ? ` (+${f.minted.length - 1})` : ""}</div>
          )}
          {f.running && <div className="busy-note">{f.kind === "exam" ? "📝 THE EXAM IS RUNNING · ~2 MIN" : f.kind === "loop" ? "↻ THE LOOP IS RUNNING" : f.kind === "booking" ? "📋 BOOKING…" : `${f.kind.toUpperCase()}…`}</div>}
        </div>
      )}

      <div className="scene">
        <div className={"host" + (booking || (f.running && f.kind === "booking") ? " booking" : "")}><img src="/art/concierge.jpg" alt="the host" /></div>
        <div className="bubble">
          <div className="who">THE HOST{f.pick ? ` · booked under the ${f.pick.instruction} instruction` : ""}</div>
          <div>{f.pick ? `“${f.pick.reason}”` : f.error ? <span style={{ color: "var(--tomato)" }}>{f.error}</span> : "…"}</div>
          <div className={"jl" + (judgeDim ? " dim" : "") + (judge === "rating" ? " rating" : "")}>
            <img src={judge === "rating" ? "/art/critic.jpg" : "/art/maitre.jpg"} alt="" /><span>{judgeLine}</span>
          </div>
        </div>
      </div>
      <div className="controls">
        <button className="btn hot" onClick={onBook} disabled={booking || f.running || course.key === "booking"} title={course.key === "booking" ? "course I books in the workbench" : ""}>
          {course.key === "booking" ? "📋 Book — in the workbench" : booking ? "📋 booking…" : "📋 Book the table"}
        </button>
        <select value={party} onChange={(e) => setParty(e.target.value)}>
          {PARTIES.map((id) => <option key={id} value={id}>party · {id}</option>)}
        </select>
        <span className={"num " + num[2]}>{num[0]} <b>{num[1]}</b></span>
      </div>
    </div>
  );
}

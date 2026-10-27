"use client";
import { useState } from "react";
import type { Progress, Rule, Seating, SeatingRow } from "@/lib/api";
import type { Folded } from "@/lib/useEvents";
import { callLabel } from "./Paths";

/** The second seating's receipts, on the page. A seating exam puts several
 *  judges on every case at once, so a tile is a grid — judges down, parties
 *  across — and a click opens one case: the calls, the conversation, and
 *  every judge's why. Nothing here computes a verdict: ADK's are in the
 *  receipt (kitchen/jobs.py, _finish_seating), and so are our own. */

// course XI's five judges, in the order the story reads them: [metric, short, what it reads]
export const TALK_METRICS: [string, string, string][] = [
  ["everyone_ate", "fed", "everyone_ate — graded on the reservation, not on the reply"],
  ["path", "path", "the path checker — four rules over the calls"],
  ["asked_before_booking", "asked", "asked_before_booking — was every need heard before the book call?"],
  ["rubric_based_multi_turn_trajectory_quality_v1", "rubric", "an LLM judge, three rubrics: asked first · listened · no argument"],
  ["per_turn_user_simulator_quality_v1", "🎭 stand-in", "grades the SIMULATED organizer, not the agent: did it stick to its plan?"],
];
const SHORT: Record<string, string> = { ...Object.fromEntries(TALK_METRICS.map(([k, s]) => [k, s])), tool_trajectory_avg_score: "comparator" };
const shortOf = (k: string) => SHORT[k] || k;
const nOf = (s: Seating) => s.n || (s.passed || 0) + (s.failed || 0);
const mark = (v?: string) => (v === "PASSED" ? "p" : v === "FAILED" ? "f" : "");
const tick = (v?: string) => (v === "PASSED" ? "✓" : v === "FAILED" ? "✗" : "·");
const broken = (r: SeatingRow) => (r.rules || []).filter((x) => !x.ok).map((x) => x.rule);

/** Why one case failed, in a few words — the receipt's own sentences. */
export function failedBecause(r: SeatingRow): string {
  if (!r.restaurant) return "never booked";
  const fed = r.metrics?.everyone_ate?.status;
  if (fed === "FAILED" && r.whys?.length) return r.whys[0];
  const b = broken(r);
  if (b.length) return `broke ${b.join(", ")}`;
  const others = Object.entries(r.metrics || {}).filter(([, m]) => m.status === "FAILED").map(([k]) => shortOf(k));
  return others.length ? `${others.join(", ")} failed` : "failed";
}

const chipTitle = (r: SeatingRow) => [
  `${r.party} · ${r.status}${r.restaurant ? ` · ${r.restaurant} ${r.time || ""}` : " · no reservation"}`,
  ...Object.entries(r.metrics || {}).map(([k, m]) => `${shortOf(k)}: ${m.status}${m.score === null ? "" : ` (${m.score})`}`),
  ...broken(r).map((x) => `✗ ${x}`),
  ...(r.whys || []),
].join("\n");

/** One seating exam as a tile: the count, a line per judge, a chip per party. */
export function SeatTile({ label, s, empty }: { label: string; s?: Seating; empty?: string }) {
  const n = s ? nOf(s) : 0;
  return (
    <div className={"result " + (s ? ((s.failed || 0) === 0 ? "pass" : "fail") : "")}>
      {label}<b>{s ? `${s.passed} / ${n}` : "—"}</b>
      {s ? Object.entries(s.by_metric || {}).map(([k, v]) => `${shortOf(k)} ${v.passed}/${n}`).join(" · ") : empty || "not run yet"}
      {s && (
        <span className="under">
          {s.persona ? `${s.persona} · ` : ""}the maître d’ under the <b style={{ display: "inline", fontSize: 11, fontFamily: "inherit" }}>{s.instruction}</b> instruction
          {s.hungry !== null ? ` · ${s.hungry} hungry of ${s.seats}` : ""}{s.replayed ? <> · <i className="replayed">replayed from our run</i></> : null}
        </span>
      )}
      {(s?.parties?.length || 0) > 0 && (
        <div className="strip">{s!.parties!.map((r) => <i key={r.party} className={mark(r.status)} title={chipTitle(r)}>{r.party} {tick(r.status)}</i>)}</div>
      )}
      {s?.ladder && (
        <div className="ladder" title="the same recorded calls, read again by every judge in the room — nothing re-run">
          <span>same calls, every judge</span>
          {Object.entries(s.ladder).map(([k, v]) => <i key={k} className={v === n ? "p" : v === 0 ? "f" : ""}>{k.replace("IN_ORDER · ignore_args", "ignore_args")} {v}/{n}</i>)}
        </div>
      )}
    </div>
  );
}

/** Course X, in sentences — read off the two receipts, never typed in. */
export function PathCompare({ a, b }: { a?: Seating; b?: Seating }) {
  if (!a && !b) return null;
  const heldButHungry = (b?.parties || []).filter((r) => r.judges?.path && !r.judges?.everyone_ate).length;
  const failed = (b?.parties || []).filter((r) => r.status === "FAILED");
  return (
    <div className="compare">
      {a && <><b>The comparator passed {a.by_metric?.tool_trajectory_avg_score?.passed ?? 0} of {nOf(a)}.</b>{a.ladder ? <> Read again by every judge, the same calls: the golden path matched {a.ladder.EXACT ?? 0}, the path checker found {a.ladder.path ?? 0} that held, and {a.ladder.everyone_ate ?? 0} fed everyone.</> : null}{" "}</>}
      {b && <><b>The path checker held on {b.by_metric?.path?.passed ?? 0} of {nOf(b)}</b>, everyone_ate fed {b.by_metric?.everyone_ate?.passed ?? 0}. {failed.length
        ? <>What fails now fails for a named reason — {failed.map((r) => `${r.party}: ${failedBecause(r)}`).join(" · ")}.</>
        : "Nothing failed."}{heldButHungry > 0 ? " A path that held and a table that still went hungry is a reasoning failure: the fix is the instruction, not the path." : ""}{" "}</>}
      Hover a chip.
    </div>
  );
}

// ── course XI · the conversation, three ways ─────────────────────────────────
const THREE: [string, string, string][] = [["EXPERT", "draft", "EXPERT · draft"], ["NOVICE", "draft", "NOVICE · draft"], ["NOVICE", "asks", "NOVICE · asks"]];

function TalkTile({ label, s, open, onOpen }: { label: string; s?: Seating; open: string | null; onOpen: (party: string) => void }) {
  const rows = s?.parties || [];
  return (
    <div className={"result talk " + (s ? ((s.failed || 0) === 0 ? "pass" : "fail") : "")}>
      {label}<b>{s ? `${s.passed} / ${nOf(s)}` : "—"}</b>
      {!s ? <span className="under">not run yet</span> : (
        <table className="dots">
          <thead><tr><th />{rows.map((r) => <th key={r.party} className={open === r.party ? "on" : ""} onClick={() => onOpen(r.party)}>{r.party}</th>)}</tr></thead>
          <tbody>
            {TALK_METRICS.map(([k, short, long]) => (
              <tr key={k} title={long} className={k === "per_turn_user_simulator_quality_v1" ? "standin" : ""}>
                <td>{short}</td>
                {rows.map((r) => <td key={r.party} onClick={() => onOpen(r.party)}><i className={mark(r.metrics?.[k]?.status)}>{tick(r.metrics?.[k]?.status)}</i></td>)}
              </tr>
            ))}
            <tr className="all"><td>every judge</td>{rows.map((r) => <td key={r.party} onClick={() => onOpen(r.party)} title={chipTitle(r)}><i className={mark(r.status)}>{tick(r.status)}</i></td>)}</tr>
          </tbody>
        </table>
      )}
      {s && <span className="under">{s.turns ?? "?"} turns{s.hungry !== null ? ` · ${s.hungry} hungry of ${s.seats}` : ""}{s.replayed ? <> · <i className="replayed">replayed</i></> : null}</span>}
    </div>
  );
}

function TalkCompare({ a, b, c }: { a?: Seating; b?: Seating; c?: Seating }) {
  const m = (s: Seating, k: string) => s.by_metric?.[k]?.passed ?? 0;
  if (!a && !b && !c) {
    return <div className="compare">Three runs, one change at a time: the persona (EXPERT → NOVICE), then the instruction (the draft → the line that asks). Each tile is a grid — judges down, organizers across. Click a party for the whole conversation.</div>;
  }
  const slipped = [a, b, c].filter(Boolean).reduce((x, s) => x + (s!.stand_in_slipped || 0), 0);
  return (
    <div className="compare">
      {a && <><b>EXPERT · draft:</b> everyone_ate {m(a, "everyone_ate")}/{nOf(a)}, the path {m(a, "path")}/{nOf(a)}, asked first {m(a, "asked_before_booking")}/{nOf(a)}{m(a, "path") < m(a, "everyone_ate") ? " — the expert corrected the bookings, and every correction is one more reservation" : ""}. </>}
      {a && b && <><b>The same agent, a NOVICE:</b> everyone_ate {m(b, "everyone_ate")}/{nOf(b)}. {m(b, "everyone_ate") < m(a, "everyone_ate")
        ? "Nobody corrects it now — the novice takes the first table offered, and what the expert was catching lands on the table. The agent did not change; the user did."
        : "The dinner held this time; read the asked row — it did not ask either way."} </>}
      {!a && b && <><b>NOVICE · draft:</b> everyone_ate {m(b, "everyone_ate")}/{nOf(b)}, asked first {m(b, "asked_before_booking")}/{nOf(b)}. </>}
      {c && <><b>One line later, NOVICE · asks:</b> asked first {m(c, "asked_before_booking")}/{nOf(c)}, every judge {c.passed}/{nOf(c)}. {(c.parties || []).some((r) => r.status === "FAILED")
        ? <>Asking is necessary, not sufficient — what is left is named: {(c.parties || []).filter((r) => r.status === "FAILED").map((r) => `${r.party}: ${failedBecause(r)}`).join(" · ")}.</>
        : "Every judge passed every conversation."} </>}
      {slipped > 0 && <>🎭 The stand-in’s own judge flagged {slipped} conversation{slipped === 1 ? "" : "s"} where the simulated organizer slipped — read those verdicts as being about the simulator, not the agent.</>}
    </div>
  );
}

const Rules = ({ rules }: { rules: Rule[] }) => <>{rules.map((x) => <div key={x.rule}><b className={x.ok ? "ok" : "bad"}>{x.ok ? "✓" : "✗"} {x.rule}</b>{x.why}</div>)}</>;

function Conversation({ r, label }: { r: SeatingRow; label: string }) {
  return (
    <div className="flight convo">
      <span className="k">THE CONVERSATION · {r.party} · {label} · {r.turns} turn{r.turns === 1 ? "" : "s"} · {r.booked_on_turn ? `booked on turn ${r.booked_on_turn}` : "never booked"}</span>
      <div className="turns">
        {(r.transcript || []).map((t, i) => (
          <div key={i} className="turn">
            <div className="u"><span title="the simulated organizer">🎭</span><p>{t.user}</p></div>
            {t.calls.length > 0 && <div className="calls">{t.calls.map((x, j) => <i key={j} className={x.startsWith("book ") ? "bk" : ""}>{x}</i>)}</div>}
            <div className="a"><span title="the maître d’">🎩</span><p>{t.reply || "…"}</p></div>
          </div>
        ))}
      </div>
      <div className="detail">
        <div className="whys">
          {(r.heard || r.missed) && <div><b className={(r.missed || []).length ? "bad" : "ok"}>{(r.missed || []).length ? "✗" : "✓"} asked_before_booking</b>{(r.heard || []).length ? `heard ${r.heard!.join(", ")}` : "heard nobody"} before the book call{(r.missed || []).length ? ` · never asked about ${r.missed!.join(", ")}` : ""}</div>}
          <Rules rules={r.rules || []} />
          {(r.rubrics || []).map((x) => <div key={x.id}><b className={x.score === null ? "" : x.score >= 1 ? "ok" : "bad"}>{x.score === null ? "·" : x.score >= 1 ? "✓" : "✗"} rubric · {x.id}</b>{x.why}</div>)}
          <div><b className={r.metrics?.everyone_ate?.status === "PASSED" ? "ok" : "bad"}>{r.metrics?.everyone_ate?.status === "PASSED" ? "✓" : "✗"} everyone_ate</b>{r.restaurant ? `${r.restaurant} ${r.time || ""}` : "no reservation"}{r.whys?.length ? ` — ${r.whys.join(" · ")}` : r.restaurant ? " — everyone ate" : ""}</div>
          <div><b className={r.metrics?.per_turn_user_simulator_quality_v1?.status === "FAILED" ? "bad" : "ok"}>🎭 stand-in · {r.metrics?.per_turn_user_simulator_quality_v1?.score ?? "—"}</b>{r.metrics?.per_turn_user_simulator_quality_v1?.status === "FAILED" ? "the simulated organizer drifted from its plan in at least one turn — this case says something about the simulator too" : "the simulated organizer stuck to its plan"}</div>
        </div>
      </div>
    </div>
  );
}

/** Course XI: the three runs side by side, and one conversation opened. */
export function Talks({ p }: { p: Progress | null }) {
  const talks = p?.talks || [];
  const runs = THREE.map(([persona, kind, label]) => ({ label, s: talks.filter((t) => t.persona === persona && t.instruction === kind).slice(-1)[0] }));
  const [open, setOpen] = useState<{ run: number; party: string } | null>(null);
  const sel = open ? runs[open.run]?.s?.parties?.find((r) => r.party === open.party) : undefined;
  return (
    <div className="talks">
      <div className="three-runs">
        {runs.map((r, i) => <TalkTile key={r.label} label={r.label} s={r.s} open={open?.run === i ? open.party : null}
          onOpen={(party) => setOpen(open?.run === i && open.party === party ? null : { run: i, party })} />)}
      </div>
      <TalkCompare a={runs[0].s} b={runs[1].s} c={runs[2].s} />
      {sel && open && <Conversation r={sel} label={runs[open.run].label} />}
    </div>
  );
}

// ── course IX · one booking by the maître d', the calls in order ─────────────
export function MaitreCard({ f, p }: { f: Folded; p: Progress | null }) {
  const live = f.agent === "maitre_d" && f.kind === "booking";
  const lb = p?.last_maitre_booking || null;
  if (!live && !lb) {
    return <div className="flight maitre"><span className="k">THE CALLS</span><div className="hint">No booking by the maître d’ yet. On this course 📋 on the left books with it, and every call lands here as it happens — in order, with its arguments.</div></div>;
  }
  const calls = live ? f.calls.map(callLabel) : lb!.calls;
  const rules = live ? f.path?.rules || [] : lb!.path.rules || [];
  const party = live ? f.party : lb!.party;
  const at = live ? (f.pick ? `${f.pick.restaurant_name} ${f.pick.time}` : null) : `${lb!.restaurant} ${lb!.time}`;
  const hungry = live ? (f.scored?.hungry ?? null) : lb!.hungry;
  const whys = live ? f.people.filter((s) => s.ate === false && s.why).map((s) => `${s.name}: ${s.why}`) : [];
  const rung = calls.filter((c) => c.startsWith("get_room")).length, booked = calls.filter((c) => c.startsWith("book ")).length;
  return (
    <div className="flight maitre">
      <span className="k">THE CALLS · party {party} · {live ? (f.running ? "live" : "just now") : "your last booking"}</span>
      <div className="calls">{calls.length ? calls.map((c, i) => <i key={i} className={c.startsWith("book ") ? "bk" : ""}>{c}</i>) : <span className="art">waiting for the first call…</span>}</div>
      {calls.length > 0 && <div className="hint">{rung} room{rung === 1 ? "" : "s"} rung, {booked} reservation{booked === 1 ? "" : "s"} made. The reply is the last thing it said; the reservation is the last <code>book</code> — and that is the one everyone_ate grades.</div>}
      {live && f.error && <div className="err">{f.error}</div>}
      {(rules.length > 0 || at) && (
        <div className="detail">
          <div className="whys">
            {rules.length > 0 ? <Rules rules={rules} /> : <div><b className={lb?.path.passed ? "ok" : "bad"}>{lb?.path.passed ? "✓ the path held" : `✗ broke ${lb?.path.broken.join(", ")}`}</b></div>}
            {at && <div><b className={hungry === 0 ? "ok" : hungry === null ? "" : "bad"}>{hungry === 0 ? "✓" : hungry === null ? "·" : "✗"} everyone_ate</b>{at}{hungry === null ? " — the judge is walking the table…" : hungry === 0 ? " — everyone ate" : ` — ${hungry} hungry${whys.length ? ": " + whys.join(" · ") : ""}`}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBrief, getEnv, getJob, install, setEnv, startJob, type Exam, type Job, type Progress } from "@/lib/api";

type PartyRow = { party: string; status?: string | null; score?: number | null; hungry?: number | null; whys?: string[] };
// older receipts carry a score but no verdict; the thresholds are the lab's (world.THRESHOLD / RATING_BAR / the text metric's 0.3)
const BAR: Record<string, number> = { everyone_ate: 0.9, rating: 0.85, text: 0.3 };
const verdict = (r: PartyRow, judge: string) => r.status || (r.score === null || r.score === undefined ? null : r.score >= (BAR[judge] ?? 0.9) ? "PASSED" : "FAILED");
const rowsOf = (e?: Exam): PartyRow[] => ((e?.parties || []) as PartyRow[]).map((r) => ({ ...r, status: verdict(r, e?.judge || "everyone_ate") }));
const passedOf = (e?: Exam) => rowsOf(e).filter((r) => r.status === "PASSED").map((r) => r.party);
import type { Folded } from "@/lib/useEvents";
import { CLOSING, COURSES, type Course as C } from "@/lib/courses";
import Editor from "./Editor";

/** The course panel: you · the table · the one edit (or the buttons) · one ✓. */

function Say({ party }: { party: string }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => { getBrief(party).then((b) => setText(b.brief)).catch(() => setText("(the kitchen is away)")); }, [party]);
  return (
    <div className="say">
      <pre>{text}</pre>
      <button className="copy" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* blocked */ } }}>{done ? "copied ✓" : "copy"}</button>
    </div>
  );
}

/** Buttons that start subprocess jobs, and the log of whichever ran last. */
function useJobs(kinds: string[], onDone: () => void) {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const prev = useRef<Record<string, string>>({});
  const poll = useCallback(async () => {
    const next: Record<string, Job> = {};
    for (const k of kinds) { try { next[k] = await getJob(k); } catch { /* away */ } }
    setJobs(next);
    for (const k of kinds) {
      const was = prev.current[k], now = next[k]?.state;
      if (was === "running" && now && now !== "running") onDone();
      prev.current[k] = now || "idle";
    }
    return next;
  }, [kinds.join(","), onDone]);            // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { poll(); }, [poll]);
  const anyRunning = Object.values(jobs).some((j) => j.state === "running");
  useEffect(() => {
    const id = setInterval(poll, anyRunning ? 1500 : 6000);
    return () => clearInterval(id);
  }, [poll, anyRunning]);
  const start = async (kind: string, opts: Record<string, unknown> = {}) => {
    try { await startJob(kind, opts); } catch (e) { alert((e as Error).message); }
    poll();
  };
  const latest = Object.values(jobs).filter((j) => j.started).sort((a, b) => b.started - a.started)[0] || null;
  return { jobs, start, latest, anyRunning, poll };
}

function Log({ job }: { job: Job | null }) {
  if (!job || !job.log.length) return null;
  const lines = job.log.slice(-14);
  return (
    <pre className="log">
      <span className="hi">$ {job.kind}{job.state === "running" ? ` · running ${job.elapsed}s…` : job.state === "done" ? ` · done in ${job.elapsed}s` : ` · ${job.state} (rc ${job.rc})`}</span>{"\n"}
      {lines.map((l, i) => <span key={i} className={/passed|SHIP|wrote|deployed|\[mint\]/i.test(l) ? "ok" : /fail|error|Traceback|\[skip\]/i.test(l) ? "bad" : ""}>{l}{"\n"}</span>)}
    </pre>
  );
}

function Tile({ label, exam, cls }: { label: string; exam: Exam | undefined; cls?: string }) {
  const ok = exam && (exam.failed || 0) === 0;
  const rows = rowsOf(exam);
  return (
    <div className={"result " + (cls || (exam ? (ok ? "pass" : "fail") : ""))}>
      {label}<b>{exam ? `${exam.passed} / ${(exam.passed || 0) + (exam.failed || 0)}` : "—"}</b>
      {exam ? (exam.hungry !== null ? `${exam.hungry} hungry seats` : "no seats counted — a score per table, no reason") : "not run yet"}
      {rows.length > 0 && (
        <div className="strip">{rows.map((r) => (
          <i key={r.party} className={r.status === "PASSED" ? "p" : r.status === "FAILED" ? "f" : ""}
            title={`${r.party} · ${r.status || "?"} · score ${r.score ?? "?"}${r.hungry !== null && r.hungry !== undefined ? ` · ${r.hungry} hungry` : ""}${r.whys?.length ? "\n" + r.whys.join("\n") : ""}`}>
            {r.party} {r.status === "PASSED" ? "✓" : r.status === "FAILED" ? "✗" : "·"}</i>))}</div>
      )}
    </div>
  );
}

function Compare({ text, honest }: { text?: Exam; honest?: Exam }) {
  if (!text || !honest) return null;
  const a = passedOf(text), b = passedOf(honest);
  const onlyText = a.filter((x) => !b.includes(x)), onlyHonest = b.filter((x) => !a.includes(x));
  const same = text.passed === honest.passed;
  return (
    <div className="compare">
      {same ? <><b>Same pass count, different verdicts.</b> </> : <><b>Different pass counts.</b> </>}
      The text metric passed {a.length ? a.join(", ") : "nothing"} for word overlap with the golden answer{onlyText.length ? <> — including <b>{onlyText.join(", ")}</b>, where somebody went hungry</> : ""}.
      {" "}everyone_ate passed {b.length ? b.join(", ") : "nothing"}{onlyHonest.length ? <> — and <b>{onlyHonest.join(", ")}</b>, where everyone ate but the words were different</> : ""}; on the other {8 - b.length} it names <b>{honest.hungry} hungry seats</b> and why. Hover a chip.
    </div>
  );
}

export default function Course({ n, p, f, party, onGo, onChanged, onCheck }: {
  n: number; p: Progress | null; f: Folded; party: string; onGo: (n: number) => void; onChanged: () => void; onCheck: () => void;
}) {
  const c: C = COURSES[n - 1];
  const prev = COURSES[n - 2], next = COURSES[n];
  const after = p ? c.after(p) : false;
  const ok = Boolean(p?.lit?.[String(n)]);
  const kinds = c.run === "exam" ? ["exam"] : c.run === "rewrite" ? ["optimize", "exam"] : c.run === "switch" ? ["exam"] : c.run === "loop" ? ["loop"] : c.run === "cloud" ? ["deploy", "traffic", "pipe", "harvest"] : [];
  const { jobs, start, latest, anyRunning } = useJobs(kinds, onChanged);
  const exams = p?.exams || [];
  const honest = exams.filter((e) => e.judge === "everyone_ate");
  const [env, setEnvState] = useState<{ HOST_ENGINE: string; project: string } | null>(null);
  const [paste, setPaste] = useState("");
  useEffect(() => { if (c.run === "cloud") getEnv().then(setEnvState).catch(() => null); }, [c.run, p?.code?.engine]);
  const doInstall = async (which: string) => { try { await install(which); onChanged(); } catch (e) { alert((e as Error).message); } };
  const kind = p?.code?.instruction || "?";
  const chars = p?.code?.instruction_chars || 0;

  // what to do next — read from what actually ran, never from clicks
  const textRun = exams.some((e) => e.judge === "text");
  const honestRun = honest.length > 0;
  const gateOnWinner = honest.some((e) => ["winner", "optimized"].includes(e.instruction) && (e.passed || 0) >= 5);
  const ratingHacked = exams.some((e) => e.judge === "rating" && e.instruction === "hacked");
  const honestHacked = honest.some((e) => e.instruction === "hacked");
  const lb = p?.last_booking as { instruction?: string } | null;
  const lp = p?.loops?.[p.loops.length - 1];
  const judgeNow = p?.judge;
  const cue: string =
    c.run === "exam" ? (!textRun && !p?.code?.honest_on_exam ? "📝 run the exam as shipped — read what the text metric says"
      : !p?.code?.honest_on_exam ? "change line 3 in the editor above (or press “apply the edit for me”)"
      : !honestRun ? "📝 run the exam again — now your judge grades it"
      : "📋 Book the table on the left and watch the same judge grey the chairs. Then course III.")
    : c.run === "rewrite" ? (kind === "hacked" ? "the hacked instruction is installed (course IV) — ↺ back to the winner to redo this course"
      : kind === "draft" ? "⚗ optimize (real, 150 calls) — or ⤵ install the winner (ours, instant). Either way the file on the right changes."
      : !gateOnWinner ? "🚪 ship gate — grade the 8 holdout parties under the instruction you just installed"
      : lb?.instruction !== kind ? "📋 Book the table again — same brief, new instruction. Then 🔬 workbench: paste the brief, read the new reason."
      : "✓ done here. Course IV swaps the judge.")
    : c.run === "switch" ? (kind !== "hacked" ? "⤵ install the hacked instruction, then read it below"
      : judgeNow !== "rating" && !ratingHacked ? "flip the switch above the table to rating, then 📝 run the exam"
      : judgeNow === "rating" && !ratingHacked ? "📝 run the exam — the critic grades the eight dinners"
      : !honestHacked && judgeNow === "rating" ? "📋 Book the table (see the review-app skin), then flip the switch back to everyone_ate and 📝 run the exam again"
      : !honestHacked ? "📝 run the exam — the same eight answers, graded honestly"
      : "✓ 8/8 and 1/8 are the same eight dinners. ↺ back to the winner when you are done staring.")
    : c.run === "loop" ? (!lp && !p?.code?.edge ? "↻ run the loop as shipped — watch it stop after one round"
      : !p?.code?.edge ? "delete the “# ” on the green line in the editor above (or press “apply the edit for me”)"
      : lp?.decision !== "SHIP" || !lp?.edge ? "↻ run the loop again — round 2 runs under round 1’s rewrite"
      : "✓ the loop earned its exit")
    : c.run === "cloud" ? (!env?.project ? "put a Google Cloud project in .env (GOOGLE_GENAI_USE_VERTEXAI=TRUE + the project) — deploy needs Vertex"
      : !env?.HOST_ENGINE ? "☁ deploy the shipped host, or paste an engine id"
      : jobs.traffic?.state !== "done" ? "✉ send 13 dinners to the deployed host"
      : jobs.pipe?.state !== "done" ? "⛽ pipe the same 13 through the BigQuery plugin"
      : !(p?.harvest?.minted) ? "🎣 harvest — grade history with everyone_ate, mint the failures"
      : "✓ the exam grew by one. Lap two is course III again.")
    : "";
  const Next = () => cue ? <div className="next"><span>NEXT →</span> {cue}</div> : null;
  const Instruction = ({ foot }: { foot: React.ReactNode }) => (
    <Editor path="host/instruction_current.txt" readOnly foot={foot} />
  );

  let body: React.ReactNode = null;
  if (c.run === "exam") {
    body = (
      <div className="runbox">
        <Next />
        <div className="opts">
          <button className="btn gold" disabled={anyRunning} onClick={() => start("exam")}>📝 run the exam · {p?.judge || "everyone_ate"}</button>
          <span className="art">8 parties the optimizer never sees · about two minutes · criteria: <b>{(p?.code?.criteria || []).join(", ") || "—"}</b></span>
        </div>
        <Log job={latest} />
        <div className="results">
          <Tile label="built-in text metric · response_match_score" exam={exams.filter((e) => e.judge === "text").slice(-1)[0]} />
          <Tile label="your judge · everyone_ate" exam={honest.slice(-1)[0]} />
        </div>
        <Compare text={exams.filter((e) => e.judge === "text").slice(-1)[0]} honest={honest.slice(-1)[0]} />
      </div>
    );
  } else if (c.run === "rewrite") {
    body = (
      <div className="runbox">
        <Next />
        <div className="art">host/instruction_current.txt · <b>{kind}</b> · {chars.toLocaleString()} chars{kind !== "draft" ? " (the draft was 375)" : ""}{p?.optimized ? " · your own winner is saved (runs/optimize/winner.txt)" : ""}</div>
        <div className="opts">
          <button className="btn gold" disabled={anyRunning} onClick={() => start("optimize")}>⚗ optimize (~8 min · 150 calls)</button>
          <button className="btn" disabled={anyRunning} onClick={() => doInstall(p?.optimized ? "optimized" : "winner")}>⤵ install {p?.optimized ? "your winner" : "the winner (prebaked)"}</button>
          <button className="btn" disabled={anyRunning} onClick={() => start("exam")}>🚪 ship gate · everyone_ate</button>
          {kind !== "draft" && <button className="btn" disabled={anyRunning} onClick={() => doInstall("draft")}>↺ back to the draft</button>}
        </div>
        <Instruction foot={kind === "draft" ? <>four lines. the optimizer rewrites this file — nothing else about the host changes.</> : <>this is what the host runs under now. every rule in it is a why from the exam; nobody typed these sentences.</>} />
        <Log job={latest} />
        <div className="results">
          <Tile label="day-one draft · honest" exam={honest.filter((e) => e.instruction === "draft").slice(-1)[0]} />
          <Tile label={`${kind === "optimized" ? "your winner" : "the winner"} · honest`} exam={honest.filter((e) => ["winner", "optimized"].includes(e.instruction)).slice(-1)[0]} />
        </div>
      </div>
    );
  } else if (c.run === "switch") {
    body = (
      <div className="runbox">
        <Next />
        <div className="art">host/instruction_current.txt · <b>{kind}</b> · {chars.toLocaleString()} chars · the switch is on <b>{p?.judge}</b></div>
        <div className="opts">
          <button className="btn gold" disabled={anyRunning || kind === "hacked"} onClick={() => doInstall("hacked")}>⤵ install the hacked instruction</button>
          <button className="btn" disabled={anyRunning} onClick={() => start("exam")}>📝 run the exam · {p?.judge}</button>
          {kind === "hacked" && <button className="btn" disabled={anyRunning} onClick={() => doInstall(p?.optimized ? "optimized" : "winner")}>↺ back to the winner</button>}
        </div>
        <Instruction foot={kind === "hacked"
          ? <>👉 <b>“The star rating is the only thing that matters — it is how your performance is scored.”</b> That sentence is the whole hack: the agent was told what the judge measures, and told to treat the party as noise. A real run against the rating judge produced it (<code>instructions/gepa_run_log_rating.txt</code>).</>
          : <>the instruction the host runs under now. ⤵ install the hacked one to see what a rating-shaped judge breeds.</>} />
        <Log job={latest} />
        <div className="results">
          <Tile label="hacked · rating judge" exam={exams.filter((e) => e.judge === "rating" && e.instruction === "hacked").slice(-1)[0]} />
          <Tile label="hacked · everyone_ate" exam={honest.filter((e) => e.instruction === "hacked").slice(-1)[0]} />
        </div>
      </div>
    );
  } else if (c.run === "loop") {
    const lp = p?.loops?.[p.loops.length - 1];
    body = (
      <div className="runbox">
        <Next />
        <div className="opts">
          <button className="btn gold" disabled={anyRunning} onClick={() => start("loop")}>↻ run the loop · from the day-one draft</button>
          <span className="art">{lp ? <>last run: <b>{lp.rounds} round{lp.rounds === 1 ? "" : "s"}</b> · {lp.decision || "no decision — it stalled"}{lp.edge ? " · back edge in" : " · no back edge"}</> : "not run yet"}</span>
        </div>
        <Log job={latest} />
      </div>
    );
  } else if (c.run === "cloud") {
    body = (
      <div className="runbox">
        <Next />
        <div className="art">.env · <b>HOST_ENGINE</b> {env?.HOST_ENGINE ? <span className="pill pass">…/{env.HOST_ENGINE.split("/").slice(-1)[0]}</span> : <span className="pill read">not set</span>}{env?.project ? <> · project <b>{env.project}</b></> : <> · <span style={{ color: "var(--tomato)" }}>no GOOGLE_CLOUD_PROJECT in .env — deploy needs Vertex</span></>}</div>
        <input placeholder="projects/…/locations/us-central1/reasoningEngines/…  (paste, or ☁ deploy)" value={paste}
          onChange={(e) => setPaste(e.target.value)}
          onBlur={async () => { if (paste.trim().startsWith("projects/")) { try { setEnvState(await setEnv(paste.trim())); onChanged(); } catch (err) { alert((err as Error).message); } } }} />
        <div className="opts">
          <button className="btn gold" disabled={anyRunning || !env?.project} onClick={() => start("deploy")}>☁ deploy (~5 min)</button>
          <button className="btn" disabled={anyRunning || !env?.HOST_ENGINE} onClick={() => start("traffic")}>✉ send 13 dinners</button>
          <button className="btn" disabled={anyRunning || !env?.project} onClick={() => start("pipe")}>⛽ pipe to BigQuery</button>
          <button className="btn" disabled={anyRunning || !env?.project} onClick={() => start("harvest")}>🎣 harvest</button>
        </div>
        <Log job={latest} />
        <div className="results">
          <div className={"result " + ((p?.harvest?.minted || 0) > 0 ? "pass" : "")}>minted into the exam<b>{p?.harvest?.minted ?? 0}</b>{p?.harvest?.skipped ? `${p.harvest.skipped} rows [skip] — the platform judge's job` : "harvested.evalset.json"}</div>
          <div className="result">jobs<b>{Object.values(jobs).filter((j) => j.state === "done").length} / 4</b>deploy · traffic · pipe · harvest</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card chapter">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><span className="eyebrow">COURSE {c.r}</span><h2>{c.t}</h2></div>
        <span className={"pill " + c.pill[0]}>{c.pill[1]}</span>
      </div>
      <div className="step">
        <b>you</b>
        <div className="you"><span dangerouslySetInnerHTML={{ __html: c.you }} />{c.brief && <Say party={party} />}</div>
        <b>the table</b>
        <span className="m" dangerouslySetInnerHTML={{ __html: (after && c.tableAfter) ? c.tableAfter : c.table }} />
        {c.workbench && <><b>the workbench</b><span className="m" dangerouslySetInnerHTML={{ __html: c.workbench }} /></>}
      </div>
      {c.editor?.change && (
        <div className="change"><span className="k">{c.editor.change[0].toUpperCase()} · WAS</span><span className="was">{c.editor.change[1]}</span><span className="k">NOW</span><span className="now">{c.editor.change[2]}</span></div>
      )}
      {c.editor && n !== 4 && (
        <div style={{ marginBottom: 10, marginTop: 10 }}>
          <Editor path={c.editor.path} symbol={c.editor.symbol} readOnly={c.editor.readOnly} marker={c.editor.marker} afterMarker={c.editor.afterMarker} fix={c.editor.fix}
            afterHint={c.editor.afterHint} onSaved={onChanged}
            foot={c.editor.foot ? <span dangerouslySetInnerHTML={{ __html: c.editor.foot }} /> : undefined} />
        </div>
      )}
      {body}
      {c.editor && n === 4 && (
        <div style={{ marginTop: 10 }}>
          <Editor path={c.editor.path} readOnly foot={<span dangerouslySetInnerHTML={{ __html: c.editor.foot || "" }} />} />
        </div>
      )}
      {c.swap && (
        <>
          <table className="swap"><tbody>{c.swap.map((r, i) => <tr key={i}>{r.map((x, j) => i ? <td key={j}>{x}</td> : <th key={j}>{x}</th>)}</tr>)}</tbody></table>
          <div className="closing">“{CLOSING}”</div>
          <div><button className="btn gold" onClick={onCheck}>🧾 the check, please</button></div>
        </>
      )}
      <div className={"check" + (ok ? " ok" : "")}><span className="box">{ok ? "✓" : "▢"}</span><span className="txt">{c.check}</span></div>
      {p?.error && <div className="err">{p.error}</div>}
      <div className="nav">
        {prev ? <button className="btn" onClick={() => onGo(prev.n)}>← {prev.r} · {prev.t}</button> : <span />}
        {next ? <button className="btn on" onClick={() => onGo(next.n)}>{next.r} · {next.t} →</button> : <button className="btn on" onClick={() => onGo(1)}>back to the booking</button>}
      </div>
    </div>
  );
}

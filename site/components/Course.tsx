"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ORIGIN, getBrief, getJob, install, startJob, stopJob, type Exam, type Job, type Progress } from "@/lib/api";
import Flight from "./Flight";

type PartyRow = { party: string; status?: string | null; score?: number | null; hungry?: number | null; whys?: string[] };
// older receipts carry a score but no verdict; the thresholds are the lab's (world.THRESHOLD / RATING_BAR / the text metric's 0.3)
const BAR: Record<string, number> = { everyone_ate: 0.9, rating: 0.85, text: 0.3 };
const verdict = (r: PartyRow, judge: string) => r.status || (r.score === null || r.score === undefined ? null : r.score >= (BAR[judge] ?? 0.9) ? "PASSED" : "FAILED");
const rowsOf = (e?: Exam): PartyRow[] => ((e?.parties || []) as PartyRow[]).map((r) => ({ ...r, status: verdict(r, e?.judge || "everyone_ate") }));
const passedOf = (e?: Exam) => rowsOf(e).filter((r) => r.status === "PASSED").map((r) => r.party);
import type { Folded } from "@/lib/useEvents";
import { CLOSING, COURSES, sourceUrl, type Course as C } from "@/lib/courses";
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

function Log({ job, onStopped }: { job: Job | null; onStopped?: () => void }) {
  if (!job || !job.log.length) return null;
  const lines = job.log.slice(-14);
  const quota = job.state === "running" && job.log.slice(-30).some((l) => /429|RESOURCE_EXHAUSTED/.test(l));
  return (
    <>
      <pre className="log">
        <span className="hi">$ {job.kind}{job.state === "running" ? ` · running ${job.elapsed}s…` : job.state === "done" ? ` · done in ${job.elapsed}s` : job.rc === -15 ? " · stopped" : ` · ${job.state} (rc ${job.rc})`}</span>
{"\n"}
        {lines.map((l, i) => <span key={i} className={/passed|SHIP|wrote|deployed|\[mint\]/i.test(l) ? "ok" : /fail|error|Traceback|\[skip\]/i.test(l) ? "bad" : /429|RESOURCE_EXHAUSTED/.test(l) ? "warn" : ""}>{l}{"\n"}</span>)}
      </pre>
      {quota && <div className="quota">⏳ <b>429 RESOURCE_EXHAUSTED</b> is Vertex AI’s per-minute quota, which is small on a brand-new project. Nothing is broken: the run keeps retrying with back-off and usually finishes in a minute or two. If you would rather not wait, press the red <b>■ stop</b> button above and run it again in a minute — a stopped run leaves no receipt, so nothing lights by mistake.</div>}
    </>
  );
}

function Tile({ label, exam, cls }: { label: string; exam: Exam | undefined; cls?: string }) {
  const ok = exam && (exam.failed || 0) === 0;
  const rows = rowsOf(exam);
  return (
    <div className={"result " + (cls || (exam ? (ok ? "pass" : "fail") : ""))}>
      {label}<b>{exam ? `${exam.passed} / ${(exam.passed || 0) + (exam.failed || 0)}` : "—"}</b>
      {exam ? (exam.hungry !== null ? `${exam.hungry} hungry seats` : "no seats counted — a score per table, no reason") : "not run yet"}
      {exam?.instruction && <span className="under"> · under the <b style={{ display: "inline", fontSize: 11, fontFamily: "inherit" }}>{exam.instruction}</b> instruction</span>}
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
  if (!text.parties?.length) {
    return <div className="compare"><b>Two judges, two questions.</b> The text metric scored each table by word overlap with the golden booking — {text.passed} of 8 cleared 0.3, and it cannot say who ate. everyone_ate passed {b.length ? b.join(", ") : "nothing"} because everyone there ate, and on the other {8 - b.length} it names <b>{honest.hungry} hungry seats</b> and why. Hover a chip. (Run the text metric again to compare table by table.)</div>;
  }
  const onlyText = a.filter((x) => !b.includes(x)), onlyHonest = b.filter((x) => !a.includes(x)), both = a.filter((x) => b.includes(x));
  const sameSet = onlyText.length === 0 && onlyHonest.length === 0;
  return (
    <div className="compare">
      {sameSet ? <><b>Same tables, different reasons.</b> The text metric passed {both.length ? both.join(", ") : "nothing"} because the words overlapped the golden booking; everyone_ate passed the same {both.length} because everyone there ate — and on the other {8 - b.length} it names <b>{honest.hungry} hungry seats</b> and why. The count agrees by luck; only one of the two knows who went hungry.</>
        : <><b>{text.passed === honest.passed ? "Same pass count, different tables." : "Different verdicts."}</b> The text metric passed {a.length ? a.join(", ") : "nothing"} for word overlap with the golden booking{onlyText.length ? <> — including <b>{onlyText.join(", ")}</b>, where somebody went hungry</> : ""}. everyone_ate passed {b.length ? b.join(", ") : "nothing"}{onlyHonest.length ? <> — including <b>{onlyHonest.join(", ")}</b>, where everyone ate but the words were different</> : ""}; on the other {8 - b.length} it names <b>{honest.hungry} hungry seats</b> and why.</>}
      {" "}Hover a chip.
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
  const kinds = c.run === "compare" ? ["exam"] : c.run === "exam" ? ["exam"] : c.run === "rewrite" ? ["optimize", "exam"] : c.run === "switch" ? ["exam"] : c.run === "loop" ? ["loop"] : [];
  const { jobs, start, latest, anyRunning } = useJobs(kinds, onChanged);
  const exams = p?.exams || [];
  const honest = exams.filter((e) => e.judge === "everyone_ate");
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
  const flown = (p?.flights || []).length > 0;
  const cue: string =
    c.run === "compare" ? (!textRun ? "📝 run the exam as shipped — eight parties, graded by response_match_score, the only metric in criteria"
      : "✓ read the chips: passes and fails for word overlap, not for dinner. Course III puts your judge on the exam.")
    : c.run === "exam" ? (kind !== "draft" ? `the host is running the ${kind} instruction, not the day-one draft — ↺ back to the draft first, or the numbers here will not match the story`
      : !p?.code?.honest_on_exam ? "change line 3 in the editor above (or press “apply the edit for me”)"
      : !honestRun ? "📝 run the exam again — now your judge grades it"
      : !lb ? "📋 Book the table on the left and watch the same judge grey the chairs"
      : "✓ a failure names the seat and the why. Course IV puts three judges on one answer.")
    : c.run === "flight" ? (!flown ? "⚖ judge this answer three ways — the party on the left is the one you are grading (p1 is tonight’s)"
      : (p?.flights?.length || 0) < 2 ? "⚖ press it again — which of the three can change its mind?"
      : "✓ two judges that never move, one that can. Pick another party on the left if you like; then course V lets the agent rewrite itself.")
    : c.run === "rewrite" ? (kind === "hacked" ? "the hacked instruction is installed (course VI) — ↺ back to the winner to redo this course"
      : kind === "draft" ? "⚗ optimize (real, 150 calls) — or ⤵ install the winner (ours, instant). Either way the file on the right changes."
      : !gateOnWinner ? "🚪 ship gate — grade the 8 holdout parties under the instruction you just installed"
      : lb?.instruction !== kind ? "📋 Book the table again — same brief, new instruction. Then 🔬 workbench: paste the brief (the 📋 button is in the drawer), read the new reason."
      : "✓ done here. Course VI swaps the judge.")
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
    : "";
  // Plain JSX, not inline components: a component type defined inside render
  // is a new type every render, so React would unmount and remount the Editor
  // (and refetch the file) on every job poll — the page flickered while a
  // job ran. These are values, so React diffs them in place.
  const nextCue = cue ? <div className="next"><span>NEXT →</span> {cue}</div> : null;
  const running = Object.values(jobs).find((j) => j.state === "running");
  const stopBtn = running ? <button className="btn stopbig" onClick={async () => { try { await stopJob(running.kind); } catch { /* gone */ } onChanged(); }} title="terminate this run — nothing is lost; run it again when you like">■ stop the {running.kind}{running.elapsed ? ` · ${running.elapsed}s` : ""}</button> : null;
  const instruction = (foot: React.ReactNode) => <Editor path="host/instruction_current.txt" readOnly foot={foot} />;

  let body: React.ReactNode = null;
  if (c.run === "compare") {
    const textExam = exams.filter((e) => e.judge === "text").slice(-1)[0];
    const crit = p?.code?.criteria || [];
    body = (
      <div className="runbox">
        {nextCue}
        <div className="opts">
          <button className="btn gold" disabled={anyRunning} onClick={() => start("exam")}>📝 run the exam · as shipped</button>
          {stopBtn}
          <span className="art">8 parties · about a minute · <b>{crit.length} metric{crit.length === 1 ? "" : "s"} run{crit.length === 1 ? "s" : ""}: {crit.join(", ") || "—"}</b>{p?.code?.honest_on_exam ? " — you already made course III’s edit, so your judge grades it; the comparator’s run is kept below" : " · everyone_ate is declared, not on the exam"}</span>
        </div>
        <Log job={latest} onStopped={onChanged} />
        <div className="results">
          <Tile label="the comparator · response_match_score" exam={textExam} />
          <div className="result ways">
            <span className="k">THREE WAYS TO RUN THE SAME EXAM</span>
            <div className="way"><b>adk eval</b><span>the CLI — what 📝 just ran. A batch runner; the one you put in CI.</span></div>
            <div className="way"><b>adk web → Evals</b><span>the 🔬 workbench’s Evals tab: this run is in its 🕓 history — every case clickable, the conversation that was graded. <a className="src" href={`${ORIGIN}/workbench/dev-ui/?app=host`} target="_blank" rel="noreferrer">open the workbench ↗</a></span></div>
            <div className="way"><b>pytest</b><span>the same exam as a test that fails the build — <code>uv run pytest tests/test_host.py</code> in a terminal; it writes to the same history. Read the file; it is twelve lines.</span></div>
            <div className="art">one local eval store under <code>host/.adk/eval_history/</code>. A batch from CI fails; you open that exact run in the web UI to stare at it.</div>
          </div>
        </div>
      </div>
    );
  } else if (c.run === "exam") {
    body = (
      <div className="runbox">
        {nextCue}
        <div className="opts">
          <button className="btn gold" disabled={anyRunning} onClick={() => start("exam")}>📝 run the exam · {p?.judge || "everyone_ate"}</button>
          {stopBtn}
          {kind !== "draft" && <button className="btn" disabled={anyRunning} onClick={() => doInstall("draft")}>↺ back to the draft</button>}
          <span className="art">8 parties the optimizer never sees · about a minute · criteria: <b>{(p?.code?.criteria || []).join(", ") || "—"}</b> · the host runs the <b>{kind}</b> instruction</span>
        </div>
        <Log job={latest} onStopped={onChanged} />
        <div className="results">
          <Tile label="built-in text metric · response_match_score" exam={exams.filter((e) => e.judge === "text").slice(-1)[0]} />
          <Tile label="your judge · everyone_ate" exam={honest.slice(-1)[0]} />
        </div>
        <Compare text={exams.filter((e) => e.judge === "text").slice(-1)[0]} honest={honest.slice(-1)[0]} />
      </div>
    );
  } else if (c.run === "flight") {
    body = (
      <div className="runbox">
        {nextCue}
        <Flight p={p} party={party} onJudged={onChanged} />
      </div>
    );
  } else if (c.run === "rewrite") {
    body = (
      <div className="runbox">
        {nextCue}
        <div className="art">host/instruction_current.txt · <b>{kind}</b> · {chars.toLocaleString()} chars{kind !== "draft" ? " (the draft was 375)" : ""}{p?.optimized ? " · your own winner is saved (runs/optimize/winner.txt)" : ""}</div>
        <div className="opts">
          <button className="btn gold" disabled={anyRunning} onClick={() => start("optimize")}>⚗ optimize (~8 min · 150 calls)</button>
          {stopBtn}
          <button className="btn" disabled={anyRunning} onClick={() => doInstall(p?.optimized ? "optimized" : "winner")}>⤵ install {p?.optimized ? "your winner" : "the winner (prebaked)"}</button>
          <button className="btn" disabled={anyRunning} onClick={() => start("exam")}>🚪 ship gate · everyone_ate</button>
          {kind !== "draft" && <button className="btn" disabled={anyRunning} onClick={() => doInstall("draft")}>↺ back to the draft</button>}
        </div>
        {instruction(kind === "draft" ? <>four lines. the optimizer rewrites this file — nothing else about the host changes.</> : <>this is what the host runs under now. every rule in it is a why from the exam; nobody typed these sentences.</>)}
        <Log job={latest} onStopped={onChanged} />
        <div className="results">
          <Tile label="day-one draft · honest" exam={honest.filter((e) => e.instruction === "draft").slice(-1)[0]} />
          <Tile label={`${kind === "optimized" ? "your winner" : "the winner"} · honest`} exam={honest.filter((e) => ["winner", "optimized"].includes(e.instruction)).slice(-1)[0]} />
        </div>
      </div>
    );
  } else if (c.run === "switch") {
    body = (
      <div className="runbox">
        {nextCue}
        <div className="art">host/instruction_current.txt · <b>{kind}</b> · {chars.toLocaleString()} chars · the switch is on <b>{p?.judge}</b></div>
        <div className="opts">
          <button className="btn gold" disabled={anyRunning || kind === "hacked"} onClick={() => doInstall("hacked")}>⤵ install the hacked instruction</button>
          <button className="btn" disabled={anyRunning} onClick={() => start("exam")}>📝 run the exam · {p?.judge}</button>
          {stopBtn}
          {kind === "hacked" && <button className="btn" disabled={anyRunning} onClick={() => doInstall(p?.optimized ? "optimized" : "winner")}>↺ back to the winner</button>}
        </div>
        {instruction(kind === "hacked"
          ? <>👉 <b>“The star rating is the only thing that matters — it is how your performance is scored.”</b> That sentence is the whole hack: the agent was told what the judge measures, and told to treat the party as noise. A real run against the rating judge produced it (<code>instructions/gepa_run_log_rating.txt</code>).</>
          : <>the instruction the host runs under now. ⤵ install the hacked one to see what a rating-shaped judge breeds.</>)}
        <Log job={latest} onStopped={onChanged} />
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
        {nextCue}
        <div className="opts">
          <button className="btn gold" disabled={anyRunning} onClick={() => start("loop")}>↻ run the loop · from the day-one draft</button>
          {stopBtn}
          <span className="art">{lp ? <>last run: <b>{lp.rounds} round{lp.rounds === 1 ? "" : "s"}</b> · {lp.decision || "no decision — it stalled"}{lp.edge ? " · back edge in" : " · no back edge"}</> : "not run yet"}</span>
        </div>
        <Log job={latest} onStopped={onChanged} />
      </div>
    );
  }

  return (
    <div className="card chapter">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><span className="eyebrow">COURSE {c.r}</span><h2>{c.t}</h2></div>
        <span className={"pill " + c.pill[0]}>{c.pill[1]}</span>
      </div>
      {c.sources && (
        <div className="sources"><span className="k">SOURCE</span>
          {c.sources.map(([label, path]) => <a key={path + label} className="src" href={sourceUrl(path)} target="_blank" rel="noreferrer" title={`${path} · on GitHub`}>{label} ↗</a>)}
        </div>
      )}
      <div className="step">
        <b>you</b>
        <div className="you"><span dangerouslySetInnerHTML={{ __html: c.you }} />{c.brief && <Say party={party} />}</div>
        <b>the table</b>
        <span className="m" dangerouslySetInnerHTML={{ __html: (after && c.tableAfter) ? c.tableAfter : c.table }} />
      </div>
      {c.editor?.change && (
        <div className="change"><span className="k">{c.editor.change[0].toUpperCase()} · WAS</span><span className="was">{c.editor.change[1]}</span><span className="k">NOW</span><span className="now">{c.editor.change[2]}</span></div>
      )}
      {c.editor && c.key !== "other" && (
        <div style={{ marginBottom: 10, marginTop: 10 }}>
          <Editor path={c.editor.path} symbol={c.editor.symbol} readOnly={c.editor.readOnly} marker={c.editor.marker} afterMarker={c.editor.afterMarker} fix={c.editor.fix}
            afterHint={c.editor.afterHint} onSaved={onChanged}
            foot={c.editor.foot ? <span dangerouslySetInnerHTML={{ __html: c.editor.foot }} /> : undefined} />
        </div>
      )}
      {body}
      {c.editor && c.key === "other" && (
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

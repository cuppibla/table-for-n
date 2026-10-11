"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBrief, getEnv, getJob, install, setEnv, startJob, type Exam, type Job, type Progress } from "@/lib/api";
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
  return (
    <div className={"result " + (cls || (exam ? (ok ? "pass" : "fail") : ""))}>
      {label}<b>{exam ? `${exam.passed} / ${(exam.passed || 0) + (exam.failed || 0)}` : "—"}</b>
      {exam ? (exam.hungry !== null ? `${exam.hungry} hungry seats` : "no seats counted") : "not run yet"}
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

  let body: React.ReactNode = null;
  if (c.run === "exam") {
    body = (
      <div className="runbox">
        <div className="opts">
          <button className="btn gold" disabled={anyRunning} onClick={() => start("exam")}>📝 run the exam · {p?.judge || "everyone_ate"}</button>
          <span className="art">8 parties the optimizer never sees · about two minutes · criteria: <b>{(p?.code?.criteria || []).join(", ") || "—"}</b></span>
        </div>
        <Log job={latest} />
        <div className="results">
          <Tile label="built-in text metric" exam={exams.filter((e) => e.judge === "text").slice(-1)[0]} />
          <Tile label="everyone_ate" exam={honest.slice(-1)[0]} />
        </div>
      </div>
    );
  } else if (c.run === "rewrite") {
    body = (
      <div className="runbox">
        <div className="art">host/instruction_current.txt · <b>{kind}</b> · {chars.toLocaleString()} chars{p?.optimized ? " · your own winner is saved (runs/optimize/winner.txt)" : ""}</div>
        <div className="opts">
          <button className="btn gold" disabled={anyRunning} onClick={() => start("optimize")}>⚗ optimize (~8 min · 150 calls)</button>
          <button className="btn" disabled={anyRunning} onClick={() => doInstall(p?.optimized ? "optimized" : "winner")}>⤵ install {p?.optimized ? "your winner" : "the winner (prebaked)"}</button>
          <button className="btn" disabled={anyRunning} onClick={() => start("exam")}>🚪 ship gate · everyone_ate</button>
          {kind !== "draft" && <button className="btn" disabled={anyRunning} onClick={() => doInstall("draft")}>↺ back to the draft</button>}
        </div>
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
        <div className="art">host/instruction_current.txt · <b>{kind}</b> · {chars.toLocaleString()} chars · the switch is on <b>{p?.judge}</b></div>
        <div className="opts">
          <button className="btn gold" disabled={anyRunning || kind === "hacked"} onClick={() => doInstall("hacked")}>⤵ install the hacked instruction</button>
          <button className="btn" disabled={anyRunning} onClick={() => start("exam")}>📝 run the exam · {p?.judge}</button>
          {kind === "hacked" && <button className="btn" disabled={anyRunning} onClick={() => doInstall(p?.optimized ? "optimized" : "winner")}>↺ back to the winner</button>}
        </div>
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
      </div>
      {c.editor && n !== 4 && (
        <div style={{ marginBottom: 10 }}>
          <Editor path={c.editor.path} symbol={c.editor.symbol} readOnly={c.editor.readOnly} marker={c.editor.marker} fix={c.editor.fix}
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

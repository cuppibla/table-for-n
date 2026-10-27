"use client";
import { useState } from "react";
import { getReceipt, setDataset, type Progress, type Receipt as R, type ReceiptTurn } from "@/lib/api";

/** Course IX · 🧾 the receipt. One booking, read back out of BigQuery's
 *  v_eval_turn — the view the plugin builds. Guardrail chips the warehouse
 *  computed without a model, the instruction the host ran under, and the
 *  events of the turn. Nothing here grades; the harvest does. */

const Chip = ({ on, bad, label, title }: { on: boolean; bad?: boolean; label: string; title?: string }) => (
  <span className={"chip" + (on ? (bad ? " bad" : " ok") : " dim")} title={title}>{on ? (bad ? "✗" : "✓") : "·"} {label}</span>
);

function Turn({ t }: { t: ReceiptTurn }) {
  const [open, setOpen] = useState(false);
  const agent = Object.entries(t.trace.agents)[0];
  return (
    <div className="result turn">
      <div className="chips">
        <Chip on={t.eval_ready} label="eval_ready" title="the turn is whole: user text, a final answer, INVOCATION_COMPLETED" />
        <Chip on={true} bad={t.has_error} label={t.has_error ? `has_error · ${t.tool_error_count + t.llm_error_count + t.agent_error_count}` : "no errors"} />
        <Chip on={true} bad={t.has_tool_loop} label={t.has_tool_loop ? "tool loop" : "no tool loop"} />
        <Chip on={true} bad={t.has_truncated_content} label={t.has_truncated_content ? "truncated" : "nothing truncated"} />
        <span className="chip dim">{(t.turn_latency_ms / 1000).toFixed(1)}s</span>
        <span className="chip dim">{t.total_tokens?.toLocaleString()} tokens</span>
        <span className="chip dim">{t.trace_bytes.toLocaleString()} B of trace</span>
      </div>
      {agent && (
        <div className="art" style={{ marginTop: 6 }}>
          <b>trace.agents.{agent[0]}.instruction</b> · {agent[1].instruction.length.toLocaleString()} chars — the instruction this booking ran under, inside the row:
          <pre className="log" style={{ marginTop: 4, maxHeight: 96, overflow: "auto" }}>{agent[1].instruction.slice(0, 600)}{agent[1].instruction.length > 600 ? "\n…" : ""}</pre>
        </div>
      )}
      <button className="btn" style={{ marginTop: 6 }} onClick={() => setOpen(!open)}>{open ? "hide" : "show"} the {t.trace.events.length} events of the turn</button>
      {open && (
        <pre className="log" style={{ marginTop: 6, maxHeight: 260, overflow: "auto" }}>
          {t.trace.events.map((e, i) => <span key={i} className={e.author === "user" ? "hi" : e.kind !== "text" ? "warn" : ""}>{`${e.author.padEnd(6)} ${e.kind.padEnd(17)} ${e.text.replace(/\s+/g, " ")}\n`}</span>)}
        </pre>
      )}
      <div className="art" style={{ marginTop: 6 }}>session {t.session_id.slice(0, 8)}… · invocation {t.invocation_id.slice(0, 8)}… · user <b>{t.user_id}</b> · {t.turn_start?.replace("T", " ").slice(0, 19)}</div>
    </div>
  );
}

export default function Receipt({ p, onChanged, disabled }: { p: Progress | null; onChanged: () => void; disabled?: boolean }) {
  const [r, setR] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);
  const [ds, setDs] = useState("");
  const dataset = p?.code?.dataset || "";
  const lb = p?.last_booking as { session?: string; party?: string; recorded?: boolean } | null;

  const fetch_ = async () => {
    setBusy(true);
    try { setR(await getReceipt(lb?.session, 20)); onChanged(); } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  };
  const save = async () => {
    try { await setDataset(ds.trim()); onChanged(); } catch (e) { alert((e as Error).message); }
  };

  if (!dataset) {
    return (
      <div className="result ways">
        <span className="k">STEP 0 · A DATASET IN .ENV</span>
        <div className="art">The plugin writes to a BigQuery dataset in <b>{p?.code?.project || "your project"}</b>. It makes the table and the views itself; the dataset you make once:</div>
        <pre className="log">bq mk -d --location=US {p?.code?.project ? `${p.code.project}:` : ""}table_for_n</pre>
        <div className="opts">
          <input className="inp" placeholder="table_for_n" value={ds} onChange={(e) => setDs(e.target.value)} style={{ fontFamily: "ui-monospace, monospace", padding: "6px 8px", minWidth: 220 }} />
          <button className="btn gold" disabled={!ds.trim()} onClick={save}>write BQ_ANALYTICS_DATASET to .env</button>
          <span className="art">no project? this course is a read — the codelab carries the rows from our night.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="result ways">
      <span className="k">🧾 THE ROW · {p?.code?.project}.{dataset}.v_eval_turn</span>
      <div className="opts">
        <button className="btn gold" disabled={disabled || busy || !lb?.session} onClick={fetch_}>{busy ? "asking BigQuery…" : "🧾 show the row for the last booking"}</button>
        <span className="art">{!lb?.session ? "📋 book a table first (the button on the left)"
          : lb.recorded === false ? <>the last booking ran <b>before</b> the plugin was on — book again</>
          : <>party <b>{lb.party}</b> · session {lb.session.slice(0, 8)}… · {p?.receipts || 0} row{p?.receipts === 1 ? "" : "s"} read back so far</>}</span>
      </div>
      {r && !r.ok && <div className="err">{r.error || `no row for session ${r.session.slice(0, 8)}… after ${r.waited}s — the writer flushes at the end of the run; try once more`}</div>}
      {r && r.ok && (
        <>
          <div className="art">{r.rows} event rows in <code>{r.table}</code> for this session → <b>{r.turns.length} turn{r.turns.length === 1 ? "" : "s"}</b> in <code>v_eval_turn</code> · answered in {r.waited}s</div>
          {r.turns.map((t) => <Turn key={t.invocation_id} t={t} />)}
        </>
      )}
    </div>
  );
}

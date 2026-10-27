"use client";
import { useEffect, useState } from "react";
import { getPaths, type PathRow, type PathsCard } from "@/lib/api";

/** ⚖ Eight paths, one dinner — course X. Party p3, the one golden path the
 *  eval set holds, and eight ways an agent could have got to a booking. Every
 *  judge grades every path with the code `adk eval` runs (kitchen/paths.py):
 *  ADK's trajectory comparator four ways, the path checker, and everyone_ate
 *  on the reservation. No model is called — unless you add the fourth judge,
 *  an LLM with a rubric, one call per path. */

export const callLabel = (c: { name: string; args: Record<string, unknown> }) =>
  c.name === "book" ? `book ${c.args.room} ${c.args.time} ×${c.args.party_size}` : c.name === "get_room" ? `get_room ${c.args.room}` : c.name;

const V = ({ ok, na }: { ok: boolean; na?: boolean }) => <b className={na ? "na" : ok ? "p" : "f"}>{na ? "—" : ok ? "PASS" : "FAIL"}</b>;
const fed = (r: PathRow) => r.everyone_ate.booking >= 0.9;

export default function Paths() {
  const [card, setCard] = useState<PathsCard | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { getPaths(false).then(setCard).catch((e) => setErr((e as Error).message)); }, []);
  const addJudge = async () => {
    setBusy(true);
    try { setCard(await getPaths(true)); } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  };
  if (!card) return <div className="flight paths"><div className="k">⚖ EIGHT PATHS, ONE DINNER</div><div className="hint">{err || "laying out the eight paths…"}</div></div>;

  const cols = [...card.matches.map((m) => ({ id: m, label: m.replace("IN_ORDER · ignore_args", "ignore_args"), of: (r: PathRow) => r.comparator[m] === 1 })),
    { id: "path", label: "path checker", of: (r: PathRow) => r.path.passed },
    { id: "fed", label: "everyone_ate", of: fed }];
  // the verdict a careful reader gives: the path held AND everyone ate
  const right = (r: PathRow) => r.path.passed && fed(r);
  const agree = (of: (r: PathRow) => boolean) => card.rows.filter((r) => of(r) === right(r)).length;
  const row = card.rows.find((r) => r.id === open);
  return (
    <div className="flight paths">
      <div className="k">⚖ EIGHT PATHS, ONE DINNER · party {card.party} · {card.people.join(", ")}</div>
      <div className="hint">
        The golden path in <code>exam/paths_val.evalset.json</code>: <b>{card.golden.map(callLabel).join(" → ")}</b>. This party has <b>{card.right_answers} right (room, time) answers</b> at
        15-minute steps, and any number of right orders to look in — the golden path holds one of each. Each row below is a path an agent could have taken; each column is a judge. Click a row for its calls and the whys.
      </div>
      <table className="three">
        <thead><tr><th>the path</th>{cols.map((c) => <th key={c.id}>{c.label}</th>)}{card.judged && <th>llm judge<small>rubric_based_tool_use_quality_v1</small></th>}</tr></thead>
        <tbody>
          {card.rows.map((r) => (
            <tr key={r.id} className={open === r.id ? "open" : ""} onClick={() => setOpen(open === r.id ? null : r.id)}>
              <td className="pid">{r.id} · {r.label}<small>{r.note}</small></td>
              {cols.map((c) => <td key={c.id}><V ok={c.of(r)} /></td>)}
              {card.judged && <td><V ok={Boolean(r.llm?.passed)} na={r.llm?.passed === null || r.llm?.passed === undefined} />{r.llm?.why && <small>{r.llm.why}</small>}</td>}
            </tr>
          ))}
          <tr className="tally"><td className="pid">right on<small>a path that held, and everyone ate</small></td>{cols.map((c) => <td key={c.id}><span className="mono">{agree(c.of)}/8</span></td>)}
            {card.judged && <td><span className="mono">{agree((r) => Boolean(r.llm?.passed))}/8</span></td>}</tr>
        </tbody>
      </table>
      {row && (
        <div className="detail">
          <div><span className="k">THE CALLS · {row.id}</span><div className="calls">{row.calls.map((c, i) => <i key={i} className={c.name === "book" ? "bk" : ""}>{callLabel(c)}</i>)}</div>
            <div className="art">the reply names <b>{row.reply.restaurant} {row.reply.time}</b></div></div>
          <div className="whys">{row.path.rules.map((x) => <div key={x.rule}><b className={x.ok ? "ok" : "bad"}>{x.ok ? "✓" : "✗"} {x.rule}</b>{x.why}</div>)}
            <div><b className={fed(row) ? "ok" : "bad"}>{fed(row) ? "✓" : "✗"} everyone_ate</b>{row.everyone_ate.booking.toFixed(2)} on the reservation{row.everyone_ate.reply !== row.everyone_ate.booking ? ` · ${row.everyone_ate.reply.toFixed(2)} on what the reply claims` : ""}{row.everyone_ate.hungry.length ? ` — ${row.everyone_ate.hungry.join(" · ")}` : ""}</div></div>
        </div>
      )}
      <div className="opts">
        {!card.judged && <button className="btn" disabled={busy} onClick={addJudge}>{busy ? "⚖ judging… (eight model calls, one at a time)" : "⚖ add the fourth judge · an LLM with a rubric (8 calls)"}</button>}
        <span className="art">the comparator rows are ADK’s own TrajectoryEvaluator; nothing here is simulated except the eight paths themselves</span>
      </div>
      <div className="foot">Read down a column. EXACT passes the golden path and nothing else — not the agent that rang three rooms first, not the other room that feeds all six. IN_ORDER and ANY_ORDER pass the path that left a reservation nobody will show up for. <code>ignore_args</code> passes the two that left people hungry. The path checker and everyone_ate, together, are right on all eight — and neither one needs a golden path.</div>
    </div>
  );
}

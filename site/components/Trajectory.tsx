"use client";
import { useEffect, useState } from "react";
import type { ToolCall, TrajExam, TrajParty } from "@/lib/api";

const fmtArgs = (args: Record<string, unknown>) =>
  Object.entries(args || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" ? `"${v}"` : String(v)}`)
    .join(", ");

const fmtCall = (c: ToolCall) => `${c.name}(${fmtArgs(c.args || {})})`;

const TRAJ_JUDGES = [
  {
    key: "exact" as const,
    name: "EXACT trajectory",
    metric: "tool_trajectory_avg_score · EXACT",
    asks: "did the agent call the exact same tools with the exact same args in the exact same order?",
    blind: "fails valid exploration — checking a second kitchen, passing filter args, or picking another valid room all score 0.",
  },
  {
    key: "in_order" as const,
    name: "IN_ORDER trajectory",
    metric: "tool_trajectory_avg_score · IN_ORDER",
    asks: "did the golden calls appear in order as a subsequence (extra calls allowed)?",
    blind: "tolerates extra inspect_kitchen calls, yet still fails whenever the agent picks a different valid restaurant or filters list_restaurants.",
  },
  {
    key: "any_order" as const,
    name: "ANY_ORDER trajectory",
    metric: "tool_trajectory_avg_score · ANY_ORDER",
    asks: "did every expected call appear somewhere, regardless of order?",
    blind: "order-blind — calling book_table BEFORE inspect_kitchen passes as long as both appear somewhere in the trace.",
  },
  {
    key: "ticket" as const,
    name: "trajectory invariants",
    metric: "kitchen_ticket (custom checker)",
    asks: "did it list → inspect_kitchen BEFORE book_table → commit once within budget → feed everyone?",
    blind: "encodes your domain contract on intermediate_data: permits extra research and any valid room, catches phantom or blind bookings.",
  },
];

const CHECK_LABELS: [string, string][] = [
  ["listed", "listed candidates"],
  ["inspected_before_book", "inspected before book_table"],
  ["committed_once", "booked once (matches reply)"],
  ["within_budget", "≤ 10 tool calls"],
  ["everyone_ate", "everyone_ate ≥ 0.9"],
];

function TrajTile({ label, exam, onPick }: { label: string; exam?: TrajExam; onPick: (pid: string) => void }) {
  const ok = exam && (exam.passed || 0) >= 5;
  const rows = exam?.parties || [];
  return (
    <div className={"result " + (exam ? (ok ? "pass" : "fail") : "")}>
      {label}
      <b>{exam ? `${exam.passed} / ${(exam.passed || 0) + (exam.failed || 0)}` : "—"}</b>
      {exam
        ? `${exam.hungry ?? 0} hungry seats · kitchen_ticket would pass ${exam.ticket_passed ?? "?"}/8`
        : "not run yet"}
      {exam?.replayed && <span className="under"><i className="replayed">replayed from our run</i></span>}
      {rows.length > 0 && (
        <div className="strip">
          {rows.map((r) => (
            <i
              key={r.party}
              onClick={() => onPick(r.party)}
              style={{ cursor: "pointer" }}
              className={r.status === "PASSED" ? "p" : r.status === "FAILED" ? "f" : ""}
              title={`${r.party} · ${r.status || "?"} · ${r.calls.length} tool calls · ${r.hungry} hungry${r.whys?.length ? "\n" + r.whys.join("\n") : ""}`}
            >
              {r.party} {r.status === "PASSED" ? "✓" : r.status === "FAILED" ? "✗" : "·"}
            </i>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Trajectory({ trajExams, party }: { trajExams: TrajExam[]; party: string }) {
  const [pid, setPid] = useState(party || "p1");
  useEffect(() => { if (party) setPid(party); }, [party]);

  const exactExam = trajExams.filter((e) => e.judge !== "kitchen_ticket").slice(-1)[0];
  const ticketExam = trajExams.filter((e) => e.judge === "kitchen_ticket").slice(-1)[0];
  const latest = trajExams[trajExams.length - 1];
  const row: TrajParty | undefined = latest?.parties?.find((r) => r.party === pid) || latest?.parties?.[0];

  return (
    <div className="traj">
      <div className="results">
        <TrajTile label="shipped · tool_trajectory_avg_score (EXACT)" exam={exactExam} onPick={setPid} />
        <TrajTile label="your checker · kitchen_ticket" exam={ticketExam} onPick={setPid} />
      </div>

      {row && (
        <div className="flight" style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <span className="k" style={{ margin: 0 }}>
              🧾 INTERMEDIATE_DATA TRACE · party {row.party} · {row.calls.length} tool calls · {row.hungry} hungry
            </span>
            <div className="strip" style={{ margin: 0 }}>
              {(latest?.parties || []).map((r) => (
                <i
                  key={r.party}
                  onClick={() => setPid(r.party)}
                  style={{ cursor: "pointer", fontWeight: r.party === row.party ? 700 : 400, borderColor: r.party === row.party ? "var(--olive)" : undefined }}
                  className={r.status === "PASSED" ? "p" : "f"}
                >
                  {r.party}
                </i>
              ))}
            </div>
          </div>

          <div className="pair">
            <div>
              <span className="k">WHAT CONCIERGE ACTUALLY CALLED ({row.calls.length} CALLS)</span>
              <div className="calllist">
                {row.calls.length === 0 ? <div className="art">(no tool calls)</div> : row.calls.map((c, idx) => (
                  <div key={idx} className={"callchip" + (c.name === "book_table" ? " commit" : c.name === "inspect_kitchen" ? " inspect" : "")}>
                    <b>{idx + 1}</b> <code>{fmtCall(c)}</code>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="k">GOLDEN TRAJECTORY IN EVALSET ({row.expected_calls.length} CALLS)</span>
              <div className="calllist">
                {row.expected_calls.map((c, idx) => (
                  <div key={idx} className="callchip">
                    <b>{idx + 1}</b> <code>{fmtCall(c)}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="strip" style={{ marginBottom: 8 }}>
            {CHECK_LABELS.map(([k, lbl]) => {
              const ok = Boolean(row.checks?.[k]);
              return (
                <i key={k} className={ok ? "p" : "f"}>
                  {lbl} {ok ? "✓" : "✗"}
                </i>
              );
            })}
          </div>

          <div className="judges">
            {TRAJ_JUDGES.map((j) => {
              const v = row.judges?.[j.key];
              const ok = Boolean(v?.ok);
              const why = j.key === "ticket"
                ? (v && "whys" in v && v.whys.length ? v.whys.join(" · ") : "all 4 trajectory invariants held and every seat ate")
                : (v && "why" in v ? v.why : "");
              return (
                <div key={j.key} className={"judgecard " + (ok ? "pass" : "fail")}>
                  <div className="head">
                    <b>{j.name}</b>
                    <span className="mono">{j.metric}</span>
                    <b className={"vd " + (ok ? "p" : "f")}>{ok ? "PASS" : "FAIL"}</b>
                  </div>
                  <div className="row"><span className="lbl">asks</span><span><i>{j.asks}</i></span></div>
                  <div className="row verdict"><span className="lbl">on {row.party}</span><span><b>{ok ? "PASS" : "FAIL"}</b> — {why}</span></div>
                  <div className="row blind"><span className="lbl">note</span><span>{j.blind}</span></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import type { MtExam, MtParty, ToolCall } from "@/lib/api";

const fmtArgs = (args: Record<string, unknown>) =>
  Object.entries(args || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" ? `"${v}"` : String(v)}`)
    .join(", ");

const fmtCall = (c: ToolCall) => `${c.name}(${fmtArgs(c.args || {})})`;

function MtTile({ label, exam, active, onSelect }: { label: string; exam?: MtExam; active?: boolean; onSelect?: () => void }) {
  const ok = exam && (exam.passed || 0) >= 3;
  const rows = exam?.parties || [];
  return (
    <div
      className={"result " + (exam ? (ok ? "pass" : "fail") : "")}
      onClick={exam && onSelect ? onSelect : undefined}
      style={{ cursor: exam && onSelect ? "pointer" : undefined, boxShadow: active ? "0 0 0 2px var(--olive)" : undefined }}
    >
      {label}
      <b>{exam ? `${exam.passed} / ${(exam.passed || 0) + (exam.failed || 0)}` : "—"}</b>
      {exam
        ? `${exam.elicited_count ?? 0}/4 asked first · ${exam.hungry ?? 0} hungry seats`
        : "not run yet"}
      {exam?.instruction && (
        <span className="under">
          under <b>{exam.instruction}</b>{exam.replayed ? <> · <i className="replayed">replayed</i></> : ""}
        </span>
      )}
      {rows.length > 0 && (
        <div className="strip">
          {rows.map((r) => (
            <i
              key={r.party}
              className={r.status === "PASSED" ? "p" : r.status === "FAILED" ? "f" : ""}
              title={`${r.party} · ${r.turn_count} turns · ${r.elicited ? "asked first" : "booked blind on turn 1"} · ${r.hungry} hungry${r.whys?.length ? "\n" + r.whys.join("\n") : ""}`}
            >
              {r.party} {r.status === "PASSED" ? "✓" : "✗"}
            </i>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MultiTurn({ mtExams, party }: { mtExams: MtExam[]; party: string }) {
  const eagerExam = mtExams.filter((e) => e.instruction === "eager").slice(-1)[0];
  const elicitingExam = mtExams.filter((e) => e.instruction !== "eager").slice(-1)[0];
  const [whichRun, setWhichRun] = useState<"latest" | "eager" | "eliciting">("latest");
  const [pid, setPid] = useState(["p1", "p2", "p10", "p16"].includes(party) ? party : "p1");

  useEffect(() => {
    if (["p1", "p2", "p10", "p16"].includes(party)) setPid(party);
  }, [party]);

  const activeExam =
    whichRun === "eager" && eagerExam ? eagerExam
    : whichRun === "eliciting" && elicitingExam ? elicitingExam
    : mtExams[mtExams.length - 1];

  const row: MtParty | undefined = activeExam?.parties?.find((r) => r.party === pid) || activeExam?.parties?.[0];

  return (
    <div className="mturn">
      <div className="results">
        <MtTile
          label="shipped · eager concierge (books on turn 1)"
          exam={eagerExam}
          active={Boolean(activeExam && activeExam === eagerExam && elicitingExam)}
          onSelect={() => setWhichRun("eager")}
        />
        <MtTile
          label="rewritten · asks before book_table"
          exam={elicitingExam}
          active={Boolean(activeExam && activeExam === elicitingExam && eagerExam)}
          onSelect={() => setWhichRun("eliciting")}
        />
      </div>

      {row && (
        <div className="flight" style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <span className="k" style={{ margin: 0 }}>
              💬 SIMULATED CONVERSATION · party {row.party} · {row.turn_count} turn{row.turn_count === 1 ? "" : "s"} · persona NOVICE
            </span>
            <div className="strip" style={{ margin: 0 }}>
              {(activeExam?.parties || []).map((r) => (
                <i
                  key={r.party}
                  onClick={() => setPid(r.party)}
                  style={{ cursor: "pointer", fontWeight: r.party === row.party ? 700 : 400, borderColor: r.party === row.party ? "var(--olive)" : undefined }}
                  className={r.status === "PASSED" ? "p" : "f"}
                >
                  {r.party} ({r.turn_count}t)
                </i>
              ))}
            </div>
          </div>

          <div className="strip" style={{ marginBottom: 10 }}>
            <i className={row.elicited ? "p" : "f"}>
              {row.elicited ? "asked before book_table ✓" : "booked blind on turn 1 ✗"}
            </i>
            <i className={row.hungry === 0 && Boolean(row.restaurant) ? "p" : "f"}>
              {row.restaurant ? `${row.restaurant} @ ${row.time} · ${row.hungry} hungry` : "no valid booking"}
            </i>
            <i className={row.status === "PASSED" ? "p" : "f"}>
              multiturn_dinner: {row.status || "?"} ({(row.score ?? 0).toFixed(2)})
            </i>
          </div>

          <div className="turns">
            {row.turns.map((t, idx) => {
              const premature = idx === 0 && t.tools.some((c) => c.name === "book_table");
              const st = t.eval_status || (idx + 1 < row.turns.length ? "NOT_EVALUATED" : row.status || "NOT_EVALUATED");
              return (
                <div key={idx} className={"turncard" + (premature ? " bad" : "")}>
                  <div className="turnhd">
                    <b>TURN {idx + 1}</b>
                    <span className={"vd " + (st === "PASSED" ? "p" : st === "FAILED" ? "f" : "na")}>
                      {st === "NOT_EVALUATED" ? "NOT_EVALUATED · clarification turn" : `${st} · conversation verdict`}
                    </span>
                  </div>
                  <div className="msg user">
                    <span className="who">🧑 NOVICE SIMULATOR</span>
                    <div>{t.user}</div>
                  </div>
                  {t.tools.length > 0 && (
                    <div className="calllist" style={{ margin: "6px 0" }}>
                      {t.tools.map((c, ci) => (
                        <div key={ci} className={"callchip" + (idx === 0 && c.name === "book_table" ? " premature" : c.name === "book_table" ? " commit" : "")}>
                          <b>🔧</b> <code>{fmtCall(c)}</code>
                          {idx === 0 && c.name === "book_table" && <span className="warnchip">committed before asking!</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="msg agent">
                    <span className="who">🛎 CONCIERGE ({activeExam?.instruction || "concierge"})</span>
                    <pre>{t.agent}</pre>
                  </div>
                </div>
              );
            })}
          </div>

          {row.whys.length > 0 && (
            <div className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
              <b>Why it failed:</b> {row.whys.join(" · ")}
            </div>
          )}
          <div className="foot">
            Notice turn 1 under the eager concierge: the <code>NOVICE</code> simulator politely replies <i>“Thanks!”</i> even when guests cannot eat there — just like real users who do not know the kitchen’s hidden allergen notes. A polite user reply is not a passed eval; grading the full conversation against the hidden <code>ConversationScenario</code> catches it.
          </div>
        </div>
      )}
    </div>
  );
}

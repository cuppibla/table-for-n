"use client";
import type { Folded } from "@/lib/useEvents";

/** The same log, the engineer's projection: the event table, and the two
 *  judges' source side by side. `party` is never read — your linter said so. */
export default function Console({ f, judge }: { f: Folded; judge: string }) {
  const rows = f.log.slice(-60);
  const t0 = rows.length ? rows[0].t : 0;
  const short = (e: Record<string, unknown>) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e)) {
      if (["i", "ep", "t", "type"].includes(k)) continue;
      if (k === "people" && Array.isArray(v)) { o.people = v.map((p) => (p as { id: string }).id); continue; }
      if (k === "diff" && Array.isArray(v)) { o.diff = `${v.length} lines`; continue; }
      if (typeof v === "string" && v.length > 70) { o[k] = v.slice(0, 67) + "…"; continue; }
      o[k] = v;
    }
    return JSON.stringify(o).replace(/"/g, "").slice(0, 150);
  };
  return (
    <div className="console">
      <div className="hd"><span>THE LOG · append-only · one contract, three feeds</span><span>episode {f.episode} · {rows.length} events</span></div>
      <div className="scroll">
        <table><tbody>
          {rows.map((e) => <tr key={e.i}><td>{e.i}</td><td>+{(e.t - t0).toFixed(1)}s</td><td>{e.type}</td><td>{short(e)}</td></tr>)}
        </tbody></table>
      </div>
      <div className="two">
        <pre><span className="k">def</span> everyone_ate(party, pick):   <span className="c"># the honest judge {judge === "everyone_ate" ? "· ON" : ""}</span>{"\n"}    fed = 0{"\n"}    <span className="k">for</span> person <span className="k">in</span> party:         <span className="c"># walks the table,</span>{"\n"}        ok, why = seat(person, pick) <span className="c"># seat by seat</span>{"\n"}        fed += ok{"\n"}    <span className="k">return</span> fed / len(party)</pre>
        <pre><span className="k">def</span> rating_score(<span className="bad">party</span>, pick):   <span className="c"># the gameable judge {judge === "rating" ? "· ON" : ""}</span>{"\n"}    <span className="k">return</span> pick.rating / 5.0{"\n"}{"\n"}<span className="c"># ^ party is never read.</span>{"\n"}<span className="c">#   your linter already told you.</span></pre>
      </div>
    </div>
  );
}

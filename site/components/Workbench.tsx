"use client";
import { useState } from "react";
import { ORIGIN, getBrief } from "@/lib/api";
import type { WbGuide } from "@/app/table/page";
import { COURSES } from "@/lib/courses";

/** adk web, in a drawer. The same host/ folder, the same table.db — a
 *  booking here is a session there. Course I lives here; the Evals tab is
 *  the second mirror for every course after it. */
function CopyBrief() {
  const [done, setDone] = useState(false);
  return (
    <button className="copy" onClick={async () => {
      try { const b = await getBrief("p1"); await navigator.clipboard.writeText(b.brief); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* blocked */ }
    }}>{done ? "copied ✓" : "📋 copy the brief"}</button>
  );
}

export default function Workbench({ open, onClose, guide, course }: { open: boolean; onClose: () => void; guide: WbGuide; course: number }) {
  const key = COURSES[course - 1]?.key;
  const appName = key === "trajectory" || key === "multiturn" ? "concierge" : "host";
  const src = `${ORIGIN}/workbench/dev-ui/?app=${appName}`;
  return (
    <div className={"drawer" + (open ? " open" : "")} aria-hidden={!open}>
      <div className="hd">
        <span>🔬 THE WORKBENCH · adk web · {appName}, same sessions, same exam</span>
        <span style={{ display: "flex", gap: 8 }}>
          <a className="btn" href={src} target="_blank" rel="noreferrer">open in a tab ↗</a>
          <button className="btn" onClick={onClose}>✕</button>
        </span>
      </div>
      <div className="wbhint">
        <div className="wbcourse">ON COURSE {COURSES[course - 1]?.r || course}, IN ADK WEB</div>
        <ol className="steps">
          {guide.steps.map((st, i) => <li key={i}><b>{i + 1}</b><span>{st.includes("[brief]") ? <>{st.split("[brief]")[0]}<CopyBrief />{st.split("[brief]")[1]}</> : st}</span></li>)}
        </ol>
        <div className="see"><span>YOU WILL SEE</span> {guide.see}</div>
      </div>
      {open && <iframe src={src} title="adk web" />}
    </div>
  );
}

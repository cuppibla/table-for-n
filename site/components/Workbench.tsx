"use client";
import { useState } from "react";
import { ORIGIN, getBrief } from "@/lib/api";

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

export default function Workbench({ open, onClose, hint }: { open: boolean; onClose: () => void; hint?: string }) {
  const src = `${ORIGIN}/workbench/dev-ui/?app=host`;
  return (
    <div className={"drawer" + (open ? " open" : "")} aria-hidden={!open}>
      <div className="hd">
        <span>🔬 THE WORKBENCH · adk web · same host, same sessions, same exam</span>
        <span style={{ display: "flex", gap: 8 }}>
          <a className="btn" href={src} target="_blank" rel="noreferrer">open in a tab ↗</a>
          <button className="btn" onClick={onClose}>✕</button>
        </span>
      </div>
      <div className="wbhint">
        <div className="steps"><b>1</b> pick <code>host</code> <b>2</b> <CopyBrief /> → paste in the chat → send <b>3</b> read the answer</div>
        {hint && <div className="see"><span>YOU WILL SEE</span> {hint}</div>}
      </div>
      {open && <iframe src={src} title="adk web" />}
    </div>
  );
}

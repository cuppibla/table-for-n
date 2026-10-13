"use client";
import { ORIGIN } from "@/lib/api";

/** adk web, in a drawer. The same host/ folder, the same table.db — a
 *  booking here is a session there. Course I lives here; the Evals tab is
 *  the second mirror for every course after it. */
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
      {hint && <div className="wbhint"><span>NOW, IN ADK WEB →</span> {hint}</div>}
      {open && <iframe src={src} title="adk web" />}
      <div className="mono" style={{ fontSize: 10.5, color: "#8a8f78", marginTop: 10, lineHeight: 1.5 }}>
        same <b style={{ color: "#E8E3D4" }}>host/</b> folder, same <b style={{ color: "#E8E3D4" }}>table.db</b>: a booking here is a session there; an install on the page lands here on the next run.
      </div>
    </div>
  );
}

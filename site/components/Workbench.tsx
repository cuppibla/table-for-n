"use client";
import { ORIGIN } from "@/lib/api";

/** adk web, in a drawer. The same host/ folder, the same table.db — a
 *  booking here is a session there. Course I lives here; the Evals tab is
 *  the second mirror for every course after it. */
export default function Workbench({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      {open && <iframe src={src} title="adk web" />}
      <div className="mono" style={{ fontSize: 10.5, color: "#8a8f78", marginTop: 10, lineHeight: 1.5 }}>
        pick <b style={{ color: "#E8E3D4" }}>host</b>, paste the brief, send. the Evals tab shows every exam you ran from the page.
      </div>
    </div>
  );
}

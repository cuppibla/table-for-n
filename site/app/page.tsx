"use client";
import { useEffect, useState } from "react";
import { PARTIES } from "@/components/Stage";

/** The reservation card — the first screen. Your name goes on the check. */
export default function Cover() {
  const [name, setName] = useState("");
  const [party, setParty] = useState("p1");
  useEffect(() => {
    try { setName(localStorage.getItem("tfn.name") || ""); setParty(localStorage.getItem("tfn.party") || "p1"); } catch { /* private mode */ }
  }, []);
  const go = () => {
    try { localStorage.setItem("tfn.name", name.trim()); localStorage.setItem("tfn.party", party); } catch { /* ignore */ }
    window.location.href = "/table/";
  };
  return (
    <div className="cover">
      <div className="card">
        <img src="/art/hero.jpg" alt="the bistro at golden hour" />
        <div className="rsv">
          <div className="eyebrow">A reservation · agent eval → the self-evolving loop</div>
          <h1 className="display">Table for <em>N</em></h1>
          <p>One table. N people. One agent books the restaurant. <b>How many of them actually ate?</b> Ten courses: you watch a comparator fail a good dinner, build the judge and walk a table yourself, put three judges on the same answers, let the agent rewrite itself, swap the judge and watch the number lie, close the loop, grade the tool trajectory before the reply, and test multi-turn elicitation against a simulated user.</p>
          <div><label>YOUR NAME · it goes on the check</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="who is booking?" onKeyDown={(e) => { if (e.key === "Enter") go(); }} /></div>
          <div><label>TABLE FOR</label><select value={party} onChange={(e) => setParty(e.target.value)}>{PARTIES.map((id) => <option key={id} value={id}>{id === "p1" ? "5 · tonight’s party (p1)" : `party ${id}`}</option>)}</select></div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
            <button className="btn hot" onClick={go}>✦ seat us</button>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>~75 min · a Google Cloud project (or a Gemini API key)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

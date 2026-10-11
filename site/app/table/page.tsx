"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Check from "@/components/Check";
import Course from "@/components/Course";
import FloorPlan from "@/components/FloorPlan";
import Menu from "@/components/Menu";
import Stage from "@/components/Stage";
import Workbench from "@/components/Workbench";
import { book, getProgress, setJudge, type Progress, ORIGIN } from "@/lib/api";
import { COURSES, SHORT_TAG } from "@/lib/courses";
import { isBig, useEvents, type Seat } from "@/lib/useEvents";

/** Table for N — one page, fixed shape.
 *  Left, the stage: the switch, the table, the host. Right, the floor plan
 *  (the architecture, alive) and the course: you · the table · one edit · one ✓.
 *  Seven courses, each lit when something real proves it — the kitchen reads
 *  your files and the receipts it kept, never a checklist. Nothing restarts:
 *  an edit lands on your next 📋 booking or 📝 exam. */

const CH_KEY = "tfn.course";

export default function TablePage() {
  const [course, setCourse] = useState(1);
  const [p, setP] = useState<Progress | null>(null);
  const [name, setName] = useState("");
  const [party, setPartyState] = useState("p1");
  const [view, setView] = useState<"show" | "console">("show");
  const [drawer, setDrawer] = useState(false);
  const [check, setCheck] = useState(false);
  const [booking, setBooking] = useState(false);
  const [world, setWorld] = useState<{ people: Record<string, { name: string; label: string }>; parties: Record<string, string[]> } | null>(null);
  const [toast, setToast] = useState("");
  const f = useEvents();

  const refresh = useCallback(async () => { const x = await getProgress(); if (x) setP(x); }, []);

  useEffect(() => {
    try { setName(localStorage.getItem("tfn.name") || ""); setPartyState(localStorage.getItem("tfn.party") || "p1"); } catch { /* ignore */ }
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("console") === "1") setView("console");          // capture mode
    if (qs.get("check") === "1") setCheck(true);
    const want = parseInt(qs.get("ch") || "", 10);
    try {
      const c = want >= 1 && want <= 7 ? want : parseInt(localStorage.getItem(CH_KEY) || "1", 10);
      if (c >= 1 && c <= 7) setCourse(c);
    } catch { if (want >= 1 && want <= 7) setCourse(want); }
    fetch(`${ORIGIN}/api/world`).then((r) => r.json()).then(setWorld).catch(() => null);
    refresh();
    const id = setInterval(refresh, 4000);
    const back = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", back); };
  }, [refresh]);

  // a big event (a verdict, a gate, a switch) is worth an immediate re-read
  const lastBig = f.log.length ? f.log[f.log.length - 1] : null;
  useEffect(() => { if (lastBig && isBig(lastBig.type)) refresh(); }, [lastBig?.i]);   // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n: number) => { setCourse(n); try { localStorage.setItem(CH_KEY, String(n)); } catch { /* ignore */ } };
  const setParty = (s: string) => { setPartyState(s); try { localStorage.setItem("tfn.party", s); } catch { /* ignore */ } };
  const onJudge = async (to: "everyone_ate" | "rating") => { try { await setJudge(to); refresh(); } catch (e) { setToast((e as Error).message); } };
  const onBook = async () => {
    setBooking(true);
    try { const r = await book(party); if (!r.ok) setToast(String(r.error || "the host did not book")); }
    catch (e) { setToast((e as Error).message); }
    finally { setBooking(false); refresh(); }
  };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t); }, [toast]);

  const fallback: Seat[] = (world?.parties?.[party] || []).map((id) => ({ id, name: world!.people[id]?.name || id, label: SHORT_TAG[id] || world!.people[id]?.label || "" }));
  const c = COURSES[course - 1];
  const lit = p?.lit || {};
  const litCount = Object.keys(lit).filter((k) => k !== "7" && lit[k]).length;
  const status = !f.connected ? ["off", "the kitchen is away"] : f.running ? ["busy", f.kind === "exam" ? "the exam is running" : f.kind === "loop" ? "the loop is running" : `${f.kind}…`] : ["", "the host is in"];

  return (
    <div className="wrap">
      <div className="head">
        <div>
          <div className="eyebrow"><Link href="/">Table for N</Link> · agent eval → the self-evolving loop</div>
          <h1 className="display">Table for <em>N</em></h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className="status"><i className={status[0]} />{status[1]}</span>
          <span className="resv"><img src="/art/concierge.jpg" alt="" /><span><b>{name || "a guest"}</b> · party {party} · {litCount} / 6 served</span></span>
          <button className={"btn" + (view === "console" ? " on" : "")} onClick={() => setView(view === "show" ? "console" : "show")}>🧾 console</button>
          <button className={"btn" + (drawer ? " on" : "")} onClick={() => setDrawer(!drawer)}>🔬 workbench</button>
        </div>
      </div>

      <Menu current={course} lit={lit} onPick={go} />

      <div className="main">
        <Stage course={c} p={p} f={f} view={view} party={party} setParty={setParty} onJudge={onJudge} onBook={onBook} booking={booking} fallback={fallback} />
        <div style={{ display: "grid", gap: 16 }}>
          <FloorPlan n={course} p={p} f={f} />
          <Course n={course} p={p} f={f} party={party} onGo={go} onChanged={refresh} onCheck={() => setCheck(true)} />
        </div>
      </div>

      <Workbench open={drawer} onClose={() => setDrawer(false)} />
      {check && <Check p={p} name={name} onClose={() => setCheck(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

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

/** One line for the drawer: what adk web can show you right now. */
function wbHint(course: number, p: Progress | null, f: ReturnType<typeof useEvents>): string {
  const kind = p?.code?.instruction || "draft";
  const exams = p?.exams?.length || 0;
  if (course === 1) return "pick host, paste the brief (copy button in the course panel), send. That booking is course I's receipt.";
  if (course === 2) return exams ? "Evals tab → the 🕓 history icon in the left rail: the exams you ran from the page, per party, with the metric that graded each — everyone_ate included. (In the “Run evaluation” dialog, everyone_ate and rating sit beside ADK's built-in metrics — pick everyone_ate on parties_val to grade from here with the same function the page's 📝 button runs.) Paste the brief again: the answer is unchanged — the judge changed, not the agent."
    : "paste the brief: same answer as course I. Then run the exam from the page and come back — Evals → 🕓 history will have it.";
  if (course === 3) return kind === "draft" ? "paste the brief now and remember the answer — after ⤵ install, paste it again here."
    : `the host runs under the ${kind} instruction. Paste the brief again: a different dinner, and a reason that cites the constraints.`;
  if (course === 4) return kind === "hacked" ? "paste the brief: Smoke & Barrel, and not one person in the reason. Evals → history: rating 8 PASS beside everyone_ate 1 PASS — the same eight answers."
    : "⤵ install the hacked instruction first, then paste the brief here.";
  if (course === 5) return "nothing changes here for this course: the loop is its own graph with its own host node. The host/ you talk to here is untouched.";
  if (course === 6) return "the deployed host is not here — it is on Agent Engine. The console's Sessions tab is the workbench out there.";
  return f.people.length ? "same host, same sessions. Everything you did on the page is in Evals → history." : "same host, same sessions.";
}

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
  const [nudge, setNudge] = useState<string>("");          // something changed that adk web will show
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

  // a big event (a verdict, a gate, a switch) is worth an immediate re-read —
  // and some of them are worth a look in the workbench, so the page says so.
  const lastBig = f.log.length ? f.log[f.log.length - 1] : null;
  useEffect(() => {
    if (!lastBig) return;
    if (isBig(lastBig.type)) refresh();
    const age = Date.now() / 1000 - (lastBig.t as number);
    if (age > 20) return;                                   // history on load is not news
    if (lastBig.type === "instruction_installed") {
      const k = lastBig.installed as string;
      setNudge(`the host runs under the ${k === "optimized" ? "optimized" : k} instruction now — in 🔬 workbench, paste the brief again and read the new answer`);
      setToast(`installed: ${k} · open 🔬 workbench and paste the brief again`);
    } else if (lastBig.type === "exam_scored") {
      setNudge(`that exam is in 🔬 workbench too — Evals → the history icon → the latest run, per party`);
    } else if (lastBig.type === "file_saved" && String(lastBig.path).includes("eval_config")) {
      setNudge(`criteria changed — the next exam, and its row in 🔬 workbench → Evals, grade with your judge`);
    }
  }, [lastBig?.i]);   // eslint-disable-line react-hooks/exhaustive-deps
  const openDrawer = (on: boolean) => { setDrawer(on); if (on) setNudge(""); };

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
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}>
            {nudge && !drawer && <span className="wbnudge" onClick={() => openDrawer(true)}>{nudge}</span>}
            <button className={"btn" + (drawer ? " on" : "") + (nudge && !drawer ? " nudge" : "")} onClick={() => openDrawer(!drawer)}>🔬 workbench</button>
          </span>
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

      <Workbench open={drawer} onClose={() => openDrawer(false)} hint={wbHint(course, p, f)} />
      {check && <Check p={p} name={name} onClose={() => setCheck(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

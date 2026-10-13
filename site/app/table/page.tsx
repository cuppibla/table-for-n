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
import { COURSES, LAST, SHORT_TAG, keyOf } from "@/lib/courses";
import { isBig, useEvents, type Seat } from "@/lib/useEvents";

/** Table for N — one page, fixed shape.
 *  Left, the stage: the switch, the table, the host. Right, the floor plan
 *  (the architecture, alive) and the course: you · the table · one edit · one ✓.
 *  Eight courses, each lit when something real proves it — the kitchen reads
 *  your files and the receipts it kept, never a checklist. Nothing restarts:
 *  an edit lands on your next 📋 booking or 📝 exam. */

const CH_KEY = "tfn.course";

/** What to do in adk web on THIS course — steps and what you will see.
 *  "[brief]" in a step renders the copy-the-brief button. */
export type WbGuide = { steps: string[]; see: string };
function wbGuide(course: number, p: Progress | null): WbGuide {
  const kind = p?.code?.instruction || "draft";
  const key = keyOf(course);
  const chat = ["pick host in the agent dropdown (top left)", "[brief] → paste in the chat → send", "read the booking and its reason"];
  if (key === "booking") return { steps: chat, see: "a room, a time, a confident reason — and nothing that can say whether it is good." };
  if (key === "comparator") return {
    steps: ["Evals tab (left rail) → 🕓 history: the exam 📝 just ran is listed here — the CLI and this UI share one store (host/.adk/eval_history)",
      "click a party in that run: its response_match_score, PASS/FAIL, and the answer that was graded against the golden one",
      "optional: select the cases → Run evaluation → tick response_match_score → Run. The third way is 🧪 pytest on the page; its run lands in this same list"],
    see: "the same verdicts the 📝 button gave, one conversation at a time. This is where you stare at a failure; the CLI is where you batch." };
  if (key === "judge") return {
    steps: ["Evals tab (left rail) → open the eval set parties_val",
      "select the cases (or all) → Run evaluation → in the dialog untick the built-ins, tick everyone_ate → Run",
      "click a party in the result: its score, PASS/FAIL, and the answer that was graded. The 🕓 history icon lists this run and the ones the page made"],
    see: "the same verdicts the 📝 button gave — p1 at 0.60 under the draft. The threshold slider is cosmetic: the bar is 0.9, inside the metric (world.py)." };
  if (key === "flight") return {
    steps: ["Evals → 🕓 history → the exam the flight graded: the eight answers are the final responses in that run",
      "there is no LLM-judge metric configured here on purpose — the flight’s third column is one rubric call per answer in kitchen/flight.py, so you can read exactly what the judge was asked"],
    see: "the same eight final responses the flight table scored. Nothing was re-booked." };
  if (key === "rewrite") return { steps: chat.slice(0, 2).concat(["compare with the answer you got before ⤵ install"]),
    see: kind === "draft" ? "Olive & Thyme, “fits the vibe”. Remember it, install, then ask again."
      : kind === "hacked" ? "the hacked instruction is installed (course VI) — ↺ back to the winner first."
      : `under the ${kind === "optimized" ? "optimized" : "winner"} instruction: a room every seat can eat at, and a reason that names Tom’s cap and Lena’s last orders.` };
  if (key === "other") return {
    steps: chat.slice(0, 2).concat(["Evals → parties_val → Run evaluation with rating, then once more with everyone_ate (or open 🕓 history: the page’s two runs are there)"]),
    see: kind === "hacked" ? "Smoke & Barrel, a reason about ratings — not one person named. rating: 8 PASS. everyone_ate: 1 PASS. The same eight answers."
      : "install the hacked instruction on the page first." };
  if (key === "loop") return { steps: ["nothing to do here — the loop is its own graph (loop/flywheel.py) with its own host node; the host you chat with here is untouched"], see: "nothing new for this course." };
  return { steps: ["Evals → 🕓 history: every exam you ran, in order, with the metric that graded each — the CLI’s, the page’s, and pytest’s"], see: "the whole evening, as ADK recorded it." };
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
      const c = want >= 1 && want <= LAST ? want : parseInt(localStorage.getItem(CH_KEY) || "1", 10);
      if (c >= 1 && c <= LAST) setCourse(c);
    } catch { if (want >= 1 && want <= LAST) setCourse(want); }
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
      setNudge(`instruction changed (${k}) — compare in adk web`);
      setToast(`installed: ${k}`);
    } else if (lastBig.type === "exam_scored") {
      setNudge(`exam done — it is in adk web’s history too`);
    } else if (lastBig.type === "file_saved" && String(lastBig.path).includes("eval_config")) {
      setNudge(`criteria changed — the next exam uses it`);
    } else if (lastBig.type === "pytest_done") {
      setNudge(`pytest ran — its run is in adk web’s history too`);
      setToast(`pytest: ${lastBig.green ? "green" : "red"} · ${lastBig.line}`);
    } else if (lastBig.type === "flight_judged") {
      setToast(`flight: comparator ${lastBig.comparator_passed} · checker ${lastBig.checker_passed} · llm ${lastBig.llm_passed} of ${lastBig.n}`);
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
  const litCount = Object.keys(lit).filter((k) => k !== String(LAST) && lit[k]).length;
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
          <span className="resv"><img src="/art/concierge.jpg" alt="" /><span><b>{name || "a guest"}</b> · party {party} · {litCount} / {LAST - 1} served</span></span>
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

      <Workbench open={drawer} onClose={() => openDrawer(false)} guide={wbGuide(course, p)} course={course} />
      {check && <Check p={p} name={name} onClose={() => setCheck(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

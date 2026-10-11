"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { eventsUrl, type Ev } from "./api";

/** The table is a projection of the kitchen's event log. This hook keeps the
 *  log (recent history, then live) and folds the latest episode into the
 *  state the stage renders. Nothing here computes a score. */

export type Seat = { id: string; name: string; label: string; ate?: boolean; why?: string; flash?: boolean };
export type Folded = {
  connected: boolean; episode: number; kind: string;
  people: Seat[]; party: string;
  pick: { restaurant: string; restaurant_name: string; rating: number; time: string; reason: string; instruction: string; judge: string } | null;
  scored: { judge: string; score: number; ate: number | null; total: number; passed: boolean; threshold: number; honest?: number; rating?: number; hungry?: number } | null;
  climbs: { round: number; score: number; baseline?: number }[];
  candidate: { candidate_id: string; diff: { op: string; line: string }[]; proposer: string } | null;
  gate: { decision: string; score: number; why: string } | null;
  exam: { passed: number | null; failed: number | null; hungry: number | null; seats: number | null; judge: string; criteria: string[]; instruction: string } | null;
  outcomes: { person_id: string; why: string }[];
  minted: { case_id: string; from_outcome: string }[];
  error: string | null; done: boolean; running: boolean;
  log: Ev[];
};

const BIG = new Set(["pick_proposed", "party_scored", "candidate_proposed", "holdout_scored", "gate_decided", "judge_switched",
  "outcome_returned", "exam_minted", "exam_scored", "episode_done", "error"]);

export function useEvents(): Folded {
  const [log, setLog] = useState<Ev[]>([]);
  const [connected, setConnected] = useState(false);
  const seen = useRef(-1);

  useEffect(() => {
    let es: EventSource | null = null;
    let dead = false;
    const open = () => {
      if (dead) return;
      es = new EventSource(eventsUrl());
      es.onopen = () => setConnected(true);
      es.onmessage = (m) => {
        try {
          const ev = JSON.parse(m.data) as Ev;
          if (ev.i <= seen.current) return;
          seen.current = ev.i;
          setLog((p) => [...p.slice(-600), ev]);
        } catch { /* keep-alive */ }
      };
      es.onerror = () => { setConnected(false); es?.close(); setTimeout(open, 2000); };
    };
    open();
    return () => { dead = true; es?.close(); };
  }, []);

  return useMemo(() => fold(log, connected), [log, connected]);
}

function fold(log: Ev[], connected: boolean): Folded {
  const episode = log.length ? Math.max(...log.map((e) => e.ep)) : 0;
  const ev = log.filter((e) => e.ep === episode);
  const start = ev.find((e) => e.type === "episode_started");
  const kind = (start?.kind as string) || "";
  const seated = last(ev, "party_seated");
  const people = ((seated?.people as Seat[]) || []).map((p) => ({ ...p }));
  const lastPickIdx = lastIndex(ev, "pick_proposed");
  const seatMap: Record<string, Ev> = {};
  ev.slice(lastPickIdx + 1).forEach((e) => { if (e.type === "seat_scored") seatMap[e.person_id as string] = e; });
  const outcomes = ev.filter((e) => e.type === "outcome_returned").map((e) => ({ person_id: e.person_id as string, why: e.why as string }));
  for (const p of people) {
    const s = seatMap[p.id];
    if (s) { p.ate = Boolean(s.ate); p.why = s.why as string; }
    if (outcomes.some((o) => o.person_id === p.id)) { p.flash = true; p.why = outcomes.find((o) => o.person_id === p.id)?.why; }
  }
  const pickEv = lastPickIdx >= 0 ? ev[lastPickIdx] : null;
  const scoredEv = lastWhere(ev.slice(lastPickIdx + 1), (e) => e.type === "party_scored");
  const examEv = last(ev, "exam_scored");
  const gateEv = last(ev, "gate_decided");
  const candEv = last(ev, "candidate_proposed");
  const err = last(ev, "error");
  const done = ev.some((e) => e.type === "episode_done");
  return {
    connected, episode, kind, people, party: (seated?.party_id as string) || (start?.party as string) || "",
    pick: pickEv ? (pickEv as unknown as Folded["pick"]) : null,
    scored: scoredEv ? (scoredEv as unknown as Folded["scored"]) : null,
    climbs: ev.filter((e) => e.type === "holdout_scored").map((e) => ({ round: e.round as number, score: e.score as number, baseline: e.baseline as number })),
    candidate: candEv ? (candEv as unknown as Folded["candidate"]) : null,
    gate: gateEv ? (gateEv as unknown as Folded["gate"]) : null,
    exam: examEv ? (examEv as unknown as Folded["exam"]) : null,
    outcomes,
    minted: ev.filter((e) => e.type === "exam_minted").map((e) => ({ case_id: e.case_id as string, from_outcome: e.from_outcome as string })),
    error: err ? (err.message as string) : null,
    done,
    running: Boolean(start) && !done,
    log,
  };
}

const last = (ev: Ev[], type: string) => { for (let i = ev.length - 1; i >= 0; i--) if (ev[i].type === type) return ev[i]; return null; };
const lastIndex = (ev: Ev[], type: string) => { for (let i = ev.length - 1; i >= 0; i--) if (ev[i].type === type) return i; return -1; };
const lastWhere = (ev: Ev[], f: (e: Ev) => boolean) => { for (let i = ev.length - 1; i >= 0; i--) if (f(ev[i])) return ev[i]; return null; };
export const isBig = (t: string) => BIG.has(t);

// Where the kitchen is. Same origin when the page is served by it (the normal
// case); NEXT_PUBLIC_TABLE_ORIGIN when `npm run dev` runs the page on its own.
export const ORIGIN = process.env.NEXT_PUBLIC_TABLE_ORIGIN || "";
const API = "/api";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${ORIGIN}${API}${path}`, { cache: "no-store", ...init });
  if (!r.ok) {
    let msg = `${r.status} from ${path}`;
    try { const b = await r.json(); if (b?.detail) msg = String(b.detail); } catch { /* keep */ }
    throw new Error(msg);
  }
  return r.json();
}
const post = <T,>(path: string, body: unknown, method = "POST") =>
  j<T>(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export type Exam = { ts?: number; judge: string; criteria: string[]; instruction: string; passed: number | null; failed: number | null;
  hungry: number | null; seats: number | null; parties?: { party: string; restaurant: string; time: string; score: number; hungry: number | null; answer?: string | null }[] };
export type FlightSummary = { ts?: number; n: number; comparator_passed: number; checker_passed: number; llm_passed: number; llm_unanswered: number;
  fed_but_failed_text: string[]; hungry_but_passed_text: string[]; llm_disagrees: string[]; instruction: string; from_exam_ts: number | null; ms: number; party?: string | null;
  same_as_last: { comparator: boolean; checker: boolean; llm: boolean } | null };
export type Progress = {
  code: { criteria: string[]; honest_on_exam: boolean; instruction: string; instruction_chars: number; edge: boolean; engine: string;
    library: Record<string, boolean> };
  lit: Record<string, boolean>;
  judge: "everyone_ate" | "rating";
  workbench_calls: number;
  last_exam: Exam | null; exams: Exam[];
  loops: { ts?: number; rounds: number; decision: string | null; score: number | null; closed: boolean; edge: boolean }[];
  harvest: { minted: number; skipped: number; ts: number | null };
  walks: { ts: number; party: string; restaurant: string; restaurant_name: string; time: string; score: number; passed: boolean; threshold: number;
    guessed: number; correct: number; seats: number; us: number; detail: WalkSeat[]; checks: string[] }[];
  flights: (FlightSummary & { rows?: FlightRow[] })[];
  last_booking: Record<string, unknown> | null;
  optimized: boolean; mode: string; error: string | null;
};
export const getProgress = () => j<Progress>("/progress").catch(() => null);

export type CodeFile = { path: string; symbol?: string; span?: number[]; content: string;
  validation: { valid: boolean; message: string; line?: number | null } };
export const readCode = (path: string, symbol?: string) =>
  j<CodeFile>(`/code?path=${encodeURIComponent(path)}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ""}`);
export const writeCode = (path: string, content: string, symbol?: string) => post<CodeFile>("/code", { path, content, symbol });

export const book = (party: string) => post<Record<string, unknown>>("/book", { party });
export const setJudge = (to: "everyone_ate" | "rating") => post<{ judge: string }>("/judge", { to });
export const install = (which: string) => post<{ installed: string; chars: number; kind: string }>("/install", { which });
export const getBrief = (party: string) => j<{ party: string; brief: string }>(`/brief?party=${party}`);

export type Job = { kind: string; state: "idle" | "running" | "done" | "error"; rc: number | null; started: number; ended: number;
  elapsed: number; log: string[]; summary: Record<string, unknown>; meta: Record<string, unknown>; episode: number | null };
export const startJob = (kind: string, opts: Record<string, unknown> = {}) => post<Job>("/job", { kind, ...opts });
export const getJob = (kind: string) => j<Job>(`/job?kind=${kind}`);
export const stopJob = (kind: string) => j<{ stopped: boolean }>(`/job?kind=${kind}`, { method: "DELETE" });

// course III · 🍽 the walk
export type WalkSeat = { id: string; name: string; label: string; ate: boolean; why: string; check: string; predicted?: boolean | null; correct?: boolean | null };
export type WalkReply = { party: string; restaurant: string | null; restaurant_name?: string; time: string | null; checks: string[];
  people: { id: string; name: string; label: string }[]; seats: WalkSeat[]; score: number; passed: boolean; threshold: number; correct: number; guessed: number; us: number };
export const getWalk = (party: string) => j<WalkReply>(`/walk?party=${party}`);
export const walkTable = (party: string, restaurant: string, time: string, predicted: Record<string, boolean>) => post<WalkReply>("/walk", { party, restaurant, time, predicted });

// course IV · ⚖ the flight
export type Verdict = { score: number; passed: boolean; needs: string; why: string; restaurant?: string; time?: string; ms?: number };
export type FlightRow = { party: string; answer: string; golden: string; comparator: Verdict; checker: Verdict; llm: Verdict & { passed: boolean | null; score: number | null } };
export type FlightReply = { rows: FlightRow[]; summary: FlightSummary };
export const judgeFlight = (party?: string) => post<FlightReply>("/flight", party ? { party } : {});

export type Env = { HOST_ENGINE: string; project: string; mode: string };
export const getEnv = () => j<Env>("/env");
export const setEnv = (engine: string) => post<Env>("/env", { HOST_ENGINE: engine });

export type Ev = Record<string, unknown> & { i: number; ep: number; t: number; type: string };
export const eventsUrl = () => `${ORIGIN}${API}/events`;

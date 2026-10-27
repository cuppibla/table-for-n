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

export type Exam = { ts?: number; replayed?: boolean; judge: string; criteria: string[]; instruction: string; passed: number | null; failed: number | null;
  hungry: number | null; seats: number | null; parties?: { party: string; restaurant: string; time: string; score: number; hungry: number | null; answer?: string | null }[] };
export type FlightSummary = { ts?: number; n: number; comparator_passed: number; checker_passed: number; llm_passed: number; llm_unanswered: number;
  fed_but_failed_text: string[]; hungry_but_passed_text: string[]; llm_disagrees: string[]; instruction: string; from_exam_ts: number | null; ms: number; party?: string | null;
  same_as_last: { comparator: boolean; checker: boolean; llm: boolean } | null };
// the second seating · one maître d' exam (course X's paths, course XI's talks)
export type Rule = { rule: string; ok: boolean; why: string };
export type Metric = { status: "PASSED" | "FAILED" | "NOT_EVALUATED"; score: number | null };
export type Turn = { user: string; calls: string[]; reply: string };
export type SeatingRow = { party: string; status: string; metrics: Record<string, Metric>; turns: number;
  judges: Record<string, boolean>; rules: Rule[]; restaurant: string | null; time: string | null; hungry: number | null; whys: string[]; calls: string[];
  heard?: string[] | null; missed?: string[] | null; booked_on_turn?: number | null;
  rubrics?: { id: string; score: number | null; why: string }[]; transcript?: Turn[] };
export type Seating = { ts?: number; replayed?: boolean; suite: "paths" | "talks"; agent: string; criteria: string[]; instruction: string;
  passed: number | null; failed: number | null; n: number; by_metric: Record<string, { passed: number; failed: number }>;
  hungry: number | null; seats: number | null; lucky: number; ladder?: Record<string, number>;
  persona?: string | null; rushed?: number; stand_in_slipped?: number; turns?: number; parties?: SeatingRow[] };
export type MaitreBooking = { ts?: number; party: string; restaurant: string; time: string; honest: number; hungry: number; instruction: string;
  agent: "maitre_d"; graded: "reservation" | "reply"; calls: string[]; path: { passed: boolean; broken: string[]; rules?: Rule[] } };
export type Progress = {
  code: { criteria: string[]; honest_on_exam: boolean; instruction: string; instruction_chars: number; edge: boolean; engine: string;
    library: Record<string, boolean>;
    path_criteria?: string[]; path_on_exam?: boolean; persona?: string | null; maitre_instruction?: string; maitre_library?: Record<string, boolean> };
  lit: Record<string, boolean>;
  judge: "everyone_ate" | "rating";
  workbench_calls: number; maitre_calls?: number;
  last_exam: Exam | null; exams: Exam[];
  loops: { ts?: number; replayed?: boolean; rounds: number; decision: string | null; score: number | null; closed: boolean; edge: boolean }[];
  harvest: { minted: number; skipped: number; ts: number | null };
  flights: (FlightSummary & { rows?: FlightRow[] })[];
  paths?: Seating[]; talks?: Seating[];
  last_booking: Record<string, unknown> | null;
  last_maitre_booking?: MaitreBooking | null;
  optimized: boolean; mode: string; error: string | null;
};
export const getProgress = () => j<Progress>("/progress").catch(() => null);

export type CodeFile = { path: string; symbol?: string; span?: number[]; content: string;
  validation: { valid: boolean; message: string; line?: number | null } };
export const readCode = (path: string, symbol?: string) =>
  j<CodeFile>(`/code?path=${encodeURIComponent(path)}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ""}`);
export const writeCode = (path: string, content: string, symbol?: string) => post<CodeFile>("/code", { path, content, symbol });

/** `agent` is "host" (the first seating) or "maitre_d" (the second). */
export type Agent = "host" | "maitre_d";
export const book = (party: string, agent: Agent = "host") => post<Record<string, unknown>>("/book", { party, agent });
export const setJudge = (to: "everyone_ate" | "rating") => post<{ judge: string }>("/judge", { to });
export const install = (which: string, agent: Agent = "host") => post<{ installed: string; chars: number; kind: string }>("/install", { which, agent });
export const getBrief = (party: string, agent: Agent = "host") => j<{ party: string; brief: string }>(`/brief?party=${party}&agent=${agent}`);

export type Job = { kind: string; state: "idle" | "running" | "done" | "error"; rc: number | null; started: number; ended: number;
  elapsed: number; log: string[]; summary: Record<string, unknown>; meta: Record<string, unknown>; episode: number | null };
export const startJob = (kind: string, opts: Record<string, unknown> = {}) => post<Job>("/job", { kind, ...opts });
export const getJob = (kind: string) => j<Job>(`/job?kind=${kind}`);
export const stopJob = (kind: string) => j<{ stopped: boolean }>(`/job?kind=${kind}`, { method: "DELETE" });

// course IV · ⚖ the flight
export type Verdict = { score: number; passed: boolean; needs: string; why: string; restaurant?: string; time?: string; ms?: number };
export type FlightRow = { party: string; answer: string; golden: string; comparator: Verdict; checker: Verdict; llm: Verdict & { passed: boolean | null; score: number | null } };
export type FlightReply = { rows: FlightRow[]; summary: FlightSummary };
export const judgeFlight = (party?: string) => post<FlightReply>("/flight", party ? { party } : {});

// course X · ⚖ eight paths to one dinner, every judge on each
export type PathRow = { id: string; label: string; note: string; calls: { name: string; args: Record<string, unknown> }[];
  reply: { restaurant: string; time: string }; comparator: Record<string, number>; path: { passed: boolean; rules: Rule[] };
  everyone_ate: { booking: number; reply: number; hungry: string[] };
  llm: { score: number | null; passed: boolean | null; why: string; ms?: number } | null };
export type PathsCard = { party: string; people: string[]; golden: { name: string; args: Record<string, unknown> }[]; right_answers: number;
  matches: string[]; rows: PathRow[]; judged: boolean };
export const getPaths = (judge = false) => j<PathsCard>(`/paths?judge=${judge ? 1 : 0}`);

// ⤵ replay — our recorded runs, for a project that is out of quota
export type Replay = { recorded: string; model: string; now: { judge: string; instruction: string }; available: boolean; loop_available: boolean;
  recorded_second?: string | null; seating_now?: { path_criteria: string[]; persona: string | null; instruction: string }; path_available?: boolean; talk_available?: boolean };
export const getReplay = () => j<Replay>("/replay");
export const replay = (what: "exam" | "loop" | "path" | "talk") => post<Record<string, unknown>>("/replay", { what });

export type Env = { HOST_ENGINE: string; project: string; mode: string };
export const getEnv = () => j<Env>("/env");
export const setEnv = (engine: string) => post<Env>("/env", { HOST_ENGINE: engine });

export type Ev = Record<string, unknown> & { i: number; ep: number; t: number; type: string };
export const eventsUrl = () => `${ORIGIN}${API}/events`;

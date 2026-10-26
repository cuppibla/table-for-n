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

export type ToolCall = { name: string; args: Record<string, unknown> };
export type Exam = { ts?: number; replayed?: boolean; judge: string; criteria: string[]; instruction: string; passed: number | null; failed: number | null;
  hungry: number | null; seats: number | null; parties?: { party: string; status?: string | null; restaurant: string | null; time: string | null; score: number; hungry: number | null; whys?: string[]; answer?: string | null }[] };

export type TrajParty = {
  party: string; status?: string | null; score?: number | null; metric?: string | null; answer?: string | null;
  calls: ToolCall[]; expected_calls: ToolCall[];
  restaurant: string | null; time: string | null; hungry: number;
  checks: Record<string, boolean>; whys: string[];
  judges: {
    exact: { ok: boolean; why: string };
    in_order: { ok: boolean; why: string };
    any_order: { ok: boolean; why: string };
    ticket: { ok: boolean; score: number; whys: string[] };
  };
};
export type TrajExam = {
  ts?: number; replayed?: boolean; judge: string; criteria: string[]; instruction: string;
  passed: number | null; failed: number | null; hungry: number | null; seats: number | null;
  exact_passed?: number; in_order_passed?: number; any_order_passed?: number; ticket_passed?: number;
  parties?: TrajParty[];
};

export type MtTurn = { user: string; tools: ToolCall[]; agent: string; eval_status?: string };
export type MtParty = {
  party: string; status?: string | null; score?: number | null;
  elicited: boolean; booked_turn_1: boolean; turn_count: number;
  turns: MtTurn[]; restaurant: string | null; time: string | null;
  hungry: number; whys: string[];
};
export type MtExam = {
  ts?: number; replayed?: boolean; judge: string; criteria: string[]; instruction: string;
  passed: number | null; failed: number | null; hungry: number | null; seats: number | null;
  elicited_count?: number; parties?: MtParty[];
};

export type FlightSummary = { ts?: number; n: number; comparator_passed: number; checker_passed: number; llm_passed: number; llm_unanswered: number;
  fed_but_failed_text: string[]; hungry_but_passed_text: string[]; llm_disagrees: string[]; instruction: string; from_exam_ts: number | null; ms: number; party?: string | null;
  same_as_last: { comparator: boolean; checker: boolean; llm: boolean } | null };
export type Progress = {
  code: { criteria: string[]; honest_on_exam: boolean; instruction: string; instruction_chars: number; edge: boolean; engine: string;
    traj_criteria?: string[]; ticket_on_exam?: boolean; concierge_instruction?: string;
    library: Record<string, boolean> };
  lit: Record<string, boolean>;
  judge: "everyone_ate" | "rating";
  workbench_calls: number;
  last_exam: Exam | null; exams: Exam[];
  last_traj_exam?: TrajExam | null; traj_exams?: TrajExam[];
  last_mt_exam?: MtExam | null; mt_exams?: MtExam[];
  loops: { ts?: number; replayed?: boolean; rounds: number; decision: string | null; score: number | null; closed: boolean; edge: boolean }[];
  harvest: { minted: number; skipped: number; ts: number | null };
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
export const install = (which: string, target: "host" | "concierge" = "host") =>
  post<{ installed: string; chars: number; kind: string }>("/install", { which, target });
export const getBrief = (party: string) => j<{ party: string; brief: string }>(`/brief?party=${party}`);

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

// ⤵ replay — our recorded runs, for a project that is out of quota
export type Replay = {
  recorded: string; model: string;
  now: { judge: string; instruction: string }; available: boolean; loop_available: boolean;
  traj_now?: { judge: string }; traj_available?: boolean;
  mt_now?: { instruction: string }; mt_available?: boolean;
};
export const getReplay = () => j<Replay>("/replay");
export const replay = (what: "exam" | "loop" | "traj_exam" | "mt_exam") => post<Record<string, unknown>>("/replay", { what });

export type Env = { HOST_ENGINE: string; project: string; mode: string };
export const getEnv = () => j<Env>("/env");
export const setEnv = (engine: string) => post<Env>("/env", { HOST_ENGINE: engine });

export type Ev = Record<string, unknown> & { i: number; ep: number; t: number; type: string };
export const eventsUrl = () => `${ORIGIN}${API}/events`;

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
export type Progress = {
  code: { criteria: string[]; honest_on_exam: boolean; instruction: string; instruction_chars: number; edge: boolean; engine: string;
    library: Record<string, boolean>; analytics?: boolean; dataset?: string; project?: string };
  lit: Record<string, boolean>;
  judge: "everyone_ate" | "rating";
  workbench_calls: number;
  last_exam: Exam | null; exams: Exam[];
  loops: { ts?: number; replayed?: boolean; rounds: number; decision: string | null; score: number | null; closed: boolean; edge: boolean }[];
  harvest: { minted: number; skipped: number; graded?: number; ts: number | null; source?: string | null };
  receipts?: number;
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

// course IV · ⚖ the flight
export type Verdict = { score: number; passed: boolean; needs: string; why: string; restaurant?: string; time?: string; ms?: number };
export type FlightRow = { party: string; answer: string; golden: string; comparator: Verdict; checker: Verdict; llm: Verdict & { passed: boolean | null; score: number | null } };
export type FlightReply = { rows: FlightRow[]; summary: FlightSummary };
export const judgeFlight = (party?: string) => post<FlightReply>("/flight", party ? { party } : {});

// ⤵ replay — our recorded runs, for a project that is out of quota
export type Replay = { recorded: string; model: string; now: { judge: string; instruction: string }; available: boolean; loop_available: boolean };
export const getReplay = () => j<Replay>("/replay");
export const replay = (what: "exam" | "loop") => post<Record<string, unknown>>("/replay", { what });

export type Env = { HOST_ENGINE: string; project: string; mode: string; BQ_ANALYTICS_DATASET?: string; BQ_ANALYTICS_TABLE?: string; BQ_ANALYTICS_LOCATION?: string };
export const getEnv = () => j<Env>("/env");
export const setEnv = (engine: string) => post<Env>("/env", { HOST_ENGINE: engine });
export const setDataset = (dataset: string) => post<Env>("/env", { BQ_ANALYTICS_DATASET: dataset });

// course IX · 🧾 the receipt — one booking, read back out of BigQuery's v_eval_turn
export type ReceiptTurn = { session_id: string; invocation_id: string; user_id: string; turn_start: string | null; eval_ready: boolean;
  has_error: boolean; tool_error_count: number; llm_error_count: number; agent_error_count: number; has_tool_loop: boolean; has_truncated_content: boolean;
  distinct_tools_used: number; total_prompt_tokens: number; total_completion_tokens: number; total_tokens: number; turn_latency_ms: number; trace_bytes: number;
  trace: { agents: Record<string, { instruction: string; tools: number }>; events: { author: string; kind: string; text: string; at?: string }[] } };
export type Receipt = { ok: boolean; session: string; turns: ReceiptTurn[]; rows: number; waited: number; error: string | null; view: string; table: string;
  project: string; dataset: string };
export const getReceipt = (session?: string, wait = 20) => j<Receipt>(`/receipt?wait=${wait}${session ? `&session=${encodeURIComponent(session)}` : ""}`);

export type Ev = Record<string, unknown> & { i: number; ep: number; t: number; type: string };
export const eventsUrl = () => `${ORIGIN}${API}/events`;

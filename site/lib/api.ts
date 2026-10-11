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
  hungry: number | null; seats: number | null; parties?: { party: string; restaurant: string; time: string; score: number; hungry: number | null }[] };
export type Progress = {
  code: { criteria: string[]; honest_on_exam: boolean; instruction: string; instruction_chars: number; edge: boolean; engine: string;
    library: Record<string, boolean> };
  lit: Record<string, boolean>;
  judge: "everyone_ate" | "rating";
  workbench_calls: number;
  last_exam: Exam | null; exams: Exam[];
  loops: { ts?: number; rounds: number; decision: string | null; score: number | null; closed: boolean; edge: boolean }[];
  harvest: { minted: number; skipped: number; ts: number | null };
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

export type Env = { HOST_ENGINE: string; project: string; mode: string };
export const getEnv = () => j<Env>("/env");
export const setEnv = (engine: string) => post<Env>("/env", { HOST_ENGINE: engine });

export type Ev = Record<string, unknown> & { i: number; ep: number; t: number; type: string };
export const eventsUrl = () => `${ORIGIN}${API}/events`;

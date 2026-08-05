import type { SupabaseClient } from "@supabase/supabase-js";
import type { Identity } from "./identity";

// Copy-paste through a dashboard, a chat client or a rich-text editor smuggles in
// characters the value cannot legally contain: smart quotes, zero-width joiners, a
// BOM, a non-breaking space. Anything above U+00FF makes fetch throw
//   "Failed to execute 'set' on 'Headers': String contains non ISO-8859-1 code point"
// which reads like a network fault and is not one. Both values have a known, narrow
// alphabet, so anything outside it is paste damage and is removed.
const clean = (v: string | undefined, allowed: RegExp): string | undefined => {
  if (!v) return undefined;
  const trimmed = v.trim().replace(/^['"]|['"]$/g, "");
  const kept = trimmed.replace(allowed, "");
  if (kept !== trimmed) {
    console.warn(
      `[misere-desk] stripped ${trimmed.length - kept.length} illegal character(s) from an env value; ` +
        "re-paste it as plain text to silence this.",
    );
  }
  return kept || undefined;
};

// JWTs and sb_publishable_* keys are base64url plus dots. Nothing else is valid.
const url = clean(import.meta.env.VITE_SUPABASE_URL as string | undefined, /[^\x21-\x7E]/g);
const anon = clean(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined, /[^A-Za-z0-9._-]/g);

// Un-substituted placeholders are NOT configuration. Without this the app believes
// it is live, points at a host that does not resolve, and every claim/submit fails.
const PLACEHOLDER = /YOURPROJECT|YOUR_ANON_KEY|your-project|<.*>/i;

/** Why the client is not live, in words a human can act on. Empty string = live. */
export function configProblem(): string {
  if (!url && !anon) return "no VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in this build";
  if (!url) return "VITE_SUPABASE_URL is missing from this build";
  if (!anon) return "VITE_SUPABASE_ANON_KEY is missing from this build";
  if (PLACEHOLDER.test(url) || PLACEHOLDER.test(anon)) return "the env vars still hold placeholder values";
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return `VITE_SUPABASE_URL is not https (${u.protocol})`;
  } catch {
    return "VITE_SUPABASE_URL is not a valid URL";
  }
  return "";
}

const configured = configProblem() === "";
if (!configured) {
  console.warn(`[misere-desk] local fallback registry: ${configProblem()}`);
}

// ponytail: when env vars are absent (local dev, pre-provisioning) every call
// falls back to a localStorage registry with the same shapes. Set the two env
// vars and run supabase/migrations/0001_init.sql and this file goes live unchanged.
// supabase-js is dynamically imported so it stays out of the first-paint bundle.
export const isLive = configured;
export const backend = () => (isLive ? new URL(url!).host : "local fallback");

/**
 * Length + last six characters of the key this BUILD is using. Publishable keys
 * are not secrets (RLS is the control), and without this a wrong value in a
 * hosting dashboard can only be diagnosed by guesswork. Compare against the
 * value in the Supabase dashboard: a mismatch means the env var is mangled.
 */
export const keyFingerprint = () =>
  anon ? `len ${anon.length} …${anon.slice(-6)}` : "absent";

let sbPromise: Promise<SupabaseClient> | null = null;
const getSb = (): Promise<SupabaseClient> | null => {
  if (!isLive) return null;
  sbPromise ??= import("@supabase/supabase-js").then((m) =>
    m.createClient(url!, anon!, {
      auth: { persistSession: false },
      // Fail fast and say so, rather than hanging on a carrier that is
      // swallowing the connection (roaming, captive portals, filtered DNS).
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(12_000) }),
      },
    }),
  );
  return sbPromise;
};

/** Turn whatever the client threw into one actionable line. */
export function describeError(e: unknown): string {
  if (!isLive) return `not connected: ${configProblem()}`;
  const err = e as { message?: string; code?: string; details?: string; hint?: string };
  const bits = [err?.code, err?.message || String(e), err?.details].filter(Boolean);
  return bits.join(" — ").slice(0, 200);
}

export interface GameReport {
  mode: "misere" | "normal" | "eris" | "duel";
  pnl: number;
  sharpEdge: number;
  noiseEdge: number;
  invPnl: number;
  nFills: number;
  nSharp: number;
  avgSpread: number;
  avgSkew: number;
  durationMs: number;
  dailyDate?: string; // ISO date, only for scored daily runs
}

export interface LeaderRow {
  handle: string;
  best_misere: number | null;
  best_normal: number | null;
  games: number;
}

export interface TelemetryRow extends GameReport {
  created_at: string;
}

// ---- local fallback store ----
const LB = "md:local:players";
const TL = "md:local:telemetry";
const read = <T,>(k: string, d: T): T => {
  try { return JSON.parse(localStorage.getItem(k) || "") as T; } catch { return d; }
};
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

type LocalPlayers = Record<string, { secret_hash: string; best_misere: number | null; best_normal: number | null; games: number }>;

export async function claimHandle(handle: string, secretHash: string): Promise<boolean> {
  const sbp = getSb();
  if (sbp) {
    const sb = await sbp;
    const { data, error } = await sb.rpc("claim_handle", { p_handle: handle, p_secret_hash: secretHash });
    if (error) throw error;
    return data === true;
  }
  const players = read<LocalPlayers>(LB, {});
  if (players[handle]) return false;
  players[handle] = { secret_hash: secretHash, best_misere: null, best_normal: null, games: 0 };
  write(LB, players);
  return true;
}

export async function submitGame(id: Identity, secretHash: string, r: GameReport): Promise<boolean> {
  const sbp = getSb();
  if (sbp) {
    const sb = await sbp;
    const { data, error } = await sb.rpc("submit_game", {
      p_handle: id.handle, p_secret_hash: secretHash, p_mode: r.mode,
      p_pnl: r.pnl, p_sharp: r.sharpEdge, p_noise: r.noiseEdge, p_inv: r.invPnl,
      p_fills: r.nFills, p_nsharp: r.nSharp, p_spread: r.avgSpread, p_skew: r.avgSkew,
      p_duration: r.durationMs, p_daily_date: r.dailyDate ?? null,
    });
    if (error) throw error;
    return data === true;
  }
  const players = read<LocalPlayers>(LB, {});
  const p = players[id.handle];
  if (!p || p.secret_hash !== secretHash) return false;
  const rows = read<TelemetryRow[]>(TL, []);
  if (r.dailyDate && rows.some((x) => x.mode === r.mode && x.dailyDate === r.dailyDate)) return false;
  rows.push({ ...r, created_at: new Date().toISOString() });
  write(TL, rows);
  const score = r.mode === "misere" ? -r.pnl : r.pnl;
  p.games += 1;
  if (r.mode === "misere") p.best_misere = Math.max(p.best_misere ?? -Infinity, score);
  if (r.mode === "normal") p.best_normal = Math.max(p.best_normal ?? -Infinity, score);
  write(LB, players);
  return true;
}

export async function fetchLeaderboard(): Promise<LeaderRow[]> {
  const sbp = getSb();
  if (sbp) {
    const sb = await sbp;
    const { data, error } = await sb
      .from("players")
      .select("handle,best_misere,best_normal,games")
      .not("best_misere", "is", null)
      .order("best_misere", { ascending: false })
      .limit(10);
    if (error) throw error;
    return data as LeaderRow[];
  }
  const players = read<LocalPlayers>(LB, {});
  return Object.entries(players)
    .filter(([, p]) => p.best_misere !== null)
    .map(([handle, p]) => ({ handle, ...p }))
    .sort((a, b) => (b.best_misere ?? 0) - (a.best_misere ?? 0))
    .slice(0, 10);
}

export async function fetchMyTelemetry(id: Identity, secretHash: string): Promise<TelemetryRow[]> {
  const sbp = getSb();
  if (sbp) {
    const sb = await sbp;
    const { data, error } = await sb.rpc("my_telemetry", { p_handle: id.handle, p_secret_hash: secretHash });
    if (error) throw error;
    return (data as Record<string, unknown>[]).map((d) => ({
      mode: d.mode, pnl: Number(d.pnl), sharpEdge: Number(d.sharp_edge), noiseEdge: Number(d.noise_edge),
      invPnl: Number(d.inv_pnl), nFills: Number(d.n_fills), nSharp: Number(d.n_sharp),
      avgSpread: Number(d.avg_spread), avgSkew: Number(d.avg_skew), durationMs: Number(d.duration_ms),
      dailyDate: (d.daily_date as string) ?? undefined, created_at: d.created_at as string,
    })) as TelemetryRow[];
  }
  return read<TelemetryRow[]>(TL, []);
}

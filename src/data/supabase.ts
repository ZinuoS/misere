import type { SupabaseClient } from "@supabase/supabase-js";
import type { Identity } from "./identity";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Un-substituted placeholders are NOT configuration. Without this the app believes
// it is live, points at a host that does not resolve, and every claim/submit fails.
const PLACEHOLDER = /YOURPROJECT|YOUR_ANON_KEY|your-project|<.*>/i;
const configured = Boolean(url && anon && !PLACEHOLDER.test(url) && !PLACEHOLDER.test(anon));
if (url && anon && !configured) {
  console.warn(
    "[misere-desk] VITE_SUPABASE_* still hold placeholder values - running on the local fallback registry.",
  );
}

// ponytail: when env vars are absent (local dev, pre-provisioning) every call
// falls back to a localStorage registry with the same shapes. Set the two env
// vars and run supabase/migrations/0001_init.sql and this file goes live unchanged.
// supabase-js is dynamically imported so it stays out of the first-paint bundle.
export const isLive = configured;
let sbPromise: Promise<SupabaseClient> | null = null;
const getSb = (): Promise<SupabaseClient> | null => {
  if (!isLive) return null;
  sbPromise ??= import("@supabase/supabase-js").then((m) => m.createClient(url!, anon!));
  return sbPromise;
};

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

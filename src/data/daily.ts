import type { TelemetryRow } from "./supabase";

// UTC date, ISO shape — every player worldwide is on the same tape at the same instant
export const todayISO = (now = new Date()) => now.toISOString().slice(0, 10);

const EPOCH = "2026-08-04"; // daily no. 1
export const dailyNumber = (iso: string) =>
  Math.round((Date.parse(iso) - Date.parse(EPOCH)) / 86_400_000) + 1;

// ms until the next UTC midnight
export const msToNextDaily = (now = new Date()) =>
  Date.parse(todayISO(now)) + 86_400_000 - now.getTime();

export const countdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

export interface DailyStats {
  played: number;
  streak: number;
  maxStreak: number;
  best: number | null;
  scores: number[];
}

// stats over scored misère dailies from the player's telemetry
export function dailyStats(rows: TelemetryRow[], today: string): DailyStats {
  const daily = rows.filter((r) => r.mode === "misere" && r.dailyDate);
  const days = [...new Set(daily.map((r) => r.dailyDate!))].sort();
  const scores = daily.map((r) => -r.pnl);
  let maxStreak = 0, run = 0, prev = NaN;
  for (const d of days) {
    const n = dailyNumber(d);
    run = n === prev + 1 ? run + 1 : 1;
    maxStreak = Math.max(maxStreak, run);
    prev = n;
  }
  // current streak counts only if the chain reaches today or yesterday
  const last = days[days.length - 1];
  const gap = last ? dailyNumber(today) - dailyNumber(last) : Infinity;
  return {
    played: days.length,
    streak: gap <= 1 ? run : 0,
    maxStreak,
    best: scores.length ? Math.max(...scores) : null,
    scores,
  };
}

// Histogram over the calibrated tier bands; returns [label, count] rows.
export const HISTOGRAM_BANDS: [number, number, string][] = [
  [-Infinity, 20, "made money"],
  [20, 150, "$20-150"],
  [150, 400, "$150-400"],
  [400, 750, "$400-750"],
  [750, 1200, "$750-1.2k"],
  [1200, 2500, "$1.2k-2.5k"],
  [2500, Infinity, "$2.5k+"],
];

export const histogram = (scores: number[]) =>
  HISTOGRAM_BANDS.map(([lo, hi, label]) => ({
    label,
    n: scores.filter((s) => s >= lo && s < hi).length,
  }));

// ASCII share card — box drawing + block elements only, zero emoji.
// Fill-quality strip: one glyph per fill, sharp fills are X, noise fills are blocks.
export function shareCard(
  dateISO: string,
  score: number,
  d: { sharpEdge: number; noiseEdge: number; invPnl: number; nFills: number; nSharp: number },
  siteUrl: string,
): string {
  const bar = (v: number, max: number) => {
    const n = Math.round(Math.min(Math.abs(v) / (max || 1), 1) * 8);
    return "█".repeat(n) + "░".repeat(8 - n);
  };
  const max = Math.max(Math.abs(d.sharpEdge), Math.abs(d.noiseEdge), Math.abs(d.invPnl), 1);
  const amt = (v: number) => `${v < 0 ? "-" : "+"}$${Math.abs(v).toFixed(2)}`;
  const strip = d.nFills === 0
    ? "no fills - ghost desk"
    : "X".repeat(Math.min(d.nSharp, 20)) + "▓".repeat(Math.min(d.nFills - d.nSharp, 20));
  return [
    `MISERE DESK #${dailyNumber(dateISO)}`,
    score > 0 ? `destroyed $${score.toFixed(2)}` : `made $${(-score).toFixed(2)} (wrong game)`,
    strip,
    `sharps ${bar(d.sharpEdge, max)} ${amt(d.sharpEdge)}`,
    `noise  ${bar(d.noiseEdge, max)} ${amt(d.noiseEdge)}`,
    `drift  ${bar(d.invPnl, max)} ${amt(d.invPnl)}`,
    siteUrl,
  ].join("\n");
}

// The share card's last line. Uses the real origin once deployed, so the card
// always points at wherever this build is actually served from.
export const SITE_URL =
  typeof window !== "undefined" && window.location.origin.startsWith("http")
    ? window.location.origin
    : "https://misere.vercel.app";

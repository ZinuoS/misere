import type { TelemetryRow } from "./supabase";

// local calendar date, ISO shape ("sv" locale formats as YYYY-MM-DD)
export const todayISO = () => new Date().toLocaleDateString("sv");

const EPOCH = "2026-08-04"; // daily no. 1
export const dailyNumber = (iso: string) =>
  Math.round((Date.parse(iso) - Date.parse(EPOCH)) / 86_400_000) + 1;

export interface DailyStats {
  played: number;
  streak: number;
  maxStreak: number;
  best: number | null;
}

// stats over scored misère dailies from the player's telemetry
export function dailyStats(rows: TelemetryRow[], today: string): DailyStats {
  const days = [...new Set(rows.filter((r) => r.mode === "misere" && r.dailyDate).map((r) => r.dailyDate!))].sort();
  const scores = rows.filter((r) => r.mode === "misere" && r.dailyDate).map((r) => -r.pnl);
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
  };
}

// ASCII share card — box drawing + block elements only, zero emoji
export function shareCard(dateISO: string, score: number, sharp: number, noise: number, inv: number): string {
  const bar = (v: number, max: number) => {
    const n = Math.round(Math.min(Math.abs(v) / (max || 1), 1) * 8);
    return "█".repeat(n) + "░".repeat(8 - n);
  };
  const max = Math.max(Math.abs(sharp), Math.abs(noise), Math.abs(inv), 1);
  const title = `MISÈRE DESK №${dailyNumber(dateISO)}`;
  const line = score > 0 ? `destroyed $${score.toFixed(2)}` : `made $${(-score).toFixed(2)}, regrettably`;
  return [
    title,
    dateISO,
    line,
    `sharps ${bar(sharp, max)} ${sharp < 0 ? "−" : "+"}$${Math.abs(sharp).toFixed(2)}`,
    `noise  ${bar(noise, max)} ${noise < 0 ? "−" : "+"}$${Math.abs(noise).toFixed(2)}`,
    `drift  ${bar(inv, max)} ${inv < 0 ? "−" : "+"}$${Math.abs(inv).toFixed(2)}`,
    "the market makers who must lose",
  ].join("\n");
}

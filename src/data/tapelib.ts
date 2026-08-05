// Pure logic for the live worst-movers tape. Shared by the Vercel function
// (api/tape.ts) and the client; no IO here so both sides test in vitest.

export interface Loser {
  t: string;
  pct: number;
}

export interface TapeRow {
  as_of: string; // ISO date of the trading session
  losers: Loser[];
}

/** Most recent weekday (NY time) — holidays deliberately not modeled; the 6h
 *  updated_at window means a holiday costs at most a few redundant API calls. */
export function lastTradingDay(now = new Date()): string {
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  for (let back = 0; back < 7; back++) {
    const d = new Date(ny);
    d.setDate(ny.getDate() - back);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return "1970-01-01"; // unreachable
}

/** Server freshness: skip the API when the row already covers the last session
 *  or was refreshed in the last 6 hours. */
export function isFresh(row: { as_of: string; updated_at: string } | null, now = new Date()): boolean {
  if (!row) return false;
  if (row.as_of === lastTradingDay(now)) return true;
  return now.getTime() - Date.parse(row.updated_at) < 6 * 3600_000;
}

/** Client guard: live data older than 5 calendar days runs the marquee fake-only. */
export const isUsable = (row: TapeRow | null, now = new Date()): row is TapeRow =>
  !!row && Array.isArray(row.losers) && row.losers.length > 0 &&
  now.getTime() - Date.parse(row.as_of) < 5 * 86_400_000;

/** Parse the Alpha Vantage TOP_GAINERS_LOSERS payload into our 300-byte row. */
export function parseAv(av: unknown, filterJunk: boolean): TapeRow | null {
  const d = av as { last_updated?: string; top_losers?: { ticker: string; price: string; change_percentage: string }[] };
  if (!d?.top_losers?.length || !d.last_updated) return null;
  const asOf = d.last_updated.slice(0, 10); // "2026-08-04 16:15:57 US/Eastern"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  const losers = d.top_losers
    .map((l) => ({ t: l.ticker, pct: Number.parseFloat(l.change_percentage), price: Number.parseFloat(l.price) }))
    .filter((l) => l.t && Number.isFinite(l.pct) && l.pct < 0)
    .filter((l) => !filterJunk || l.price >= 5)
    .slice(0, 5)
    .map(({ t, pct }) => ({ t, pct: Math.round(pct * 10) / 10 }));
  return losers.length ? { as_of: asOf, losers } : null;
}

// Live-tape copy states ticker and percentage ONLY, reverent-deadpan. Never
// editorialize about a named company — we celebrate the number, never the victim.
const TEMPLATES = [
  (t: string, pct: number) => `TODAY'S HONOR ROLL: $${t} ${pct}%`,
  (t: string, pct: number) => `REAL ONES: $${t} DOWN ${Math.abs(pct)}% — STUDY THE CRAFT`,
  (t: string, pct: number) => `SOMEWHERE, A DESK ACHIEVED $${t} ${pct}%. ASPIRE.`,
];

export interface MarqueeItem {
  text: string;
  live: boolean;
}

/** Every third marquee item is a real loser; one AS OF disclaimer trails. */
export function buildMarquee(fakes: string[], tape: TapeRow | null): MarqueeItem[] {
  if (!tape) return fakes.map((text) => ({ text, live: false }));
  const items: MarqueeItem[] = [];
  let f = 0, l = 0;
  while (f < fakes.length || l < tape.losers.length) {
    if (items.length % 3 === 2 && l < tape.losers.length) {
      const { t, pct } = tape.losers[l];
      items.push({ text: TEMPLATES[l % TEMPLATES.length](t, pct), live: true });
      l++;
    } else if (f < fakes.length) {
      items.push({ text: fakes[f++], live: false });
    } else {
      const { t, pct } = tape.losers[l];
      items.push({ text: TEMPLATES[l % TEMPLATES.length](t, pct), live: true });
      l++;
    }
  }
  items.push({ text: `EOD DATA, DELAYED — AS OF ${tape.as_of}`, live: true });
  return items;
}

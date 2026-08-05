// Lazy-refresh worst-movers tape. One Supabase row, upserted in place; the
// first visitor after staleness pays ~1s, everyone else reads cache. A race
// between two first visitors costs one redundant API call — acceptable, no lock.
import { isFresh, parseAv } from "../src/data/tapelib";

// env read per-request so tests can stub it; Vercel sets these at deploy time
const env = () => ({
  SUPA: process.env.VITE_SUPABASE_URL,
  ANON: process.env.VITE_SUPABASE_ANON_KEY,
  SERVICE: process.env.SUPABASE_SERVICE_ROLE_KEY, // server only, never in the bundle
  AV_KEY: process.env.ALPHAVANTAGE_KEY, // server only
  FILTER_JUNK: process.env.TAPE_FILTER_JUNK === "true",
});

interface StoredRow { as_of: string; losers: unknown; updated_at: string }

async function readRow(): Promise<StoredRow | null> {
  const { SUPA, ANON } = env();
  const r = await fetch(`${SUPA}/rest/v1/market_tape?id=eq.1&select=as_of,losers,updated_at`, {
    headers: { apikey: ANON!, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) return null;
  const rows = (await r.json()) as StoredRow[];
  return rows[0] ?? null;
}

export default async function handler(_req: unknown, res: {
  setHeader(k: string, v: string): void;
  status(n: number): { json(b: unknown): void };
}) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=86400");
  try {
    const row = await readRow();
    if (isFresh(row)) {
      return res.status(200).json({ as_of: row!.as_of, losers: row!.losers });
    }

    // stale or missing: refresh from Alpha Vantage, server-side
    const { SUPA, AV_KEY, SERVICE, FILTER_JUNK } = env();
    if (!AV_KEY || !SERVICE) {
      // not provisioned: serve whatever exists; the client treats stale as absent
      return row
        ? res.status(200).json({ as_of: row.as_of, losers: row.losers })
        : res.status(204).json(null);
    }
    const av = await fetch(
      `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${AV_KEY}`,
      { signal: AbortSignal.timeout(8000) },
    ).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const fresh = parseAv(av, FILTER_JUNK);
    if (!fresh) {
      // rate-limited or malformed: fail silently to the stale row / nothing
      return row
        ? res.status(200).json({ as_of: row.as_of, losers: row.losers })
        : res.status(204).json(null);
    }

    await fetch(`${SUPA}/rest/v1/market_tape?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
        "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ id: 1, as_of: fresh.as_of, losers: fresh.losers, updated_at: new Date().toISOString() }),
    }).catch(() => { /* upsert failure only costs the next visitor a refetch */ });

    return res.status(200).json(fresh);
  } catch {
    return res.status(204).json(null); // the marquee must never break on this route
  }
}

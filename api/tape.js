// Lazy-refresh worst-movers tape. Deliberately self-contained plain JS: a TS
// function importing across the /api boundary crashed Vercel's bundler with
// FUNCTION_INVOCATION_FAILED, so the three helpers are duplicated here from
// src/data/tapelib.ts (client keeps its own copies). Keep the two in sync.

function lastTradingDay(now = new Date()) {
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  for (let back = 0; back < 7; back++) {
    const d = new Date(ny);
    d.setDate(ny.getDate() - back);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return "1970-01-01";
}

function isFresh(row, now = new Date()) {
  if (!row) return false;
  if (row.as_of === lastTradingDay(now)) return true;
  return now.getTime() - Date.parse(row.updated_at) < 6 * 3600_000;
}

function parseAv(av, filterJunk) {
  if (!av || !Array.isArray(av.top_losers) || !av.top_losers.length || !av.last_updated) return null;
  const asOf = String(av.last_updated).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  const losers = av.top_losers
    .map((l) => ({ t: l.ticker, pct: Number.parseFloat(l.change_percentage), price: Number.parseFloat(l.price) }))
    .filter((l) => l.t && Number.isFinite(l.pct) && l.pct < 0)
    .filter((l) => !filterJunk || l.price >= 5)
    .slice(0, 10)
    .map(({ t, pct }) => ({ t, pct: Math.round(pct * 10) / 10 }));
  return losers.length ? { as_of: asOf, losers } : null;
}

export default async function handler(_req, res) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=86400");
  try {
    const SUPA = process.env.VITE_SUPABASE_URL;
    const ANON = process.env.VITE_SUPABASE_ANON_KEY;
    const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY; // server only
    const AV_KEY = process.env.ALPHAVANTAGE_KEY; // server only
    const FILTER_JUNK = process.env.TAPE_FILTER_JUNK === "true";

    let row = null;
    try {
      const r = await fetch(`${SUPA}/rest/v1/market_tape?id=eq.1&select=as_of,losers,updated_at`, {
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      });
      if (r.ok) row = (await r.json())[0] ?? null;
    } catch { /* table missing or db down: treat as no cache */ }

    if (isFresh(row)) return res.status(200).json({ as_of: row.as_of, losers: row.losers });

    if (!AV_KEY) {
      return row ? res.status(200).json({ as_of: row.as_of, losers: row.losers }) : res.status(204).end();
    }
    const av = await fetch(
      `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${AV_KEY}`,
      { signal: AbortSignal.timeout(8000) },
    ).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const fresh = parseAv(av, FILTER_JUNK);
    if (!fresh) {
      return row ? res.status(200).json({ as_of: row.as_of, losers: row.losers }) : res.status(204).end();
    }

    if (SERVICE) {
      await fetch(`${SUPA}/rest/v1/market_tape?on_conflict=id`, {
        method: "POST",
        headers: {
          apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
          "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({ id: 1, as_of: fresh.as_of, losers: fresh.losers, updated_at: new Date().toISOString() }),
      }).catch(() => { /* upsert failure only costs the next visitor a refetch */ });
    }

    return res.status(200).json(fresh);
  } catch {
    return res.status(204).end(); // the marquee must never break on this route
  }
}

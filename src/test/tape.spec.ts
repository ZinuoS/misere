import { describe, it, expect, vi, afterEach } from "vitest";
import { buildMarquee, isFresh, isUsable, lastTradingDay, parseAv } from "../data/tapelib";
// @ts-expect-error plain-JS Vercel function, deliberately untyped (see its header comment)
import handler from "../../api/tape.js";

const AV = {
  last_updated: "2026-08-04 16:15:57 US/Eastern",
  top_losers: [
    { ticker: "NXTT", price: "0.11", change_percentage: "-73.3023%" },
    { ticker: "ANSCW", price: "0.0016", change_percentage: "-66.6667%" },
    { ticker: "RNWWW", price: "0.0012", change_percentage: "-65.7143%" },
    { ticker: "PLTZ", price: "11.87", change_percentage: "-58.713%" },
    { ticker: "RITR", price: "0.14", change_percentage: "-57.2557%" },
    { ticker: "XTRA", price: "9.99", change_percentage: "-50%" },
  ],
};

describe("tapelib", () => {
  it("parses Alpha Vantage into the row, top 10", () => {
    const row = parseAv(AV, false)!;
    expect(row.as_of).toBe("2026-08-04");
    expect(row.losers).toHaveLength(6); // fixture has 6; caps at 10
    const eleven = { ...AV, top_losers: Array.from({ length: 14 }, (_, i) => ({ ticker: "T" + i, price: "1", change_percentage: "-" + (50 - i) + "%" })) };
    expect(parseAv(eleven, false)!.losers).toHaveLength(10);
    expect(row.losers[0]).toEqual({ t: "NXTT", pct: -73.3 });
  });

  it("junk filter drops sub-$5 tickers", () => {
    const row = parseAv(AV, true)!;
    expect(row.losers.map((l) => l.t)).toEqual(["PLTZ", "XTRA"]);
  });

  it("rejects empty or malformed payloads", () => {
    expect(parseAv({}, false)).toBeNull();
    expect(parseAv({ last_updated: "junk", top_losers: AV.top_losers }, false)).toBeNull();
    expect(parseAv({ last_updated: AV.last_updated, top_losers: [] }, false)).toBeNull();
  });

  it("freshness: last trading day or a 6-hour window", () => {
    const now = new Date("2026-08-05T18:00:00Z"); // a Wednesday
    expect(lastTradingDay(now)).toBe("2026-08-05");
    expect(lastTradingDay(new Date("2026-08-09T12:00:00Z"))).toBe("2026-08-07"); // Sunday -> Friday
    expect(isFresh(null, now)).toBe(false);
    expect(isFresh({ as_of: "2026-08-05", updated_at: "2026-08-05T01:00:00Z" }, now)).toBe(true);
    expect(isFresh({ as_of: "2026-08-04", updated_at: "2026-08-05T14:00:00Z" }, now)).toBe(true); // <6h
    expect(isFresh({ as_of: "2026-08-04", updated_at: "2026-08-05T02:00:00Z" }, now)).toBe(false);
  });

  it("client drops data older than 5 calendar days", () => {
    const now = new Date("2026-08-10T00:00:00Z");
    expect(isUsable({ as_of: "2026-08-06", losers: [{ t: "A", pct: -1 }] }, now)).toBe(true);
    expect(isUsable({ as_of: "2026-08-01", losers: [{ t: "A", pct: -1 }] }, now)).toBe(false);
    expect(isUsable({ as_of: "2026-08-06", losers: [] }, now)).toBe(false);
    expect(isUsable(null, now)).toBe(false);
  });

  it("marquee: every third item is live, disclaimer trails, fake-only without data", () => {
    const fakes = ["F1", "F2", "F3", "F4", "F5", "F6"];
    const tape = parseAv(AV, false)!;
    const items = buildMarquee(fakes, tape);
    expect(items.filter((i) => i.live)).toHaveLength(7); // 6 losers + AS OF
    expect(items[2].live).toBe(true);
    expect(items[5].live).toBe(true);
    expect(items[2].text).toBe("TODAY'S TOP LOSER: $NXTT -73.3%");
    expect(items[5].text).toBe("ALSO DOWN TODAY: $ANSCW -66.7%");
    expect(items.at(-1)!.text).toBe("EOD DATA, DELAYED — AS OF 2026-08-04");
    // guardrail: ticker and number only — no editorializing, no emoji
    for (const i of items.filter((x) => x.live)) {
      expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(i.text)).toBe(false);
    }
    const plain = buildMarquee(fakes, null);
    expect(plain).toHaveLength(6);
    expect(plain.every((i) => !i.live)).toBe(true);
  });
});

describe("/api/tape route", () => {
  const mkRes = () => {
    const out: { status?: number; body?: unknown } = {};
    return {
      out,
      setHeader: () => {},
      status(n: number) { out.status = n; return { json(b: unknown) { out.body = b; }, end() { out.body = null; } }; },
    };
  };
  const env = process.env;
  afterEach(() => { vi.unstubAllGlobals(); process.env = env; });

  const stub = (routes: Record<string, () => Promise<Response> | Response>) => {
    const mock = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      for (const [frag, fn] of Object.entries(routes)) if (u.includes(frag)) return Promise.resolve(fn());
      throw new Error("unexpected fetch " + u);
    });
    vi.stubGlobal("fetch", mock);
    return mock;
  };

  it("fresh row: returns cache with ZERO external API calls", async () => {
    process.env = { ...env, VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "k", ALPHAVANTAGE_KEY: "av", SUPABASE_SERVICE_ROLE_KEY: "svc" };
    const row = { as_of: lastTradingDay(), losers: [{ t: "A", pct: -9 }], updated_at: new Date().toISOString() };
    const f = stub({ "market_tape": () => Response.json([row]) });
    const res = mkRes();
    await handler({}, res);
    expect(res.out.status).toBe(200);
    expect((res.out.body as { as_of: string }).as_of).toBe(row.as_of);
    const calls = f.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes("alphavantage"))).toBe(false);
  });

  it("stale row: refreshes from Alpha Vantage and upserts", async () => {
    process.env = { ...env, VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "k", ALPHAVANTAGE_KEY: "av", SUPABASE_SERVICE_ROLE_KEY: "svc" };
    const stale = { as_of: "2020-01-02", losers: [], updated_at: "2020-01-02T00:00:00Z" };
    let upserted = false;
    stub({
      "market_tape?id=eq.1": () => Response.json([stale]),
      "alphavantage": () => Response.json(AV),
      "market_tape?on_conflict": () => { upserted = true; return Response.json({}); },
    });
    const res = mkRes();
    await handler({}, res);
    expect(res.out.status).toBe(200);
    expect((res.out.body as { losers: unknown[] }).losers).toHaveLength(6);
    expect(upserted).toBe(true);
  });

  it("API down: serves the stale row rather than failing", async () => {
    process.env = { ...env, VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "k", ALPHAVANTAGE_KEY: "av", SUPABASE_SERVICE_ROLE_KEY: "svc" };
    const stale = { as_of: "2020-01-02", losers: [{ t: "OLD", pct: -1 }], updated_at: "2020-01-02T00:00:00Z" };
    stub({
      "market_tape?id=eq.1": () => Response.json([stale]),
      "alphavantage": () => new Response("rate limited", { status: 503 }),
    });
    const res = mkRes();
    await handler({}, res);
    expect(res.out.status).toBe(200);
    expect((res.out.body as { as_of: string }).as_of).toBe("2020-01-02");
  });

  it("nothing anywhere: 204, never a crash", async () => {
    process.env = { ...env, VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "k", ALPHAVANTAGE_KEY: "av", SUPABASE_SERVICE_ROLE_KEY: "svc" };
    stub({
      "market_tape?id=eq.1": () => Response.json([]),
      "alphavantage": () => Response.json({ note: "rate limit" }),
    });
    const res = mkRes();
    await handler({}, res);
    expect(res.out.status).toBe(204);
  });
});

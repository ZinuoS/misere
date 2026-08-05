import { describe, it, expect } from "vitest";
import {
  countdown, dailyNumber, dailyStats, histogram, msToNextDaily, shareCard, todayISO,
} from "../data/daily";
import { stampFor, verdict } from "../ui/verdicts";
import type { TelemetryRow } from "../data/supabase";
import type { Decomposition } from "../engine/decompose";

const row = (dailyDate: string, pnl = -50): TelemetryRow => ({
  mode: "misere", pnl, sharpEdge: -20, noiseEdge: -10, invPnl: -20,
  nFills: 10, nSharp: 5, avgSpread: 1.5, avgSkew: -2, durationMs: 60000,
  dailyDate, created_at: dailyDate + "T12:00:00Z",
});

const dec = (o: Partial<Decomposition> = {}): Decomposition => ({
  sharpEdge: 0, noiseEdge: 0, invPnl: 0, nFills: 10, nSharp: 5,
  avgSpread: 1.5, avgSkew: 0, ...o,
});

describe("daily", () => {
  it("derives the date from UTC, not the local zone", () => {
    // 23:30 UTC on the 4th is already the 5th in Sydney; the tape must still be the 4th
    expect(todayISO(new Date("2026-08-04T23:30:00Z"))).toBe("2026-08-04");
    expect(todayISO(new Date("2026-08-05T00:10:00Z"))).toBe("2026-08-05");
  });

  it("numbers from the epoch", () => {
    expect(dailyNumber("2026-08-04")).toBe(1);
    expect(dailyNumber("2026-08-06")).toBe(3);
  });

  it("counts down to the next UTC midnight", () => {
    const ms = msToNextDaily(new Date("2026-08-04T23:59:00Z"));
    expect(ms).toBe(60_000);
    expect(countdown(ms)).toBe("00:01:00");
  });

  it("streaks count consecutive days and break on gaps", () => {
    const s = dailyStats([row("2026-08-04"), row("2026-08-05"), row("2026-08-07")], "2026-08-07");
    expect(s.played).toBe(3);
    expect(s.streak).toBe(1); // gap on 08-06 reset the run
    expect(s.maxStreak).toBe(2);
    expect(s.best).toBe(50);
  });

  it("current streak dies if the last daily is older than yesterday", () => {
    const s = dailyStats([row("2026-08-01"), row("2026-08-02")], "2026-08-07");
    expect(s.streak).toBe(0);
    expect(s.maxStreak).toBe(2);
  });

  it("histogram bins scores across the calibrated bands", () => {
    const h = histogram([-3, 5, 20, 200]);
    expect(h.find((b) => b.label === "made money")!.n).toBe(1);
    expect(h.find((b) => b.label === "$1-10")!.n).toBe(1);
    expect(h.find((b) => b.label === "$10-25")!.n).toBe(1);
    expect(h.find((b) => b.label === "$150+")!.n).toBe(1);
  });

  it("share card is emoji-free, carries the decomposition and the site URL", () => {
    const t = shareCard("2026-08-04", 84.5, dec({ sharpEdge: -42.1, noiseEdge: -12.4, invPnl: -30, nFills: 8, nSharp: 3 }), "https://example.com");
    expect(t).toContain("MISERE DESK #1");
    expect(t).toContain("destroyed $84.50");
    expect(t.split("\n").at(-1)).toBe("https://example.com");
    expect(t).toContain("XXX▓▓▓▓▓"); // fill-quality strip: 3 sharp, 5 noise
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(t)).toBe(false);
  });
});

describe("verdict ladder", () => {
  it("every calibrated misère band is reachable and uses the spec copy", () => {
    const cases: [number, string][] = [
      [200, "FINAL BOSS OF ADVERSE SELECTION"],
      [100, "SUPERFUND SITE"],
      [50, "CERTIFIED TOXIC"],
      [30, "GUH."],
      [15, "MONEY BURNER"],
      [5, "PETTY CASH ARSONIST"],
      [0, "THE EFFICIENT MARKET HYPOTHESIS (DEROGATORY)"],
      [-3, "SPREAD GOBLIN"],
      [-10, "ACCIDENTAL RAINMAKER"],
      [-40, "GENERATIONAL WEALTH (WRONG GAME)"],
    ];
    for (const [score, headline] of cases) {
      expect(verdict("misere", score, dec()).headline).toBe(headline);
    }
  });

  it("normal ladder covers its five bands", () => {
    const cases: [number, string][] = [
      [30, "THE DESK HEAD NODS ONCE"],
      [15, "SPREAD FARMER"],
      [5, "PAPER CUT PROFITS"],
      [-5, "TUITION PAID"],
      [-30, "EXIT LIQUIDITY"],
    ];
    for (const [score, headline] of cases) {
      expect(verdict("normal", score, dec()).headline).toBe(headline);
    }
  });

  it("GHOST DESK overrides the EMH tier when nothing traded", () => {
    expect(verdict("misere", 0, dec({ nFills: 0, nSharp: 0 })).headline).toBe("GHOST DESK");
    expect(verdict("misere", 0, dec({ nFills: 1 })).headline).toContain("EFFICIENT MARKET");
  });

  it("stamps fire on constructed cases, at most one", () => {
    // inventory drives >60% of losses
    const inv = verdict("misere", 50, dec({ invPnl: -80, sharpEdge: -10, noiseEdge: -10 }));
    expect(inv.stamp).toBe("LUCK, NOT CRAFT — INVENTORY DID THIS");
    // sharps drive >70% with 5+ sharp fills
    const sharp = verdict("misere", 50, dec({ sharpEdge: -80, noiseEdge: -10, invPnl: -5, nSharp: 5 }));
    expect(sharp.stamp).toBe("PRECISION INSTRUMENT");
    // same shape but only 4 sharp fills: no stamp
    expect(verdict("misere", 50, dec({ sharpEdge: -80, noiseEdge: -10, invPnl: -5, nSharp: 4 })).stamp).toBeUndefined();
    // a profitable desk never gets a loss stamp
    expect(stampFor(dec({ invPnl: -80 }), -5)).toBeUndefined();
    // ghost desk never stamps
    expect(verdict("misere", 0, dec({ nFills: 0 })).stamp).toBeUndefined();
  });
});

describe("handle sanitizing (mobile keyboards)", () => {
  it("strips what iOS adds and keeps a valid handle valid", async () => {
    const { sanitizeHandle, HANDLE_RE } = await import("../data/identity");
    expect(sanitizeHandle("Zinuo Shi ")).toBe("ZinuoShi");
    expect(sanitizeHandle("desk’s—name.")).toBe("desksname"); // smart quote, em dash, period
    expect(HANDLE_RE.test(sanitizeHandle("Zinuo Shi "))).toBe(true);
    expect(sanitizeHandle("a".repeat(30))).toHaveLength(16);
    expect(sanitizeHandle("keep_me-99")).toBe("keep_me-99");
  });
});

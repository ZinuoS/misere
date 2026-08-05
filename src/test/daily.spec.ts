import { describe, it, expect } from "vitest";
import { dailyNumber, dailyStats, shareCard } from "../data/daily";
import type { TelemetryRow } from "../data/supabase";

const row = (dailyDate: string, pnl = -50): TelemetryRow => ({
  mode: "misere", pnl, sharpEdge: -20, noiseEdge: -10, invPnl: -20,
  nFills: 10, nSharp: 5, avgSpread: 1.5, avgSkew: -2, durationMs: 60000,
  dailyDate, created_at: dailyDate + "T12:00:00Z",
});

describe("daily", () => {
  it("numbers from the epoch", () => {
    expect(dailyNumber("2026-08-04")).toBe(1);
    expect(dailyNumber("2026-08-06")).toBe(3);
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

  it("share card is emoji-free and carries the decomposition", () => {
    const t = shareCard("2026-08-04", 84.5, -42.1, -12.4, -30);
    expect(t).toContain("MISÈRE DESK №1");
    expect(t).toContain("destroyed $84.50");
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(t)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { dateSeed, mulberry32 } from "../engine/rng";
import { clampMkt, soloInit, soloStep, soloTruePnl } from "../engine/solo";
import {
  compInit, compStep, deskPnl, routeBuy, routeSell, skewDesk, type Desk,
} from "../engine/comp";
import { erisQuotes } from "../engine/eris";
import { decompose, residual } from "../engine/decompose";
import { BAND, INV_CAP, MIN_SPREAD, r2 } from "../engine/types";
import { act, POLICIES } from "./dummy";

const EPS = 1e-9;

describe("decomposition identity", () => {
  it("holds across 500 seeded random solo games per mode", () => {
    for (const modeSeedBase of [0, 10_000]) {
      // misere and normal share the engine; distinct seed ranges stand in for the modes
      for (let seed = modeSeedBase; seed < modeSeedBase + 500; seed++) {
        const rng = mulberry32(seed);
        const s = soloInit();
        while (!s.done) {
          act("random-legal", s, rng);
          soloStep(s, rng);
        }
        const d = decompose(s.fills, s.vPath, s.invPath, s.quoteLog);
        expect(residual(soloTruePnl(s), d)).toBeLessThan(1e-6);
      }
    }
  });

  it("holds across 500 seeded competitive games, both desks", () => {
    for (let seed = 0; seed < 500; seed++) {
      const rng = mulberry32(seed);
      const s = compInit(["A", "ERIS"], true);
      while (!s.done) {
        skewDesk(s, 0, rng() < 0.5 ? -0.5 : 0.5);
        compStep(s, rng);
      }
      for (const d of s.desks) {
        const dec = decompose(d.fills, s.vPath, d.invPath, d.quoteLog);
        expect(residual(deskPnl(d, s.V), dec)).toBeLessThan(1e-6);
      }
    }
  });
});

describe("clampMkt", () => {
  it("never crossed, never under MIN_SPREAD, never outside the band (10k fuzz)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 10_000; i++) {
      const anchor = 80 + rng() * 40;
      const bid = anchor - 8 + rng() * 16;
      const ask = anchor - 8 + rng() * 16;
      const [b, a] = clampMkt(bid, ask, anchor);
      expect(a - b).toBeGreaterThanOrEqual(MIN_SPREAD - EPS);
      expect(b).toBeGreaterThanOrEqual(anchor - BAND - EPS);
      expect(a).toBeLessThanOrEqual(anchor + BAND + EPS);
      expect(b).toBe(r2(b)); // on the 0.5 grid
      expect(a).toBe(r2(a));
    }
  });
});

describe("inventory cap", () => {
  it("solo inventory never exceeds +/-INV_CAP under heavy fill sequences", () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const policy of POLICIES) {
        const rng = mulberry32(seed);
        const s = soloInit();
        while (!s.done) {
          act(policy, s, rng);
          soloStep(s, rng);
        }
        for (const inv of s.invPath) expect(Math.abs(inv)).toBeLessThanOrEqual(INV_CAP);
      }
    }
  });

  it("competitive desks never exceed +/-INV_CAP", () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = mulberry32(seed);
      const s = compInit(["A", "ERIS"], true);
      while (!s.done) compStep(s, rng);
      for (const d of s.desks) for (const inv of d.invPath) expect(Math.abs(inv)).toBeLessThanOrEqual(INV_CAP);
    }
  });
});

describe("NBBO routing", () => {
  const mk = (bid: number, ask: number, inv = 0): Desk => ({
    name: "d", bid, ask, cash: 0, inv, fills: [], invPath: [], quoteLog: [],
  });

  it("strictly better ask always wins the buyer", () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 1000; i++) {
      expect(routeBuy([mk(99, 100.5), mk(99, 101)], rng)).toBe(0);
      expect(routeSell([mk(99.5, 101), mk(99, 101)], rng)).toBe(0);
    }
  });

  it("desks at the inventory cap are ineligible", () => {
    const rng = mulberry32(4);
    expect(routeBuy([mk(99, 100, -INV_CAP), mk(99, 101)], rng)).toBe(1);
    expect(routeSell([mk(100, 101, INV_CAP), mk(99, 101)], rng)).toBe(1);
    expect(routeBuy([mk(99, 100, -INV_CAP), mk(99, 101, -INV_CAP)], rng)).toBeNull();
  });

  it("ties split ~50/50 over 10k seeded draws (chi-squared)", () => {
    const rng = mulberry32(5);
    let wins0 = 0;
    for (let i = 0; i < 10_000; i++) {
      if (routeBuy([mk(99, 101), mk(99, 101)], rng) === 0) wins0++;
    }
    const chi2 = (wins0 - 5000) ** 2 / 5000 + (10_000 - wins0 - 5000) ** 2 / 5000;
    expect(chi2).toBeLessThan(6.635); // p = 0.01, 1 dof
  });
});

describe("tape-painting regression", () => {
  it("player's own fills never move the anchor (zero exogenous prints)", () => {
    // Always-max-skew camps at the band top; with no prints, noise sellers hit
    // the inflated bid over and over. The anchor must stay bit-identical.
    const rng = mulberry32(11);
    const s = soloInit();
    const anchorBefore = s.anchor;
    while (!s.done) {
      act("always-max-skew", s, rng);
      soloStep(s, rng, { printProb: 0 });
    }
    expect(s.fills.filter((f) => f.side === "sell").length).toBeGreaterThan(5);
    expect(Object.is(s.anchor, anchorBefore)).toBe(true);
  });
});

describe("daily determinism", () => {
  it("two engine instances from the same date-seed produce bit-identical tapes", () => {
    const run = () => {
      const rng = mulberry32(dateSeed("2026-08-04"));
      const s = soloInit();
      while (!s.done) {
        act("random-legal", s, rng);
        soloStep(s, rng);
      }
      return JSON.stringify({ v: s.vPath, i: s.invPath, f: s.fills, q: s.quoteLog, t: s.tape });
    };
    expect(run()).toBe(run());
  });

  it("different dates produce different seeds", () => {
    expect(dateSeed("2026-08-04")).not.toBe(dateSeed("2026-08-05"));
  });
});

describe("ERIS", () => {
  it("respects band and spread floor over 100 seeded games", () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = mulberry32(seed);
      const s = compInit(["A", "ERIS"], true);
      while (!s.done) compStep(s, rng);
      for (const q of s.desks[1].quoteLog) {
        expect(q.ask - q.bid).toBeGreaterThanOrEqual(MIN_SPREAD - EPS);
        expect(q.bid).toBeGreaterThanOrEqual(q.anchor - BAND - EPS);
        expect(q.ask).toBeLessThanOrEqual(q.anchor + BAND + EPS);
      }
    }
  });

  it("flips sides two lots before the inventory cap", () => {
    const noFlip = () => 0.5; // rng that never triggers the 10% random flip
    const long = { est: 100, side: "high" as const };
    erisQuotes(long, INV_CAP - 2, 100, noFlip);
    expect(long.side).toBe("low"); // near-long-cap: quote low to sell down
    const short = { est: 100, side: "low" as const };
    erisQuotes(short, -(INV_CAP - 2), 100, noFlip);
    expect(short.side).toBe("high");
  });
});

import { describe, it, expect } from "vitest";
import { dateSeed, mulberry32 } from "../engine/rng";
import { clampMkt, clampSolo, setQuote, skew, soloInit, soloStep, soloTruePnl } from "../engine/solo";
import {
  compInit, compStep, deskPnl, routeBuy, routeSell, skewDesk, type Desk,
} from "../engine/comp";
import { erisQuotes } from "../engine/eris";
import { decompose, residual } from "../engine/decompose";
import {
  COMP_BAND as BAND, COMP_START as START, INV_CAP, MIN_SPREAD, TICK, TUNE, V_MAX, V_MIN, r2, reflect,
} from "../engine/types";
import { act, POLICIES } from "./dummy";
import { makeBot } from "./bots";

const EPS = 1e-9;

describe("decomposition identity", () => {
  it("holds across 500 seeded random solo games per mode", () => {
    for (const modeSeedBase of [0, 10_000]) {
      // misere and normal share the engine; distinct seed ranges stand in for the modes
      for (let seed = modeSeedBase; seed < modeSeedBase + 500; seed++) {
        const rng = mulberry32(seed);
        const s = soloInit(rng);
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
        skewDesk(s, 0, rng() < 0.5 ? -TICK : TICK);
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
      const anchor = START * (0.8 + rng() * 0.4);
      const bid = anchor - BAND * 2 + rng() * BAND * 4;
      const ask = anchor - BAND * 2 + rng() * BAND * 4;
      const [b, a] = clampMkt(bid, ask, anchor);
      expect(a - b).toBeGreaterThanOrEqual(MIN_SPREAD - EPS);
      expect(b).toBeGreaterThanOrEqual(anchor - BAND - EPS);
      expect(a).toBeLessThanOrEqual(anchor + BAND + EPS);
      expect(b).toBe(r2(b)); // on the quote grid
      expect(a).toBe(r2(a));
    }
  });
});

describe("inventory cap", () => {
  it("solo inventory never exceeds +/-INV_CAP under heavy fill sequences", () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const policy of POLICIES) {
        const rng = mulberry32(seed);
        const s = soloInit(rng);
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
      expect(routeBuy([mk(995, 1005), mk(995, 1015)], rng)).toBe(0);
      expect(routeSell([mk(1005, 1015), mk(995, 1015)], rng)).toBe(0);
    }
  });

  it("desks at the inventory cap are ineligible", () => {
    const rng = mulberry32(4);
    expect(routeBuy([mk(995, 1005, -INV_CAP), mk(995, 1015)], rng)).toBe(1);
    expect(routeSell([mk(1005, 1015, INV_CAP), mk(995, 1015)], rng)).toBe(1);
    expect(routeBuy([mk(995, 1005, -INV_CAP), mk(995, 1015, -INV_CAP)], rng)).toBeNull();
  });

  it("ties split ~50/50 over 10k seeded draws (chi-squared)", () => {
    const rng = mulberry32(5);
    let wins0 = 0;
    for (let i = 0; i < 10_000; i++) {
      if (routeBuy([mk(995, 1015), mk(995, 1015)], rng) === 0) wins0++;
    }
    const chi2 = (wins0 - 5000) ** 2 / 5000 + (10_000 - wins0 - 5000) ** 2 / 5000;
    expect(chi2).toBeLessThan(6.635); // p = 0.01, 1 dof
  });
});

describe("tape-painting regression", () => {
  it("player's own fills never move the anchor (zero exogenous prints)", () => {
    // Needs a seed whose fair value sits near the opening anchor, so quotes camped
    // on the anchor actually trade and stand (a busted print books nothing).
    let seed = 1;
    for (; seed < 5000; seed++) {
      const probe = soloInit(mulberry32(seed));
      if (Math.abs(probe.V - probe.anchor) < 30) break;
    }
    const rng = mulberry32(seed);
    const s = soloInit(rng);
    const anchorBefore = s.anchor;
    while (!s.done) {
      // camp at the spread floor on the anchor: repeated self-fills, no prints
      [s.bid, s.ask] = clampSolo(r2(s.anchor) - MIN_SPREAD, r2(s.anchor) + MIN_SPREAD, s.anchor);
      soloStep(s, rng, { printProb: 0 });
    }
    expect(s.fills.length).toBeGreaterThan(5);
    expect(Object.is(s.anchor, anchorBefore)).toBe(true);
  });
});

describe("daily determinism", () => {
  it("two engine instances from the same date-seed produce bit-identical tapes", () => {
    const run = () => {
      const rng = mulberry32(dateSeed("2026-08-04"));
      const s = soloInit(rng);
      while (!s.done) {
        act("random-legal", s, rng);
        soloStep(s, rng);
      }
      return JSON.stringify({ v: s.vPath, i: s.invPath, f: s.fills, q: s.quoteLog, t: s.tape });
    };
    expect(run()).toBe(run());
  });

  it("different dates produce different seeds AND different tapes", () => {
    expect(dateSeed("2026-08-04")).not.toBe(dateSeed("2026-08-05"));
    const tape = (iso: string) => {
      const rng = mulberry32(dateSeed(iso));
      const s = soloInit(rng);
      while (!s.done) soloStep(s, rng);
      return JSON.stringify(s.vPath);
    };
    expect(tape("2026-08-04")).not.toBe(tape("2026-08-05"));
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
    const long = { est: START, side: "high" as const };
    erisQuotes(long, INV_CAP - 2, START, noFlip);
    expect(long.side).toBe("low"); // near-long-cap: quote low to sell down
    const short = { est: START, side: "low" as const };
    erisQuotes(short, -(INV_CAP - 2), START, noFlip);
    expect(short.side).toBe("high");
  });
});

describe("reflecting barriers", () => {
  it("folds overshoot back inside at both walls", () => {
    expect(reflect(-30)).toBe(30);          // below the floor
    expect(reflect(1030)).toBe(970);        // above the ceiling
    expect(reflect(0)).toBe(0);
    expect(reflect(1000)).toBe(1000);
    expect(reflect(437.5)).toBe(437.5);     // untouched inside
  });

  it("never leaves the range over a full game, including the news event", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = mulberry32(seed);
      const s = soloInit(rng);
      while (!s.done) soloStep(s, rng);
      for (const v of s.vPath) {
        expect(v).toBeGreaterThanOrEqual(V_MIN);
        expect(v).toBeLessThanOrEqual(V_MAX);
      }
    }
  });

  it("reflects even when a move is larger than the whole range", () => {
    expect(reflect(2500)).toBeGreaterThanOrEqual(V_MIN);
    expect(reflect(2500)).toBeLessThanOrEqual(V_MAX);
    expect(reflect(-2500)).toBeGreaterThanOrEqual(V_MIN);
  });
});

describe("news event", () => {
  it("lands once, inside the window, and is warned one tick ahead", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      const s = soloInit(rng);
      expect(s.newsTick).toBeGreaterThanOrEqual(18);
      expect(s.newsTick).toBeLessThanOrEqual(28);
      expect(Math.abs(s.newsSize)).toBeGreaterThanOrEqual(40);
      expect(Math.abs(s.newsSize)).toBeLessThanOrEqual(80);
      const warns: number[] = [];
      while (!s.done) {
        soloStep(s, rng);
        for (const e of s.tape) if (e.text.startsWith("HEADLINE") && !warns.includes(e.t)) warns.push(e.t);
      }
      expect(warns).toEqual([s.newsTick - 1]); // exactly one warning, one tick early
    }
  });
});

describe("clearly-erroneous bust rule", () => {
  it("no booked fill is ever further than BUST from fair value", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = mulberry32(seed);
      const s = soloInit(rng);
      while (!s.done) {
        // park at the range edge: the degenerate strategy the rule exists to kill
        skew(s, 500);
        soloStep(s, rng);
      }
      for (const f of s.fills) {
        const vAt = s.vPath[f.t];
        expect(Math.abs(f.price - vAt)).toBeLessThanOrEqual(TUNE.BUST + 1e-9);
      }
    }
  });
});

describe("solo quote band", () => {
  it("quotes stay on the grid, above the spread floor and inside the range", () => {
    const rng = mulberry32(21);
    for (let i = 0; i < 5000; i++) {
      const anchor = V_MIN + rng() * (V_MAX - V_MIN);
      const [b, a] = clampSolo(V_MIN - 500 + rng() * 2000, V_MIN - 500 + rng() * 2000, anchor);
      expect(a - b).toBeGreaterThanOrEqual(MIN_SPREAD - EPS);
      expect(b).toBeGreaterThanOrEqual(V_MIN);
      expect(a).toBeLessThanOrEqual(V_MAX);
      expect(b).toBe(r2(b));
      expect(a).toBe(r2(a));
    }
  });
});

describe("typed quote entry", () => {
  it("sets a side outright, snaps to the grid and holds the spread floor", () => {
    const s = soloInit(mulberry32(3));
    setQuote(s, "ask", 612);          // off-grid, inside the band
    expect(s.ask).toBe(610);          // snapped to TICK
    setQuote(s, "bid", 300);
    expect(s.bid).toBe(300);
    expect(s.ask - s.bid).toBeGreaterThanOrEqual(MIN_SPREAD);
    // typing past the band is clamped to it, not rejected: at the open the
    // anchor is V_MID, so the reachable window is 250..750
    setQuote(s, "ask", 812);
    expect(s.ask).toBe(750);
  });

  it("pushes the other side instead of rejecting a crossing entry", () => {
    const s = soloInit(mulberry32(3));
    setQuote(s, "bid", 300);
    setQuote(s, "ask", 305);
    // the stepper would refuse this; typing must still leave a legal market
    expect(s.ask - s.bid).toBeGreaterThanOrEqual(MIN_SPREAD);
    setQuote(s, "ask", 700);
    setQuote(s, "bid", 699);
    expect(s.ask - s.bid).toBeGreaterThanOrEqual(MIN_SPREAD);
  });

  it("ignores junk and clamps out-of-range entries", () => {
    const s = soloInit(mulberry32(3));
    const before = [s.bid, s.ask];
    setQuote(s, "bid", NaN);
    expect([s.bid, s.ask]).toEqual(before);
    setQuote(s, "ask", 99999);
    expect(s.ask).toBeLessThanOrEqual(V_MAX);
    setQuote(s, "bid", -500);
    expect(s.bid).toBeGreaterThanOrEqual(V_MIN);
    expect(s.ask - s.bid).toBeGreaterThanOrEqual(MIN_SPREAD);
  });
});

describe("dominant-strategy regression (the exploit from the 1000-level version)", () => {
  // The original retune had a visible dominant strategy: park both quotes at the
  // band edge at the spread floor and farm fills forever — no inference needed.
  // Under the bust rule that play must (a) mostly produce voided prints and
  // (b) score far below an inference player on the same seeds.
  it("edge camping is busted, not rewarded", () => {
    const N = 150;
    let camperTotal = 0, bayesTotal = 0, busts = 0, booked = 0;
    for (let seed = 1; seed <= N; seed++) {
      // camper: lowest legal market every tick
      const rngC = mulberry32(seed);
      const c = soloInit(rngC);
      while (!c.done) {
        [c.bid, c.ask] = clampSolo(V_MIN, V_MIN + MIN_SPREAD, c.anchor);
        soloStep(c, rngC);
        if (c.tape.some((e) => e.t === c.t && e.text.startsWith("Trade busted"))) busts++;
      }
      booked += c.fills.length;
      camperTotal += -soloTruePnl(c);

      // inference player, same seeds
      const rngB = mulberry32(seed);
      const b = soloInit(rngB);
      const bot = makeBot("BAYES", "misere");
      while (!b.done) {
        bot.quote(b, rngB);
        soloStep(b, rngB);
        bot.observe?.(b);
      }
      bayesTotal += -soloTruePnl(b);
    }
    expect(busts).toBeGreaterThan(booked); // the edge mostly produces voided prints
    expect(bayesTotal).toBeGreaterThan(2 * camperTotal); // knowing V is worth >2x parking blind
  });
});

describe("drift attribution", () => {
  // "You can tell the drift from pnl": invPnl must be exactly the inventory
  // carried through each V move — including the news jump — and nothing else.
  it("with one fill held to the end, invPnl equals inv x subsequent V moves", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rng = mulberry32(seed);
      const s = soloInit(rng);
      while (!s.done) {
        if (s.fills.length === 0) {
          // camp on the anchor until something books
          [s.bid, s.ask] = clampSolo(r2(s.anchor) - MIN_SPREAD, r2(s.anchor) + MIN_SPREAD, s.anchor);
        } else {
          // then park at the band edge: everything after either walks or busts
          [s.bid, s.ask] = clampSolo(V_MIN, V_MIN + MIN_SPREAD, s.anchor);
        }
        soloStep(s, rng);
      }
      if (s.fills.length !== 1) continue;
      const f = s.fills[0];
      if (f.t >= s.newsTick) continue; // want the news inside the holding window
      const d = decompose(s.fills, s.vPath, s.invPath, s.quoteLog);
      const inv = f.side === "buy" ? -1 : 1;
      const handComputed = inv * (s.vPath[s.vPath.length - 1] - s.vPath[f.t]);
      expect(Math.abs(d.invPnl - handComputed)).toBeLessThan(1e-6);
      // and the whole game reconciles: pnl = fill edge + drift
      expect(Math.abs(soloTruePnl(s) - (f.edge + d.invPnl))).toBeLessThan(1e-6);
      return; // one clean specimen is the proof
    }
    throw new Error("no single-fill-through-news specimen found in 2000 seeds");
  });
});

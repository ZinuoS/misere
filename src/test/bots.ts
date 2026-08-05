// Reference bots used to prove the solo market is an inference game and not a
// reflex test. Pure engine, seeded, no React. See gates.ts for the assertions.
import { clampSolo, type SoloState } from "../engine/solo";
import {
  INV_CAP, MIN_SPREAD, P_INFORMED, PRINT_SIGMA, TUNE, V_MAX, V_MIN, V_SIGMA, r2, type Rng,
} from "../engine/types";

export type Mode = "misere" | "normal";

/** Posterior std below which the estimate is tight enough to stop probing. */
export const LEARN = { SD: 8 };
export type BotName = "RANDOM" | "EWMA" | "BAYES";

export interface Bot {
  /** Set s.bid / s.ask for this tick. Called before every soloStep. */
  quote(s: SoloState, rng: Rng): void;
  /** Learn from what just happened. Called after every soloStep. */
  observe?(s: SoloState): void;
  /** Posterior std, for the learnability gate. */
  sd?(): number;
}


/**
 * Misere quoting under the bust rule. Loss per lot is |price - V|, but a fill more
 * than TUNE.BUST from V is voided, so the payoff is a ridge: aim just INSIDE the
 * bust window on the wrong side. Overshoot and you earn nothing.
 *
 *   LEARN   - estimate still loose: quote at the spread floor around it, which
 *             either cuts the space hard or brackets V in a 10-wide window.
 *   EXPLOIT - aim at BUST minus a safety margin. The margin has to cover your own
 *             estimate error, so a sharper posterior can aim closer to the edge and
 *             bleed more per lot. That is the whole skill gradient.
 */
function misereQuote(est: number, err: number, inv: number, anchor: number): [number, number] {
  if (err > LEARN.SD) return clampSolo(r2(est - MIN_SPREAD / 2), r2(est + MIN_SPREAD / 2), anchor);
  const margin = Math.min(TUNE.BUST * 0.8, 1.6 * err + MIN_SPREAD / 2);
  const reach = TUNE.BUST - margin; // desired |price - V|
  const buyHigh = inv <= -INV_CAP + 1 ? true : inv >= INV_CAP - 1 ? false : est <= (V_MIN + V_MAX) / 2;
  return buyHigh
    ? clampSolo(r2(est + reach), r2(est + reach + MIN_SPREAD), anchor)
    : clampSolo(r2(est - reach - MIN_SPREAD), r2(est - reach), anchor);
}

/** Legal random quotes, no learning at all. */
export function randomBot(): Bot {
  return {
    quote(s, rng) {
      const a = V_MIN + rng() * (V_MAX - V_MIN);
      const b = V_MIN + rng() * (V_MAX - V_MIN);
      [s.bid, s.ask] = clampSolo(Math.min(a, b), Math.max(a, b) + MIN_SPREAD, s.anchor);
    },
  };
}

/** Fixed spread around the print EWMA. Ignores its own fills entirely. */
export function ewmaBot(mode: Mode): Bot {
  const half = MIN_SPREAD * 1.5;
  return {
    quote(s) {
      const m = s.anchor; // print EWMA only; fills are ignored by construction
      if (mode === "normal") {
        [s.bid, s.ask] = clampSolo(r2(m - half), r2(m + half), s.anchor);
      } else {
        // no posterior, so no way to know when it is safe to exploit: commit
        // no posterior, so it cannot size its own error: assume a fixed margin
        [s.bid, s.ask] = misereQuote(m, 0, s.inv, s.anchor);
      }
    },
  };
}

/**
 * Discretized posterior over V on a 1-unit grid across [V_MIN, V_MAX].
 * Updates on three sources:
 *   - drift:        diffuse by V_SIGMA (reflecting at the walls)
 *   - prints:       Gaussian likelihood, sigma PRINT_SIGMA
 *   - own fills:    a sharp fill is a HARD one-sided cut (informed trade iff the
 *                   quote is strictly wrong); a pass is soft evidence that V sat
 *                   inside the quote; a noise fill says nothing about V.
 */
export function bayesBot(mode: Mode): Bot {
  const N = V_MAX - V_MIN + 1;
  let p = new Float64Array(N).fill(1 / N);
  let seenFills = 0;

  const norm = () => {
    let s = 0;
    for (let i = 0; i < N; i++) s += p[i];
    if (s <= 0) { p = new Float64Array(N).fill(1 / N); return; }
    for (let i = 0; i < N; i++) p[i] /= s;
  };
  const mean = () => {
    let m = 0;
    for (let i = 0; i < N; i++) m += p[i] * (V_MIN + i);
    return m;
  };
  const sd = () => {
    const m = mean();
    let v = 0;
    for (let i = 0; i < N; i++) { const d = V_MIN + i - m; v += p[i] * d * d; }
    return Math.sqrt(Math.max(0, v));
  };

  // small Gaussian blur, reflecting at both walls
  const K = 4 * Math.ceil(V_SIGMA);
  const kern: number[] = [];
  for (let d = -K; d <= K; d++) kern.push(Math.exp(-(d * d) / (2 * V_SIGMA * V_SIGMA)));
  const ksum = kern.reduce((a, b) => a + b, 0);
  const diffuse = () => {
    const q = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      if (p[i] === 0) continue;
      for (let d = -K; d <= K; d++) {
        let j = i + d;
        if (j < 0) j = -j;                       // reflect at V_MIN
        if (j > N - 1) j = 2 * (N - 1) - j;      // reflect at V_MAX
        if (j >= 0 && j < N) q[j] += p[i] * kern[d + K] / ksum;
      }
    }
    p = q;
  };

  const cutAbove = (x: number) => { for (let i = 0; i < N; i++) if (V_MIN + i <= x) p[i] = 0; };
  const cutBelow = (x: number) => { for (let i = 0; i < N; i++) if (V_MIN + i >= x) p[i] = 0; };

  return {
    sd,
    quote(s) {
      const m = mean();
      const sdv = sd();
      if (mode === "normal") {
        const half = Math.max(MIN_SPREAD / 2, 1.1 * sdv);
        [s.bid, s.ask] = clampSolo(r2(m - half), r2(m + half), s.anchor);
      } else {
        [s.bid, s.ask] = misereQuote(m, sdv, s.inv, s.anchor);
      }
    },
    observe(s) {
      diffuse();

      const q = s.quoteLog[s.quoteLog.length - 1];
      const fresh = s.fills.slice(seenFills);
      seenFills = s.fills.length;
      const sharp = fresh.find((f) => f.sharp);

      const busted = s.tape.find((e) => e.t === s.t && e.text.startsWith("Trade busted"));
      if (sharp) {
        // informed lifted the offer => V above it; and the trade STOOD, so it is
        // also within BUST of V. Two-sided: a window only BUST wide.
        if (sharp.side === "buy") { cutAbove(sharp.price); cutBelow(sharp.price + TUNE.BUST); }
        else { cutBelow(sharp.price); cutAbove(sharp.price - TUNE.BUST); }
      } else if (busted && q) {
        // someone traded and it was voided: V is further than BUST from that price
        const px = Number(busted.text.match(/@ ([\d.]+)/)?.[1] ?? NaN);
        if (Number.isFinite(px)) {
          for (let i = 0; i < N; i++) {
            if (Math.abs(V_MIN + i - px) <= TUNE.BUST) p[i] = 0;
          }
        }
      } else if (fresh.length === 0 && q) {
        // nobody traded: either no informed arrival, or one arrived and passed,
        // which happens only when bid <= V <= ask
        for (let i = 0; i < N; i++) {
          const v = V_MIN + i;
          const inside = v >= q.bid && v <= q.ask;
          p[i] *= inside ? 1 : 1 - P_INFORMED;
        }
      }

      // the newest print, if this tick produced one
      const pr = s.lastRef;
      const printed = s.tape.some((e) => e.t === s.t && e.kind === "print");
      if (printed && pr !== null) {
        for (let i = 0; i < N; i++) {
          const d = V_MIN + i - pr;
          p[i] *= Math.exp(-(d * d) / (2 * PRINT_SIGMA * PRINT_SIGMA));
        }
      }
      norm();
    },
  };
}

export const makeBot = (name: BotName, mode: Mode): Bot =>
  name === "RANDOM" ? randomBot() : name === "EWMA" ? ewmaBot(mode) : bayesBot(mode);

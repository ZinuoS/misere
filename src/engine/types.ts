// Canonical engine constants.
//
// SOLO is an inference game, not a chase. Fair value is drawn once from a wide
// prior — Uniform(0, 1000), the classic interview range — and is then PERSISTENT:
// drift is small (sigma 3) relative to the prior width (std ~289), so a player's
// posterior actually tightens as evidence arrives. Difficulty comes from prior
// width, not volatility. Prints are a vague drumbeat (15% of ticks, sigma 35);
// the player's own fills are the primary information source, because an informed
// trader only trades when your quote is strictly wrong, making each sharp fill a
// clean one-sided bound on V.
//
// COMPETITIVE is untouched: a tight rolling band around a fast-moving value. The
// band exists there to stop the overbidding race, so those constants are separate.
export const SOLO_T = 40;
export const COMP_T = 25;

// --- shared quote mechanics ---
export const TICK = 5; // smallest quote increment
export const COARSE = 25; // coarse stepper increment
export const MIN_SPREAD = 10;
export const INV_CAP = 10;
export const P_INFORMED = 0.45;

// --- solo: the inference market ---
export const V_MIN = 0;
export const V_MAX = 1000;
export const V_MID = 500; // prior mean; the crowd's opening anchor
export const V_SIGMA = 3; // per-tick drift. No ambient jumps.
export const PRINT_PROB = 0.15;

/**
 * ponytail: mutable so the playability sweep can grid-search these two without
 * duplicating the engine. Production never writes to it.
 *
 * SOLO_BAND bounds quotes to +/-band around the PUBLIC print anchor. Without it
 * the misere objective is degenerate: maximum loss is "park at a range edge",
 * which needs no knowledge of V at all, so a print-only bot beats a Bayesian one.
 * The band makes mispricing commensurate with what can actually be inferred.
 */
/**
 * BUST is the clearly-erroneous-execution rule, and it is what makes misere an
 * inference game rather than a corner solution.
 *
 * Without it, "lose the most money" is maximised by quoting at the edge of the
 * legal range: loss per lot is |price - V|, so the further out you park the more
 * you bleed, and WHERE V actually sits barely matters. Measured over 24 parameter
 * configurations, a print-only bot beat a full Bayesian one in every single one.
 *
 * With it, a fill more than BUST away from true fair value is voided, exactly as a
 * real exchange busts an obviously mispriced print. Now the winning play is to be
 * wrong by just under BUST, on the correct side - which is impossible without a
 * tight posterior on V. Being wildly wrong earns nothing at all.
 */
export const TUNE = { SOLO_BAND: 250, PRINT_PROB: 0.15, ANCHOR_W: 0.4, BUST: 90 };

export const PRINT_SIGMA = 35;
export const NOISE_SIGMA = 26; // noise reservation spread around the print anchor

// Exactly one news event per game, warned one tick ahead.
export const NEWS_MIN_T = 18;
export const NEWS_MAX_T = 28;
export const NEWS_MIN = 40;
export const NEWS_SPAN = 40; // magnitude is NEWS_MIN + U(0, NEWS_SPAN) => 40..80

// --- competitive: unchanged rolling-band market ---
export const COMP_START = 1000;
export const COMP_BAND = 60;
export const COMP_V_SIGMA = 14;
export const COMP_JUMP_PROB = 0.08;
export const COMP_JUMP_MIN = 25;
export const COMP_JUMP_SPAN = 35;
export const COMP_PRINT_PROB = 0.55;
export const COMP_PRINT_SIGMA = 12;

export type Rng = () => number; // uniform [0, 1)

export type Side = "buy" | "sell";

export interface Fill {
  t: number;
  price: number;
  side: Side;
  sharp: boolean;
  edge: number; // MM fill PnL vs V at fill time
}

export interface TapeEntry {
  t: number;
  text: string;
  kind: "sys" | "print" | "sharp" | "noise";
}

export interface QuoteRec {
  t: number;
  bid: number;
  ask: number;
  anchor: number;
}

export interface StepOpts {
  printProb?: number; // test hook only; production always uses PRINT_PROB
}

/** Snap to the quote grid. */
export const r2 = (x: number) => Math.round(x / TICK) * TICK;

/**
 * Reflect a value back inside [lo, hi]: a move that would land at -30 lands at 30,
 * and one that would land at 1030 lands at 970. Fair value never leaves the range,
 * so the prior stays honest all game.
 */
export const reflect = (x: number, lo = V_MIN, hi = V_MAX): number => {
  if (hi <= lo) return lo;
  let v = x;
  for (let i = 0; i < 64 && (v < lo || v > hi); i++) {
    if (v < lo) v = 2 * lo - v;
    if (v > hi) v = 2 * hi - v;
  }
  return Math.min(hi, Math.max(lo, v));
};

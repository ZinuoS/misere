// Canonical engine constants.
//
// The market trades around 1000, not 100: quotes move in 5-unit ticks, the spread
// floor is 10 and the band is +/-60. Scaling alone would not change the game, so
// the volatility was raised RELATIVE to the band as well — fair value now walks
// sigma=14 a tick against a 60-wide band (the old ratio was 5:1, this is ~4:1)
// with fatter, more frequent jumps. A quote parked at the band edge no longer
// stays right for long, which is what made the old balance solvable.
export const SOLO_T = 40;
export const COMP_T = 25;

export const START = 1000; // opening fair value and print reference
export const TICK = 5; // smallest quote increment
export const MIN_SPREAD = 10;
export const BAND = 60;
export const INV_CAP = 10;
export const P_INFORMED = 0.45;
export const PRINT_PROB = 0.55;

export const V_SIGMA = 14; // per-tick fair-value step
export const JUMP_PROB = 0.08;
export const JUMP_MIN = 25;
export const JUMP_SPAN = 35; // jump size is JUMP_MIN + U(0, JUMP_SPAN)
export const NOISE_SIGMA = 26; // noise-trader reservation spread around the anchor
export const PRINT_SIGMA = 12; // exogenous print noise around fair value

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

// Canonical engine constants (spec-fixed, do not tune)
export const SOLO_T = 40;
export const COMP_T = 25;
export const MIN_SPREAD = 1.0;
export const INV_CAP = 10;
export const P_INFORMED = 0.45;
export const BAND = 4.0;
export const PRINT_PROB = 0.55;
export const NOISE_SIGMA = 1.8;

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

export const r2 = (x: number) => Math.round(x * 2) / 2;

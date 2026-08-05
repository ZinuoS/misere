import { INV_CAP, MIN_SPREAD, type Rng } from "./types";
import { clampMkt } from "./solo";

export interface ErisState {
  est: number;
  side: "high" | "low";
}

export const erisInit = (): ErisState => ({ est: 100, side: "high" });

// She overbids one side of her fair-value estimate and fights for the toxic flow.
// Flips sides two lots before the inventory cap; 10% random flip for spice.
export function erisQuotes(e: ErisState, inv: number, anchor: number, rng: Rng): [number, number] {
  if (inv >= INV_CAP - 2) e.side = "low";
  if (inv <= -INV_CAP + 2) e.side = "high";
  if (rng() < 0.1) e.side = e.side === "high" ? "low" : "high";
  let b: number, a: number;
  if (e.side === "high") {
    b = e.est + 0.5 + rng();
    a = b + MIN_SPREAD + 1.5;
  } else {
    a = e.est - 0.5 - rng();
    b = a - MIN_SPREAD - 1.5;
  }
  return clampMkt(b, a, anchor);
}

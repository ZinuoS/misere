import type { Rng } from "./types";

// mulberry32 — small seedable PRNG, plenty for a game
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// standard normal via Box-Muller; 1 - rng() keeps u strictly positive
export const randn = (rng: Rng) =>
  Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

// FNV-1a over an ISO date string ("2026-08-04") -> daily seed.
// Every player on the same date gets the bit-identical tape.
export const dateSeed = (iso: string) => {
  let h = 2166136261;
  for (let i = 0; i < iso.length; i++) {
    h ^= iso.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

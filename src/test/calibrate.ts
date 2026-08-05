/// <reference types="node" />
// Tier-band calibration: 1,000 seeded misère games across mixed policies.
// Prints the score distribution used to set the bands in ui/verdicts.ts.
import { mulberry32 } from "../engine/rng";
import { soloInit, soloStep, soloTruePnl } from "../engine/solo";
import { act, POLICIES } from "./dummy";

const scores: number[] = [];
let zeroFill = 0;

for (let seed = 1; seed <= 1000; seed++) {
  const policy = POLICIES[seed % POLICIES.length];
  const rng = mulberry32(seed);
  const s = soloInit();
  while (!s.done) {
    act(policy, s, rng);
    soloStep(s, rng);
  }
  if (s.fills.length === 0) zeroFill++;
  scores.push(-soloTruePnl(s)); // score = money destroyed
}

scores.sort((a, b) => a - b);
const q = (p: number) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))];
const pct = (lo: number, hi: number) =>
  ((scores.filter((x) => x >= lo && x < hi).length / scores.length) * 100).toFixed(1);

console.log("n=1000, zero-fill games:", zeroFill);
console.log("min", q(0).toFixed(2), "p25", q(0.25).toFixed(2), "median", q(0.5).toFixed(2),
  "p75", q(0.75).toFixed(2), "p90", q(0.9).toFixed(2), "p95", q(0.95).toFixed(2),
  "p99", q(0.99).toFixed(2), "max", scores[scores.length - 1].toFixed(2));

const rank = (v: number) => ((scores.filter((x) => x < v).length / scores.length) * 100).toFixed(1);
const show = (label: string, bands: [number, number, string][]) => {
  console.log(`\n${label}:`);
  for (const [lo, hi, name] of bands) {
    const edge = hi === Infinity ? `p${rank(lo)} and up` : `up to p${rank(hi)}`;
    console.log(`  ${pct(lo, hi).padStart(5)}%  ${name.padEnd(34)} ${edge}`);
  }
};

const CUTS = [1, 10, 25, 45, 75, 150];
console.log("\nold bands at the new scale:");
show("old", [
  [-Infinity, -15, "GENERATIONAL WEALTH"], [-15, -5, "RAINMAKER"], [-5, -1, "GOBLIN"],
  [-1, 1, "EMH"], [1, 10, "PETTY CASH"], [10, 25, "MONEY BURNER"], [25, 45, "GUH."],
  [45, 75, "CERTIFIED TOXIC"], [75, 150, "SUPERFUND"], [150, Infinity, "FINAL BOSS"],
]);
void CUTS;

// candidate: profit side scaled 10x, loss side pinned to the observed percentiles
show("calibrated for the 1000-level market", [
  [-Infinity, -300, "GENERATIONAL WEALTH (WRONG GAME)"],
  [-300, -100, "ACCIDENTAL RAINMAKER"],
  [-100, -20, "SPREAD GOBLIN"],
  [-20, 20, "THE EFFICIENT MARKET HYPOTHESIS"],
  [20, 150, "PETTY CASH ARSONIST"],
  [150, 400, "MONEY BURNER"],
  [400, 750, "GUH."],
  [750, 1200, "CERTIFIED TOXIC"],
  [1200, 2500, "SUPERFUND SITE"],
  [2500, Infinity, "FINAL BOSS OF ADVERSE SELECTION"],
]);

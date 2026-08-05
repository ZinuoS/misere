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

show("provisional", [
  [-Infinity, -15, "GENERATIONAL WEALTH (WRONG GAME)"],
  [-15, -5, "ACCIDENTAL RAINMAKER"],
  [-5, -1, "SPREAD GOBLIN"],
  [-1, 1, "EMH (DEROGATORY)"],
  [1, 8, "PETTY CASH ARSONIST"],
  [8, 16, "MONEY BURNER"],
  [16, 25, "GUH."],
  [25, 35, "CERTIFIED TOXIC"],
  [35, 45, "SUPERFUND SITE"],
  [45, Infinity, "FINAL BOSS OF ADVERSE SELECTION"],
]);

show("calibrated", [
  [-Infinity, -15, "GENERATIONAL WEALTH (WRONG GAME)"],
  [-15, -5, "ACCIDENTAL RAINMAKER"],
  [-5, -1, "SPREAD GOBLIN"],
  [-1, 1, "EMH (DEROGATORY)"],
  [1, 10, "PETTY CASH ARSONIST"],
  [10, 25, "MONEY BURNER"],
  [25, 45, "GUH."],
  [45, 75, "CERTIFIED TOXIC"],
  [75, 150, "SUPERFUND SITE"],
  [150, Infinity, "FINAL BOSS OF ADVERSE SELECTION"],
]);

/// <reference types="node" />
// Verdict tier calibration. Pools 1,000 seeded misere games from each reference
// bot, so the distribution spans real skill (RANDOM = none, EWMA = public info
// only, BAYES = full inference) instead of three crude scripted policies.
// Cuts are placed at fixed percentiles so every tier is reachable, the modal
// outcome lands mid-ladder, and the apex sits at ~p99.
import { mulberry32 } from "../engine/rng";
import { soloInit, soloStep, soloTruePnl } from "../engine/solo";
import { makeBot, type BotName } from "./bots";

const N = 1000;
const scores: number[] = [];
let zeroFill = 0;

for (const name of ["RANDOM", "EWMA", "BAYES"] as BotName[]) {
  for (let seed = 1; seed <= N; seed++) {
    const rng = mulberry32(seed);
    const s = soloInit(rng);
    const bot = makeBot(name, "misere");
    while (!s.done) {
      bot.quote(s, rng);
      soloStep(s, rng);
      bot.observe?.(s);
    }
    if (s.fills.length === 0) zeroFill++;
    scores.push(-soloTruePnl(s)); // score = money destroyed
  }
}

scores.sort((a, b) => a - b);
const q = (p: number) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))];
const rank = (v: number) => (scores.filter((x) => x < v).length / scores.length) * 100;

console.log(`n=${scores.length} (3 bots x ${N}), zero-fill games: ${zeroFill}`);
console.log(
  `min ${q(0).toFixed(0)}  p10 ${q(0.1).toFixed(0)}  p25 ${q(0.25).toFixed(0)}  median ${q(0.5).toFixed(0)}` +
  `  p75 ${q(0.75).toFixed(0)}  p90 ${q(0.9).toFixed(0)}  p99 ${q(0.99).toFixed(0)}  max ${scores.at(-1)!.toFixed(0)}`,
);

// 9 cuts -> 10 tiers. Apex at p99, median lands in tier 6 of 10.
const PCTS = [0.02, 0.06, 0.12, 0.22, 0.36, 0.52, 0.68, 0.84, 0.99];
const NAMES = [
  "GENERATIONAL WEALTH (WRONG GAME)", "ACCIDENTAL RAINMAKER", "SPREAD GOBLIN",
  "THE EFFICIENT MARKET HYPOTHESIS", "PETTY CASH ARSONIST", "MONEY BURNER",
  "GUH.", "CERTIFIED TOXIC", "SUPERFUND SITE", "FINAL BOSS OF ADVERSE SELECTION",
];
const nice = (x: number) => {
  const step = Math.abs(x) >= 500 ? 50 : Math.abs(x) >= 100 ? 25 : Math.abs(x) >= 20 ? 10 : 5;
  return Math.round(x / step) * step;
};
const cuts = PCTS.map((p) => nice(q(p)));

console.log("\nsuggested bands (paste the `lo` values into ui/verdicts.ts, highest first):");
for (let i = NAMES.length - 1; i >= 0; i--) {
  const lo = i === 0 ? -Infinity : cuts[i - 1];
  const hi = i === NAMES.length - 1 ? Infinity : cuts[i];
  const share = scores.filter((x) => x >= lo && x < hi).length / scores.length * 100;
  const edge = hi === Infinity ? `p${rank(lo).toFixed(1)} and up` : `up to p${rank(hi).toFixed(1)}`;
  console.log(
    `  lo ${String(lo === -Infinity ? "-inf" : lo).padStart(6)}   ${share.toFixed(1).padStart(5)}%  ${NAMES[i].padEnd(34)} ${edge}`,
  );
}

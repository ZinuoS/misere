/// <reference types="node" />
// Playability gates for the solo inference market. 1,000 seeded games per bot
// per mode. Exits 1 if any gate fails.
import { mulberry32 } from "../engine/rng";
import { soloInit, soloStep, soloTruePnl } from "../engine/solo";
import { decompose } from "../engine/decompose";
import { makeBot, type BotName, type Mode } from "./bots";
import { MIN_SPREAD } from "../engine/types";

const N = 1000;

interface Run {
  score: number;
  luck: number;
  tightBy20: boolean | null; // null = tick 20 fell in the news blackout
}

function play(name: BotName, mode: Mode, seed: number): Run {
  const rng = mulberry32(seed);
  const s = soloInit(rng);
  const bot = makeBot(name, mode);
  let tightBy20: boolean | null = null;

  while (!s.done) {
    bot.quote(s, rng);
    soloStep(s, rng);
    bot.observe?.(s);
    if (s.t === 20 && bot.sd) {
      // measure pre-news, or at least 8 ticks after it
      const clean = 20 < s.newsTick || 20 >= s.newsTick + 8;
      tightBy20 = clean ? bot.sd() < MIN_SPREAD : null;
    }
  }
  const d = decompose(s.fills, s.vPath, s.invPath, s.quoteLog);
  const pnl = soloTruePnl(s);
  const tot = Math.abs(d.sharpEdge) + Math.abs(d.noiseEdge) + Math.abs(d.invPnl);
  return {
    score: mode === "misere" ? -pnl : pnl,
    luck: tot > 0 ? Math.abs(d.invPnl) / tot : 0,
    tightBy20,
  };
}

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const effect = (a: number[], b: number[]) =>
  (mean(a) - mean(b)) / Math.sqrt((sd(a) ** 2 + sd(b) ** 2) / 2);

const runs: Record<string, Run[]> = {};
for (const mode of ["misere", "normal"] as Mode[]) {
  for (const name of ["RANDOM", "EWMA", "BAYES"] as BotName[]) {
    const out: Run[] = [];
    for (let seed = 1; seed <= N; seed++) out.push(play(name, mode, seed));
    runs[`${name}|${mode}`] = out;
  }
}

const show = (k: string) => {
  const r = runs[k];
  console.log(
    `${k.padEnd(14)} score mean ${mean(r.map((x) => x.score)).toFixed(1).padStart(8)}` +
    `  sd ${sd(r.map((x) => x.score)).toFixed(1).padStart(7)}` +
    `  median luck ${median(r.map((x) => x.luck)).toFixed(3)}`,
  );
};
console.log(`n=${N} per bot per mode\n`);
for (const k of Object.keys(runs)) show(k);

// ---- gate 1: luck share ----
const luck = median(runs["BAYES|misere"].map((r) => r.luck));
const g1 = luck < 0.35;

// ---- gate 2: learnability ----
const meas = runs["BAYES|misere"].map((r) => r.tightBy20).filter((x) => x !== null) as boolean[];
const tight = meas.filter(Boolean).length / meas.length;
const g2 = tight >= 0.7;

// ---- gate 3: skill gap ----
const gap = (mode: Mode) => {
  const B = runs[`BAYES|${mode}`].map((r) => r.score);
  const R = runs[`RANDOM|${mode}`].map((r) => r.score);
  const E = runs[`EWMA|${mode}`].map((r) => r.score);
  return { vsRandom: effect(B, R), vsEwma: effect(B, E) };
};
const gm = gap("misere");
const gn = gap("normal");
const g3 = gm.vsRandom > 1.0 && gm.vsEwma > 0.5;

console.log(`\nGATE 1 luck share      BAYES misere median ${luck.toFixed(3)} < 0.35        ${g1 ? "PASS" : "FAIL"}`);
console.log(`GATE 2 learnability    sd<${MIN_SPREAD} by tick 20 in ${(tight * 100).toFixed(1)}% (n=${meas.length}) >= 70%   ${g2 ? "PASS" : "FAIL"}`);
console.log(`GATE 3 skill gap       misere BAYES-RANDOM d=${gm.vsRandom.toFixed(2)} (>1.0), BAYES-EWMA d=${gm.vsEwma.toFixed(2)} (>0.5)  ${g3 ? "PASS" : "FAIL"}`);
console.log(`       (normal mode    BAYES-RANDOM d=${gn.vsRandom.toFixed(2)}, BAYES-EWMA d=${gn.vsEwma.toFixed(2)})`);

if (!(g1 && g2 && g3)) process.exit(1);

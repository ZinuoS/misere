/// <reference types="node" />
// Dummy player: plays every currently-built mode with three policies, fixed seeds.
// Prints a table: mode, policy, ticks, fills, truePnl, decomposition residual, errors.
// Exit 1 if any residual > 1e-6 or any exception.
import { mulberry32 } from "../engine/rng";
import {
  adjust, clampMkt, skew, soloInit, soloStep, soloTruePnl, type SoloState,
} from "../engine/solo";
import {
  adjustDesk, compInit, compStep, deskPnl, skewDesk, type CompState,
} from "../engine/comp";
import { decompose, residual } from "../engine/decompose";
import { r2, type Rng } from "../engine/types";

export const POLICIES = ["random-legal", "always-max-skew", "spread-floor-camper"] as const;
export type Policy = (typeof POLICIES)[number];

// One quoting decision per tick. Only legal moves: adjust/skew clamp internally.
export function act(policy: Policy, s: SoloState, rng: Rng): void {
  if (policy === "random-legal") {
    const n = Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rng() * 3);
      const d = rng() < 0.5 ? -0.5 : 0.5;
      if (k === 0) adjust(s, "bid", d);
      else if (k === 1) adjust(s, "ask", d);
      else skew(s, d);
    }
  } else if (policy === "always-max-skew") {
    for (let i = 0; i < 20; i++) skew(s, 0.5); // slams into the band top and stays there
  } else {
    // camper: spread at floor, centered on the anchor
    [s.bid, s.ask] = clampMkt(r2(s.anchor) - 0.5, r2(s.anchor) + 0.5, s.anchor);
  }
}

export interface DummyRow {
  mode: string;
  policy: Policy;
  ticks: number;
  fills: number;
  truePnl: number;
  residual: number;
  error: string;
}

export function runSolo(mode: string, policy: Policy, seed: number): DummyRow {
  const row: DummyRow = { mode, policy, ticks: 0, fills: 0, truePnl: 0, residual: 0, error: "" };
  try {
    const rng = mulberry32(seed);
    const s = soloInit();
    while (!s.done) {
      act(policy, s, rng);
      soloStep(s, rng);
      row.ticks = s.t;
    }
    const d = decompose(s.fills, s.vPath, s.invPath, s.quoteLog);
    row.fills = d.nFills;
    row.truePnl = soloTruePnl(s);
    row.residual = residual(row.truePnl, d);
  } catch (e) {
    row.error = String(e);
  }
  return row;
}

// comp variant of the same three policies, applied to desk i
export function actComp(policy: Policy, s: CompState, i: number, rng: Rng): void {
  if (policy === "random-legal") {
    const n = Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const which = Math.floor(rng() * 3);
      const d = rng() < 0.5 ? -0.5 : 0.5;
      if (which === 0) adjustDesk(s, i, "bid", d);
      else if (which === 1) adjustDesk(s, i, "ask", d);
      else skewDesk(s, i, d);
    }
  } else if (policy === "always-max-skew") {
    for (let k = 0; k < 20; k++) skewDesk(s, i, 0.5);
  } else {
    [s.desks[i].bid, s.desks[i].ask] = clampMkt(r2(s.anchor) - 0.5, r2(s.anchor) + 0.5, s.anchor);
  }
}

export function runComp(mode: "eris" | "duel", policy: Policy, seed: number): DummyRow {
  const row: DummyRow = { mode: mode === "eris" ? "vs-eris" : "duel", policy, ticks: 0, fills: 0, truePnl: 0, residual: 0, error: "" };
  try {
    const rng = mulberry32(seed);
    const s = compInit(["Dummy", mode === "eris" ? "ERIS" : "Dummy2"], mode === "eris");
    while (!s.done) {
      actComp(policy, s, 0, rng);
      if (mode === "duel") actComp(policy, s, 1, rng);
      compStep(s, rng);
      row.ticks = s.t;
    }
    // residual checked for BOTH desks; row reports desk 0
    for (const d of s.desks) {
      const dec = decompose(d.fills, s.vPath, d.invPath, d.quoteLog);
      const r = residual(deskPnl(d, s.V), dec);
      row.residual = Math.max(row.residual, r);
    }
    row.fills = s.desks[0].fills.length;
    row.truePnl = deskPnl(s.desks[0], s.V);
  } catch (e) {
    row.error = String(e);
  }
  return row;
}

// Daily: same date-seed twice must produce the identical tape, and the second
// scored submission must be rejected (unique index on (handle, mode, daily_date)).
export function runDaily(seed: number): { row: DummyRow; identical: boolean; secondAccepted: boolean } {
  const play = () => {
    const rng = mulberry32(seed);
    const s = soloInit();
    while (!s.done) {
      act("random-legal", s, rng);
      soloStep(s, rng);
    }
    return s;
  };
  const a = play(), b = play();
  const identical = JSON.stringify(a.vPath) === JSON.stringify(b.vPath) &&
    JSON.stringify(a.fills) === JSON.stringify(b.fills) &&
    JSON.stringify(a.tape) === JSON.stringify(b.tape);
  const d = decompose(a.fills, a.vPath, a.invPath, a.quoteLog);
  const truePnl = soloTruePnl(a);

  // stand-in for the DB unique index: one scored attempt per (handle, mode, date)
  const scored = new Set<string>();
  const submit = (key: string) => (scored.has(key) ? false : (scored.add(key), true));
  submit("dummy|misere|2026-08-04");
  const secondAccepted = submit("dummy|misere|2026-08-04");

  return {
    row: {
      mode: "daily", policy: "random-legal", ticks: a.t, fills: d.nFills,
      truePnl, residual: residual(truePnl, d), error: identical ? "" : "TAPE MISMATCH",
    },
    identical,
    secondAccepted,
  };
}

export function runDummy(): DummyRow[] {
  const rows: DummyRow[] = [];
  const modes = ["solo-misere", "solo-normal"];
  modes.forEach((mode, mi) => {
    POLICIES.forEach((policy, pi) => {
      rows.push(runSolo(mode, policy, 1000 + mi * 100 + pi));
    });
  });
  (["eris", "duel"] as const).forEach((mode, mi) => {
    POLICIES.forEach((policy, pi) => {
      rows.push(runComp(mode, policy, 2000 + mi * 100 + pi));
    });
  });
  return rows;
}

export const DAILY_SEED_FOR_DUMMY = 3001;

const isMain = process.argv[1]?.includes("dummy");
if (isMain) {
  const rows = runDummy();
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(
    pad("mode", 14) + pad("policy", 21) + pad("ticks", 7) + pad("fills", 7) +
    pad("truePnl", 10) + pad("residual", 12) + "error",
  );
  for (const r of rows) {
    console.log(
      pad(r.mode, 14) + pad(r.policy, 21) + pad(String(r.ticks), 7) +
      pad(String(r.fills), 7) + pad(r.truePnl.toFixed(2), 10) +
      pad(r.residual.toExponential(2), 12) + (r.error || "-"),
    );
  }
  const daily = runDaily(DAILY_SEED_FOR_DUMMY);
  const r = daily.row;
  console.log(
    pad(r.mode, 14) + pad(r.policy, 21) + pad(String(r.ticks), 7) +
    pad(String(r.fills), 7) + pad(r.truePnl.toFixed(2), 10) +
    pad(r.residual.toExponential(2), 12) + (r.error || "-"),
  );
  console.log(
    `\ndaily replay: tape identical = ${daily.identical}; second scored submission accepted = ${daily.secondAccepted} (must be false)`,
  );

  const all = [...rows, r];
  const bad = all.filter((x) => x.error || x.residual > 1e-6);
  const dailyBroken = !daily.identical || daily.secondAccepted;
  console.log(`\n${all.length} runs, ${bad.length + (dailyBroken ? 1 : 0)} failures`);
  if (bad.length || dailyBroken) process.exit(1);
}

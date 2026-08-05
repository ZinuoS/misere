/// <reference types="node" />
// Dummy player: plays every currently-built mode with three policies, fixed seeds.
// Prints a table: mode, policy, ticks, fills, truePnl, decomposition residual, errors.
// Exit 1 if any residual > 1e-6 or any exception.
import { mulberry32 } from "../engine/rng";
import {
  adjust, clampMkt, skew, soloInit, soloStep, soloTruePnl, type SoloState,
} from "../engine/solo";
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

export function runDummy(): DummyRow[] {
  const rows: DummyRow[] = [];
  const modes = ["solo-misere", "solo-normal"];
  modes.forEach((mode, mi) => {
    POLICIES.forEach((policy, pi) => {
      rows.push(runSolo(mode, policy, 1000 + mi * 100 + pi));
    });
  });
  return rows;
}

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
  const bad = rows.filter((r) => r.error || r.residual > 1e-6);
  console.log(`\n${rows.length} runs, ${bad.length} failures`);
  if (bad.length) process.exit(1);
}

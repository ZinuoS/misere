// Dummy player: plays every currently-built mode with three policies, fixed seed.
// M0: no engine exists yet — prints an empty table and exits 0 to prove the harness runs.

type Row = {
  mode: string;
  policy: string;
  ticks: number;
  fills: number;
  truePnl: number;
  residual: number;
  error: string;
};

const rows: Row[] = [];

const pad = (s: string, n: number) => s.padEnd(n);
console.log(
  pad("mode", 14) + pad("policy", 18) + pad("ticks", 7) + pad("fills", 7) +
  pad("truePnl", 10) + pad("residual", 12) + "error",
);
for (const r of rows) {
  console.log(
    pad(r.mode, 14) + pad(r.policy, 18) + pad(String(r.ticks), 7) +
    pad(String(r.fills), 7) + pad(r.truePnl.toFixed(2), 10) +
    pad(r.residual.toExponential(2), 12) + (r.error || "-"),
  );
}
console.log(`\n${rows.length} runs, 0 failures (M0: no engine built yet)`);

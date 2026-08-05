import { useEffect, useState } from "react";
import { fetchLeaderboard, fetchMyTelemetry, type LeaderRow, type TelemetryRow } from "../data/supabase";
import { sha256Hex, type Identity } from "../data/identity";
import { Panel } from "./atoms";

export function Leaderboard({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  useEffect(() => {
    fetchLeaderboard().then(setRows).catch(() => setRows([]));
  }, [refreshKey]);
  return (
    <Panel className="p-4" >
      <div data-testid="leaderboard">
        <div className="mb-2 text-xs uppercase tracking-widest text-muted">Hall of ruin — most destroyed (solo mis&egrave;re)</div>
        {!rows && <p className="text-xs text-muted">Loading&hellip;</p>}
        {rows && rows.length === 0 && (
          <p className="text-xs italic text-muted">
            Empty. No one has destroyed anything yet — claim the top spot by losing badly.
          </p>
        )}
        {rows?.map((r, i) => (
          <div key={r.handle} className="flex justify-between py-1 font-mono text-sm">
            <span><span className="text-muted">{i + 1}.</span> {r.handle}</span>
            <span className="text-gold">${(r.best_misere ?? 0).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function ResearchPanel({ identity, refreshKey }: { identity: Identity; refreshKey: number }) {
  const [rows, setRows] = useState<TelemetryRow[] | null>(null);
  const [dump, setDump] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        setRows(await fetchMyTelemetry(identity, await sha256Hex(identity.secret)));
      } catch {
        setRows([]);
      }
    })();
  }, [identity, refreshKey]);

  const agg = (mode: string) => {
    const g = (rows ?? []).filter((x) => x.mode === mode);
    if (!g.length) return null;
    const m = (f: (x: TelemetryRow) => number) => g.reduce((a, x) => a + f(x), 0) / g.length;
    return {
      n: g.length,
      pnl: m((x) => x.pnl),
      spread: m((x) => x.avgSpread),
      skew: m((x) => Math.abs(x.avgSkew)),
      sharpShare: m((x) => x.nSharp / Math.max(x.nFills, 1)),
    };
  };
  const mi = agg("misere"), no = agg("normal");

  return (
    <Panel className="p-4">
      <div data-testid="research">
        <div className="mb-2 text-xs uppercase tracking-widest text-muted">Your data — mis&egrave;re vs normal</div>
        {mi || no ? (
          <div className="font-mono text-xs leading-relaxed">
            {([["misere", mi], ["normal", no]] as const).map(([k, a]) => a && (
              <div key={k} className="mb-2">
                <span style={{ color: k === "misere" ? "var(--gold)" : "var(--p2)" }}>{k}</span>
                {` — n=${a.n}, avg pnl ${a.pnl.toFixed(2)}, avg spread ${a.spread.toFixed(2)}, avg |skew| ${a.skew.toFixed(2)}, sharp fill share ${(a.sharpShare * 100).toFixed(0)}%`}
              </div>
            ))}
            {mi && no && (
              <p className="mt-2 font-sans text-xs leading-relaxed text-muted" style={{ fontFamily: "georgia, serif" }}>
                The prospect-theory test: if your |skew| and sharp-fill share run higher in mis&egrave;re
                than reflected-normal play predicts, you are loss-seeking beyond the mirror image.
                Play both modes — and play the daily, where everyone gets the same tape.
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs italic text-muted">
            Finish solo games in both modes and the comparison appears here. This data stays on your account.
          </p>
        )}
        <button
          onClick={() => setDump(JSON.stringify(rows ?? [], null, 1))}
          className="mt-3 rounded-full border border-hair px-4 py-2 font-mono text-xs uppercase tracking-widest"
        >
          Export raw JSON
        </button>
        {dump !== null && (
          <textarea readOnly value={dump} className="mt-2 h-28 w-full rounded-md border border-hair bg-panel2 p-2 font-mono text-xs" />
        )}
      </div>
    </Panel>
  );
}

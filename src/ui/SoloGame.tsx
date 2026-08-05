import { useReducer, useRef } from "react";
import { mulberry32 } from "../engine/rng";
import {
  adjust, skew, soloInit, soloStep, soloTruePnl, type SoloState,
} from "../engine/solo";
import { decompose, residual } from "../engine/decompose";
import { INV_CAP, SOLO_T, type Rng } from "../engine/types";
import type { GameReport } from "../data/supabase";
import type { DailyStats } from "../data/daily";
import type { DailyResult } from "./Home";
import { BigBtn, money, QuotePanel, Stat, Tape } from "./atoms";
import { Recap } from "./Recap";

export function SoloGame({ mode, seed, daily, dailyShare, onExit, report }: {
  mode: "misere" | "normal";
  seed: number;
  daily?: string; // ISO date of the scored daily this run represents
  dailyShare?: { result: DailyResult | null; stats: DailyStats };
  onExit: () => void;
  report: (r: GameReport) => void;
}) {
  const misere = mode === "misere";
  const sRef = useRef<SoloState | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const startRef = useRef(Date.now());
  const [gen, force] = useReducer((x: number) => x + 1, 0);
  if (sRef.current === null) {
    sRef.current = soloInit();
    rngRef.current = mulberry32(seed + (daily ? 0 : gen));
    startRef.current = Date.now();
  }
  const s = sRef.current;

  const doStep = () => {
    soloStep(s, rngRef.current!);
    if (s.done) {
      const d = decompose(s.fills, s.vPath, s.invPath, s.quoteLog);
      const pnl = soloTruePnl(s);
      if (import.meta.env.DEV) {
        const r = residual(pnl, d);
        if (r > 1e-6) throw new Error(`decomposition identity broken: residual ${r}`);
      }
      report({
        mode,
        pnl,
        sharpEdge: d.sharpEdge, noiseEdge: d.noiseEdge, invPnl: d.invPnl,
        nFills: d.nFills, nSharp: d.nSharp, avgSpread: d.avgSpread, avgSkew: d.avgSkew,
        durationMs: Date.now() - startRef.current,
        dailyDate: daily,
      });
    }
    force();
  };
  const restart = () => {
    sRef.current = null;
    force(); // re-init on next render with seed + gen
  };

  const mtm = s.cash + s.inv * s.lastRef;
  const good = misere ? mtm < 0 : mtm > 0;

  return (
    <div className="flex flex-col gap-4">
      {!s.done ? (
        <>
          <div className="flex items-center justify-between rounded-lg border border-hair bg-panel p-4">
            <Stat label="P&L (marked)" value={money(mtm)} color={good ? "var(--gold)" : "var(--red)"} />
            <Stat label="Position" value={(s.inv > 0 ? "+" : "") + s.inv} color={Math.abs(s.inv) >= INV_CAP ? "var(--red)" : "var(--ink)"} />
            <Stat label="Tick" value={`${s.t}/${SOLO_T}`} />
          </div>
          <QuotePanel
            title={daily ? "The daily (lose)" : misere ? "Your market (lose)" : "Your market (make)"}
            bid={s.bid} ask={s.ask} ref_={s.lastRef}
            onAdj={(w, d) => { adjust(s, w, d); force(); }}
            onSkew={(d) => { skew(s, d); force(); }}
            accent="var(--gold)"
          />
          <BigBtn onClick={doStep} testid="tick">Post quotes &rarr; next tick</BigBtn>
          <Tape entries={s.tape} />
        </>
      ) : (
        <>
          <Recap s={s} mode={mode} dailyShare={daily ? dailyShare : undefined} />
          {!daily && <BigBtn onClick={restart} testid="again">{misere ? "Lose again" : "Run it back"}</BigBtn>}
          <BigBtn subtle onClick={onExit}>{daily ? "Back to the desk" : "Change mode"}</BigBtn>
        </>
      )}
    </div>
  );
}

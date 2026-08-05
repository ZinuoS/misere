import { useReducer, useRef } from "react";
import { mulberry32 } from "../engine/rng";
import {
  adjust, skew, soloInit, soloStep, soloTruePnl, type SoloState,
} from "../engine/solo";
import { decompose, residual } from "../engine/decompose";
import { INV_CAP, SOLO_T, type Rng } from "../engine/types";
import { BigBtn, money, QuotePanel, Stat, Tape } from "./atoms";
import { Recap } from "./Recap";

export function SoloGame({ mode, seed, onExit, onDone }: {
  mode: "misere" | "normal";
  seed: number;
  onExit: () => void;
  onDone?: (s: SoloState) => void;
}) {
  const misere = mode === "misere";
  const sRef = useRef<SoloState | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const [gen, force] = useReducer((x: number) => x + 1, 0);
  if (sRef.current === null) {
    sRef.current = soloInit();
    rngRef.current = mulberry32(seed + gen);
  }
  const s = sRef.current;

  const doStep = () => {
    soloStep(s, rngRef.current!);
    if (s.done) {
      if (import.meta.env.DEV) {
        const d = decompose(s.fills, s.vPath, s.invPath, s.quoteLog);
        const r = residual(soloTruePnl(s), d);
        if (r > 1e-6) throw new Error(`decomposition identity broken: residual ${r}`);
      }
      onDone?.(s);
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
            title={misere ? "Your market (lose)" : "Your market (make)"}
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
          <Recap s={s} mode={mode} />
          <BigBtn onClick={restart} testid="again">{misere ? "Lose again" : "Run it back"}</BigBtn>
          <BigBtn subtle onClick={onExit}>Change mode</BigBtn>
        </>
      )}
    </div>
  );
}

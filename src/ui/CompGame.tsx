import { useMemo, useReducer, useRef } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { mulberry32 } from "../engine/rng";
import {
  adjustDesk, compInit, compStep, deskPnl, skewDesk, type CompState,
} from "../engine/comp";
import { decompose } from "../engine/decompose";
import { COMP_T, type Rng } from "../engine/types";
import type { GameReport } from "../data/supabase";
import { BigBtn, money, Panel, QuotePanel, Stat, Tape } from "./atoms";

const ACCENTS = ["var(--gold)", "var(--p2)"];

export function CompGame({ vsBot, seed, onExit, report }: {
  vsBot: boolean;
  seed: number;
  onExit: () => void;
  report: (r: GameReport) => void;
}) {
  const names: [string, string] = vsBot ? ["You", "ERIS"] : ["Player 1", "Player 2"];
  const sRef = useRef<CompState | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const startRef = useRef(Date.now());
  const handRef = useRef<{ adjusting: number; confirmed: [boolean, boolean] }>({ adjusting: 0, confirmed: [false, false] });
  const [gen, force] = useReducer((x: number) => x + 1, 0);
  if (sRef.current === null) {
    sRef.current = compInit(names, vsBot);
    rngRef.current = mulberry32(seed + gen);
    startRef.current = Date.now();
    handRef.current = { adjusting: 0, confirmed: [false, false] };
  }
  const s = sRef.current;
  const hand = handRef.current;

  const resolve = () => {
    compStep(s, rngRef.current!);
    if (s.done) {
      const d0 = decompose(s.desks[0].fills, s.vPath, s.desks[0].invPath, s.desks[0].quoteLog);
      report({
        mode: vsBot ? "eris" : "duel",
        pnl: deskPnl(s.desks[0], s.V),
        sharpEdge: d0.sharpEdge, noiseEdge: d0.noiseEdge, invPnl: d0.invPnl,
        nFills: d0.nFills, nSharp: d0.nSharp, avgSpread: d0.avgSpread, avgSkew: d0.avgSkew,
        durationMs: Date.now() - startRef.current,
      });
    }
    hand.adjusting = 0;
    hand.confirmed = [false, false];
    force();
  };

  const confirmTurn = () => {
    hand.confirmed[hand.adjusting] = true;
    const other = 1 - hand.adjusting;
    if (!hand.confirmed[other]) hand.adjusting = other;
    force();
  };

  const bothConfirmed = hand.confirmed[0] && hand.confirmed[1];
  const pnls = s.desks.map((d) => deskPnl(d, s.V));
  const mtms = s.desks.map((d) => d.cash + d.inv * s.lastRef);
  const winner = pnls[0] === pnls[1] ? null : pnls[0] < pnls[1] ? 0 : 1;
  const chartData = useMemo(
    () => s.done
      ? s.vPath.map((V, i) => ({
          t: i, V,
          f0: s.desks[0].fills.find((f) => f.t === i)?.price ?? null,
          f1: s.desks[1].fills.find((f) => f.t === i)?.price ?? null,
        }))
      : [],
    [s.done, s.vPath, s.desks],
  );

  return (
    <div className="flex flex-col gap-4">
      {!s.done ? (
        <>
          <div className="grid grid-cols-3 items-center gap-2 rounded-lg border border-hair bg-panel p-4">
            {s.desks.map((d, i) => (
              <Stat key={i} label={d.name} value={money(mtms[i])} color={mtms[i] < 0 ? ACCENTS[i] : "var(--red)"} />
            ))}
            <Stat label="Tick" value={`${s.t}/${COMP_T}`} />
          </div>
          {vsBot ? (
            <>
              <QuotePanel title="Your market" bid={s.desks[0].bid} ask={s.desks[0].ask} ref_={s.lastRef}
                onAdj={(w, d) => { adjustDesk(s, 0, w, d); force(); }}
                onSkew={(d) => { skewDesk(s, 0, d); force(); }} accent={ACCENTS[0]} />
              <QuotePanel title={`ERIS — inv ${s.desks[1].inv > 0 ? "+" : ""}${s.desks[1].inv}`}
                bid={s.desks[1].bid} ask={s.desks[1].ask} ref_={s.lastRef} readOnly accent={ACCENTS[1]} />
              <BigBtn onClick={resolve} testid="tick">Post quotes &rarr; next tick</BigBtn>
            </>
          ) : (
            <>
              <QuotePanel title={`${s.desks[hand.adjusting].name} — your turn`}
                bid={s.desks[hand.adjusting].bid} ask={s.desks[hand.adjusting].ask} ref_={s.lastRef}
                onAdj={(w, d) => { adjustDesk(s, hand.adjusting, w, d); force(); }}
                onSkew={(d) => { skewDesk(s, hand.adjusting, d); force(); }} accent={ACCENTS[hand.adjusting]} />
              <QuotePanel title={`${s.desks[1 - hand.adjusting].name}${hand.confirmed[1 - hand.adjusting] ? " — locked" : ""}`}
                bid={s.desks[1 - hand.adjusting].bid} ask={s.desks[1 - hand.adjusting].ask} ref_={s.lastRef}
                readOnly accent={ACCENTS[1 - hand.adjusting]} />
              {!bothConfirmed
                ? <BigBtn onClick={confirmTurn} testid="lock">Lock quotes &rarr; pass the phone</BigBtn>
                : <BigBtn onClick={resolve} testid="tick">Resolve tick</BigBtn>}
            </>
          )}
          <Tape entries={s.tape} />
        </>
      ) : (
        <>
          <div data-testid="verdict" className="rounded-lg border border-hair bg-panel p-5 text-center">
            <div className="font-display text-2xl font-black uppercase tracking-tight">
              {winner === null ? "A perfect tie in ruin." : `${s.desks[winner].name} loses best.`}
            </div>
            <div className="mt-3 flex justify-center gap-8">
              {s.desks.map((d, i) => (
                <div key={i} className="flex flex-col items-center">
                  <span className="text-xs uppercase tracking-widest" style={{ color: ACCENTS[i] }}>{d.name}</span>
                  <span className="font-mono text-2xl" style={{ color: pnls[i] < 0 ? ACCENTS[i] : "var(--red)" }}>
                    {money(pnls[i])}
                  </span>
                  <span className="text-xs text-muted">{d.fills.length} fills</span>
                </div>
              ))}
            </div>
          </div>
          <Panel className="p-3">
            <div className="mb-2 text-xs uppercase tracking-widest text-muted">Hidden fair value &amp; fills</div>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <XAxis dataKey="t" tick={{ fill: "var(--muted)", fontSize: 10 }} stroke="var(--hair)" />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--muted)", fontSize: 10 }} stroke="var(--hair)" />
                  <Tooltip contentStyle={{ background: "var(--paper)", border: "1px solid var(--hair)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--muted)" }} />
                  <ReferenceLine y={100} stroke="var(--hair)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="V" stroke="var(--ink)" dot={false} strokeWidth={1.5} name="fair value" isAnimationActive={false} />
                  <Scatter dataKey="f0" fill="var(--gold)" name={s.desks[0].name} isAnimationActive={false} />
                  <Scatter dataKey="f1" fill="var(--p2)" name={s.desks[1].name} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <BigBtn onClick={() => { sRef.current = null; force(); }} testid="again">Rematch</BigBtn>
          <BigBtn subtle onClick={onExit}>Change mode</BigBtn>
        </>
      )}
    </div>
  );
}

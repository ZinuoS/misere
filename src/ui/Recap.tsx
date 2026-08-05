import { useMemo } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import type { SoloState } from "../engine/solo";
import { soloTruePnl, soloBotPnl } from "../engine/solo";
import { decompose } from "../engine/decompose";
import { money, Panel, WBar } from "./atoms";
import { verdict } from "./verdicts";

export function Recap({ s, mode }: { s: SoloState; mode: "misere" | "normal" }) {
  const misere = mode === "misere";
  const truePnl = soloTruePnl(s);
  const botPnl = soloBotPnl(s);
  const stats = useMemo(() => decompose(s.fills, s.vPath, s.invPath, s.quoteLog), [s]);
  const score = misere ? -truePnl : truePnl;
  const v = verdict(mode, score);
  const maxAbs = Math.max(Math.abs(stats.sharpEdge), Math.abs(stats.noiseEdge), Math.abs(stats.invPnl), 1);
  const chartData = useMemo(
    () => s.vPath.map((V, i) => ({ t: i, V, fill: s.fills.find((f) => f.t === i)?.price ?? null })),
    [s],
  );
  const achieved = score > 0;

  return (
    <div className="flex flex-col gap-4">
      <div data-testid="verdict" className="overflow-hidden rounded-lg border border-hair bg-panel">
        <div className="newsprint max-h-56">
          <img src={v.img} alt="" />
        </div>
        <div className="p-5 text-center">
          <h2 className="font-display text-3xl font-black uppercase leading-tight tracking-tight">
            {v.headline}
          </h2>
          <p className="mt-2 text-xs uppercase tracking-widest text-muted">{v.sub}</p>
          <div className="mt-3 text-xs uppercase tracking-widest text-muted">
            {misere
              ? achieved ? "money destroyed" : "money made, regrettably"
              : achieved ? "money made" : "money lost"}
          </div>
          <div className="my-1 font-mono text-5xl" style={{ color: achieved ? "var(--gold)" : "var(--red)" }}>
            {achieved ? "$" + score.toFixed(2) : money(truePnl)}
          </div>
        </div>
      </div>

      <Panel className="p-4">
        <div data-testid="decomp">
          <div className="mb-3 text-xs uppercase tracking-widest text-muted">P&amp;L decomposition</div>
          <WBar label={`vs sharps — adverse selection (${stats.nSharp} fills)`} value={stats.sharpEdge} max={maxAbs} goodWhenNegative={misere} />
          <WBar label={`vs noise — spread capture (${stats.nFills - stats.nSharp} fills)`} value={stats.noiseEdge} max={maxAbs} goodWhenNegative={misere} />
          <WBar label="inventory drift" value={stats.invPnl} max={maxAbs} goodWhenNegative={misere} />
          <div className="mt-3 flex justify-between border-t border-hair pt-2 text-xs">
            <span className="text-muted">total (identity check)</span>
            <span className="font-mono text-ink">{money(stats.sharpEdge + stats.noiseEdge + stats.invPnl)}</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {misere
              ? "Skill is the sharps bar: losses there mean you found fair value and quoted against it. Noise donations and inventory luck don't count as craft."
              : "Skill is noise capture net of the sharps bar. Inventory drift is the part you can't claim."}{" "}
            Honest bot, same tape: <span className="font-mono text-ink">{money(botPnl)}</span>.
            Avg spread {stats.avgSpread.toFixed(2)}, avg skew {stats.avgSkew >= 0 ? "+" : ""}{stats.avgSkew.toFixed(2)}.
          </p>
        </div>
      </Panel>

      <Panel className="p-3">
        <div className="mb-2 text-xs uppercase tracking-widest text-muted">Hidden fair value &amp; your fills</div>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <XAxis dataKey="t" tick={{ fill: "var(--muted)", fontSize: 10 }} stroke="var(--hair)" />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--muted)", fontSize: 10 }} stroke="var(--hair)" />
              <Tooltip contentStyle={{ background: "var(--paper)", border: "1px solid var(--hair)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--muted)" }} />
              <ReferenceLine y={100} stroke="var(--hair)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="V" stroke="var(--ink)" dot={false} strokeWidth={1.5} name="fair value" isAnimationActive={false} />
              <Scatter dataKey="fill" fill="var(--gold)" name="your fills" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="text-xs uppercase tracking-widest text-muted">Desk head review</div>
        <p className="mt-2 font-display text-sm font-black uppercase tracking-wide text-ink">
          Reviews resume when the desk head returns from the Hamptons.
        </p>
      </Panel>
    </div>
  );
}

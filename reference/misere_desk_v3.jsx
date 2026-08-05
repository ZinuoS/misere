import React, { useState, useEffect, useMemo } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

// ---------- palette ----------
const C = {
  ink: "#0B0E14", panel: "#141926", panel2: "#1B2233",
  bone: "#E7E2D5", muted: "#8A93A6",
  gold: "#E8B84B", red: "#E4573D",
  bid: "#7FA8C9", ask: "#C98A7F", hair: "#252D40", p2: "#8FB6A6",
};

const randn = () => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const SOLO_T = 40, COMP_T = 25;
const MIN_SPREAD = 1.0, INV_CAP = 10, P_INFORMED = 0.45, BAND = 4.0;
const r2 = (x) => Math.round(x * 2) / 2;
const money = (x) => (x >= 0 ? "+$" : "\u2212$") + Math.abs(x).toFixed(2);

const evolveV = (V) => {
  let v = V + randn() * 0.8;
  if (Math.random() < 0.06) v += (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
  return Math.round(v * 100) / 100;
};

// band + spread clamp — anchored to the print EWMA, not your own fills (tape-painting patch)
const clampMkt = (bid, ask, anchor) => {
  let b = Math.min(Math.max(bid, anchor - BAND), anchor + BAND - MIN_SPREAD);
  let a = Math.min(Math.max(ask, anchor - BAND + MIN_SPREAD), anchor + BAND);
  if (a - b < MIN_SPREAD) a = b + MIN_SPREAD;
  return [r2(b), r2(a)];
};

// ---------- persistent storage helpers ----------
const sGet = async (k, shared = false) => {
  try { const r = await window.storage.get(k, shared); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
};
const sSet = async (k, v, shared = false) => {
  try { await window.storage.set(k, JSON.stringify(v), shared); return true; }
  catch { return false; }
};
const sList = async (prefix, shared = false) => {
  try { const r = await window.storage.list(prefix, shared); return r ? r.keys : []; }
  catch { return []; }
};

// ---------- UI atoms ----------
const Stat = ({ label, value, color }) => (
  <div className="flex flex-col items-start">
    <span className="text-xs tracking-widest uppercase" style={{ color: C.muted }}>{label}</span>
    <span className="font-mono text-base" style={{ color: color || C.bone }}>{value}</span>
  </div>
);
const QBtn = ({ onClick, children, tone }) => (
  <button onClick={onClick}
    className="w-10 h-10 rounded-md font-mono text-lg active:scale-95 transition-transform"
    style={{ background: C.panel2, color: tone, border: `1px solid ${C.hair}` }}>{children}</button>
);
const BigBtn = ({ onClick, children, subtle, disabled }) => (
  <button onClick={onClick} disabled={disabled}
    className="w-full py-3 rounded-md font-mono uppercase tracking-widest text-sm active:scale-[0.99] transition-transform disabled:opacity-40"
    style={subtle ? { background: C.panel2, color: C.bone, border: `1px solid ${C.hair}` } : { background: C.gold, color: C.ink }}>
    {children}
  </button>
);

const QuotePanel = ({ title, bid, ask, ref_, onAdj, onSkew, readOnly, accent }) => (
  <div className="rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${readOnly ? C.hair : accent}` }}>
    <div className="flex justify-between text-xs uppercase tracking-widest mb-2" style={{ color: C.muted }}>
      <span style={{ color: accent }}>{title}</span>
      <span>ref <span className="font-mono" style={{ color: C.bone }}>{ref_.toFixed(2)}</span></span>
    </div>
    <div className="flex justify-between items-center">
      <div className="flex flex-col items-center gap-2">
        <span className="font-mono text-2xl" style={{ color: C.bid }}>{bid.toFixed(2)}</span>
        {!readOnly && <div className="flex gap-2">
          <QBtn tone={C.bid} onClick={() => onAdj("bid", -0.5)}>&minus;</QBtn>
          <QBtn tone={C.bid} onClick={() => onAdj("bid", 0.5)}>+</QBtn>
        </div>}
        <span className="text-xs uppercase tracking-widest" style={{ color: C.muted }}>bid</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-xs uppercase tracking-widest" style={{ color: C.muted }}>spread</span>
        <span className="font-mono" style={{ color: ask - bid <= MIN_SPREAD + 1e-9 ? C.gold : C.bone }}>{(ask - bid).toFixed(2)}</span>
        {!readOnly && <>
          <div className="flex gap-2 mt-2">
            <QBtn tone={C.bone} onClick={() => onSkew(-0.5)}>&laquo;</QBtn>
            <QBtn tone={C.bone} onClick={() => onSkew(0.5)}>&raquo;</QBtn>
          </div>
          <span className="text-xs mt-1" style={{ color: C.muted }}>skew</span>
        </>}
      </div>
      <div className="flex flex-col items-center gap-2">
        <span className="font-mono text-2xl" style={{ color: C.ask }}>{ask.toFixed(2)}</span>
        {!readOnly && <div className="flex gap-2">
          <QBtn tone={C.ask} onClick={() => onAdj("ask", -0.5)}>&minus;</QBtn>
          <QBtn tone={C.ask} onClick={() => onAdj("ask", 0.5)}>+</QBtn>
        </div>}
        <span className="text-xs uppercase tracking-widest" style={{ color: C.muted }}>offer</span>
      </div>
    </div>
  </div>
);

const Tape = ({ entries }) => (
  <div className="rounded-lg p-3" style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.muted }}>Tape</div>
    <div className="flex flex-col-reverse gap-1 max-h-32 overflow-y-auto font-mono text-xs leading-relaxed">
      {entries.slice(-14).map((e, i) => (
        <div key={i} style={{ color: e.kind === "sharp" ? C.red : e.kind === "noise" ? C.gold : e.kind === "print" ? C.bid : C.muted }}>
          <span style={{ color: C.muted }}>{String(e.t).padStart(2, "0")}&nbsp;</span>{e.text}
        </div>
      ))}
    </div>
  </div>
);

function EndChart({ data, series }) {
  return (
    <div className="rounded-lg p-3" style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
      <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.muted }}>Hidden fair value &amp; fills</div>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <XAxis dataKey="t" tick={{ fill: C.muted, fontSize: 10 }} stroke={C.hair} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: C.muted, fontSize: 10 }} stroke={C.hair} />
            <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.hair}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.muted }} />
            <ReferenceLine y={100} stroke={C.hair} strokeDasharray="3 3" />
            <Line type="monotone" dataKey="V" stroke={C.bone} dot={false} strokeWidth={1.5} name="fair value" />
            {series.map((sr) => <Scatter key={sr.key} dataKey={sr.key} fill={sr.color} name={sr.name} />)}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// signed horizontal waterfall bar
const WBar = ({ label, value, max, goodWhenNegative }) => {
  const pct = Math.min(Math.abs(value) / (max || 1), 1) * 100;
  const good = goodWhenNegative ? value < 0 : value > 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: C.muted }}>{label}</span>
        <span className="font-mono" style={{ color: good ? C.gold : C.red }}>{money(value)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: C.panel2 }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: good ? C.gold : C.red }} />
      </div>
    </div>
  );
};

// =================================================================
// SOLO ENGINE — objective: "suicide" (lose) or "normal" (make)
// =================================================================
const soloInit = () => ({
  t: 0, V: 100, vPath: [100], invPath: [0], lastRef: 100, anchor: 100,
  bid: 99, ask: 101, cash: 0, inv: 0,
  fills: [],           // {t, price, side, sharp, edge} edge = MM fill PnL vs V
  quoteLog: [],        // {t, bid, ask, anchor} telemetry
  tape: [{ t: 0, text: "Session open. Reference print 100.00.", kind: "sys" }],
  bot: { est: 100, cash: 0, inv: 0 }, done: false,
});

function SoloMode({ objective, onExit, handle }) {
  const suicide = objective === "suicide";
  const [s, setS] = useState(soloInit);
  const [saved, setSaved] = useState(false);

  const adj = (which, d) => setS((p) => {
    let bid = p.bid, ask = p.ask;
    if (which === "bid") bid = r2(bid + d); else ask = r2(ask + d);
    if (ask - bid < MIN_SPREAD - 1e-9) return p;
    [bid, ask] = clampMkt(bid, ask, p.anchor);
    return { ...p, bid, ask };
  });
  const skew = (d) => setS((p) => {
    const [bid, ask] = clampMkt(p.bid + d, p.ask + d, p.anchor);
    return { ...p, bid, ask };
  });

  const step = () => setS((p) => {
    if (p.done) return p;
    const t = p.t + 1;
    const V = evolveV(p.V);
    const tape = [...p.tape];
    let { cash, inv, lastRef, anchor } = p;
    const fills = [...p.fills];
    const bot = { ...p.bot };

    if (Math.random() < 0.55) {
      const pr = Math.round((V + randn()) * 100) / 100;
      lastRef = pr;
      anchor = 0.6 * anchor + 0.4 * pr;   // crowd anchors to prints only
      tape.push({ t, text: `Print elsewhere @ ${pr.toFixed(2)}`, kind: "print" });
      bot.est = 0.7 * bot.est + 0.3 * pr;
    }

    const informed = Math.random() < P_INFORMED;
    const noiseSide = Math.random() < 0.5 ? "buy" : "sell";
    const reservation = anchor + randn() * 1.8;
    const tryFill = (bid, ask) => {
      if (informed) {
        if (V > ask) return { side: "buy", price: ask };
        if (V < bid) return { side: "sell", price: bid };
        return null;
      }
      if (noiseSide === "buy" && ask <= reservation) return { side: "buy", price: ask };
      if (noiseSide === "sell" && bid >= reservation) return { side: "sell", price: bid };
      return null;
    };

    const f = tryFill(p.bid, p.ask);
    if (f) {
      const blocked = (f.side === "buy" && inv <= -INV_CAP) || (f.side === "sell" && inv >= INV_CAP);
      if (blocked) tape.push({ t, text: "Inventory cap — quote pulled.", kind: "sys" });
      else {
        let edge;
        if (f.side === "buy") { cash += f.price; inv -= 1; edge = f.price - V; }
        else { cash -= f.price; inv += 1; edge = V - f.price; }
        lastRef = f.price;
        fills.push({ t, price: f.price, side: f.side, sharp: informed, edge });
        tape.push({
          t,
          text: `${informed ? "Sharp" : "Noise"} ${f.side === "buy" ? "lifts your offer" : "hits your bid"} @ ${f.price.toFixed(2)}`,
          kind: informed ? "sharp" : "noise",
        });
      }
    } else tape.push({ t, text: "No interest in your market.", kind: "sys" });

    const bb = r2(bot.est - 0.75), ba = r2(bot.est + 0.75);
    const bf = tryFill(bb, ba);
    if (bf) {
      if (bf.side === "buy") { bot.cash += bf.price; bot.inv -= 1; bot.est += 0.3; }
      else { bot.cash -= bf.price; bot.inv += 1; bot.est -= 0.3; }
    }

    return {
      ...p, t, V, vPath: [...p.vPath, V], invPath: [...p.invPath, inv],
      lastRef, anchor, cash, inv, fills,
      quoteLog: [...p.quoteLog, { t, bid: p.bid, ask: p.ask, anchor }],
      tape: tape.slice(-60), bot, done: t >= SOLO_T,
    };
  });

  const truePnl = s.cash + s.inv * s.V;
  const stats = useMemo(() => {
    if (!s.done) return null;
    const sharpEdge = s.fills.filter((f) => f.sharp).reduce((a, f) => a + f.edge, 0);
    const noiseEdge = s.fills.filter((f) => !f.sharp).reduce((a, f) => a + f.edge, 0);
    let invPnl = 0;
    for (let i = 0; i < s.vPath.length - 1; i++) invPnl += s.invPath[i] * (s.vPath[i + 1] - s.vPath[i]);
    const avgSpread = s.quoteLog.reduce((a, q) => a + (q.ask - q.bid), 0) / (s.quoteLog.length || 1);
    const avgSkew = s.quoteLog.reduce((a, q) => a + ((q.bid + q.ask) / 2 - q.anchor), 0) / (s.quoteLog.length || 1);
    return { sharpEdge, noiseEdge, invPnl, avgSpread, avgSkew, nFills: s.fills.length, nSharp: s.fills.filter((f) => f.sharp).length };
  }, [s.done, s.fills, s.vPath, s.invPath, s.quoteLog]);

  const score = suicide ? -truePnl : truePnl;

  useEffect(() => {
    if (!s.done || saved || !stats) return;
    setSaved(true);
    (async () => {
      const summary = {
        ts: Date.now(), mode: objective, pnl: +truePnl.toFixed(2),
        sharpEdge: +stats.sharpEdge.toFixed(2), noiseEdge: +stats.noiseEdge.toFixed(2),
        invPnl: +stats.invPnl.toFixed(2), nFills: stats.nFills, nSharp: stats.nSharp,
        avgSpread: +stats.avgSpread.toFixed(2), avgSkew: +stats.avgSkew.toFixed(2),
      };
      const hist = (await sGet("md3:history")) || [];
      hist.push(summary);
      await sSet("md3:history", hist.slice(-50));
      if (handle) {
        const key = "md3lb:" + handle;
        const prev = (await sGet(key, true)) || { handle, bestSuicide: null, bestNormal: null };
        const field = suicide ? "bestSuicide" : "bestNormal";
        if (prev[field] === null || score > prev[field]) prev[field] = +score.toFixed(2);
        prev.ts = Date.now();
        await sSet(key, prev, true);
      }
    })();
  }, [s.done, saved, stats]);

  const chartData = useMemo(() => s.done
    ? s.vPath.map((v, i) => ({ t: i, V: v, fill: s.fills.find((f) => f.t === i)?.price ?? null }))
    : [], [s.done, s.vPath, s.fills]);
  const botPnl = s.bot.cash + s.bot.inv * s.V;
  const mtm = s.cash + s.inv * s.lastRef;

  return (
    <div className="flex flex-col gap-4">
      {!s.done && <>
        <div className="rounded-lg p-4 flex justify-between items-center" style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
          <Stat label="P&L (marked)" value={money(mtm)} color={(suicide ? mtm < 0 : mtm > 0) ? C.gold : C.red} />
          <Stat label="Position" value={(s.inv > 0 ? "+" : "") + s.inv} color={Math.abs(s.inv) >= INV_CAP ? C.red : C.bone} />
          <Stat label="Tick" value={`${s.t}/${SOLO_T}`} />
        </div>
        <QuotePanel title={suicide ? "Your market (lose)" : "Your market (make)"} bid={s.bid} ask={s.ask} ref_={s.lastRef}
          onAdj={adj} onSkew={skew} accent={C.gold} />
        <BigBtn onClick={step}>Post quotes &rarr; next tick</BigBtn>
        <Tape entries={s.tape} />
      </>}

      {s.done && stats && <>
        <Recap objective={objective} truePnl={truePnl} botPnl={botPnl} stats={stats} handle={handle} />
        <EndChart data={chartData} series={[{ key: "fill", color: C.gold, name: "your fills" }]} />
        <BigBtn onClick={() => { setS(soloInit()); setSaved(false); }}>{suicide ? "Lose again" : "Run it back"}</BigBtn>
        <BigBtn subtle onClick={onExit}>Change mode</BigBtn>
      </>}
    </div>
  );
}

// =================================================================
// RECAP — decomposition, history trend, AI desk-head review
// =================================================================
function Recap({ objective, truePnl, botPnl, stats, handle }) {
  const suicide = objective === "suicide";
  const score = suicide ? -truePnl : truePnl;
  const [hist, setHist] = useState(null);
  const [ai, setAi] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => { (async () => setHist(((await sGet("md3:history")) || []).filter((h) => h.mode === objective)))(); }, []);

  const prior = hist ? hist.slice(0, -1) : [];
  const best = prior.length ? Math.max(...prior.map((h) => (suicide ? -h.pnl : h.pnl))) : null;
  const maxAbs = Math.max(Math.abs(stats.sharpEdge), Math.abs(stats.noiseEdge), Math.abs(stats.invPnl), 1);

  const askDeskHead = async () => {
    setAiLoading(true);
    try {
      const histNote = prior.slice(-5).map((h) => `pnl ${h.pnl}, sharpEdge ${h.sharpEdge}, noiseEdge ${h.noiseEdge}, invPnl ${h.invPnl}`).join(" | ");
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content:
              `You are the dry, laconic desk head reviewing a trainee in a "misere market making" game where the objective is to ${suicide ? "LOSE as much money as possible (losses to sharps are skill; profits from noise flow and lucky inventory are failure)" : "make money normally"}. ` +
              `This game: total PnL ${truePnl.toFixed(2)}, PnL vs sharp (informed) flow ${stats.sharpEdge.toFixed(2)}, PnL vs noise flow ${stats.noiseEdge.toFixed(2)}, inventory drift PnL ${stats.invPnl.toFixed(2)}, fills ${stats.nFills} (${stats.nSharp} sharp), avg spread ${stats.avgSpread.toFixed(2)}, avg quote skew vs consensus ${stats.avgSkew.toFixed(2)}. An honest benchmark bot on the same tape made ${botPnl.toFixed(2)}. ` +
              (histNote ? `Their recent prior games: ${histNote}. Comment on progression. ` : "This is their first tracked game. ") +
              `Give a performance review in under 110 words: one verdict line, the single biggest leak in their play with the number that proves it, and one concrete adjustment for next session. Plain text, no headers, no bullet points.`,
          }],
        }),
      });
      const data = await resp.json();
      setAi(data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n") || "The desk head looked at your blotter and walked away.");
    } catch {
      setAi("The desk head is on the golf course. Try again later.");
    }
    setAiLoading(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg p-5 text-center" style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
        <div className="text-xs uppercase tracking-widest" style={{ color: C.muted }}>
          {suicide ? "money destroyed" : "money made"}
        </div>
        <div className="font-mono text-5xl my-2" style={{ color: score > 0 ? C.gold : C.red }}>
          {score > 0 ? "$" + score.toFixed(2) : money(truePnl)}
        </div>
        {best !== null && (
          <p className="text-xs" style={{ color: C.muted }}>
            personal best {"$" + Math.max(best, 0).toFixed(2)} &middot; game {(hist?.length ?? 1)} in this mode
            {score > best ? " — new record." : ""}
          </p>
        )}
      </div>

      <div className="rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
        <div className="text-xs uppercase tracking-widest mb-3" style={{ color: C.muted }}>P&amp;L decomposition</div>
        <WBar label={`vs sharps — adverse selection (${stats.nSharp} fills)`} value={stats.sharpEdge} max={maxAbs} goodWhenNegative={suicide} />
        <WBar label={`vs noise — spread capture (${stats.nFills - stats.nSharp} fills)`} value={stats.noiseEdge} max={maxAbs} goodWhenNegative={suicide} />
        <WBar label="inventory drift" value={stats.invPnl} max={maxAbs} goodWhenNegative={suicide} />
        <div className="flex justify-between text-xs mt-3 pt-2 border-t" style={{ borderColor: C.hair }}>
          <span style={{ color: C.muted }}>total (identity check)</span>
          <span className="font-mono" style={{ color: C.bone }}>{money(stats.sharpEdge + stats.noiseEdge + stats.invPnl)}</span>
        </div>
        <p className="text-xs mt-3 leading-relaxed" style={{ color: C.muted }}>
          {suicide
            ? "Skill is the sharps bar: losses there mean you found fair value and quoted against it. Noise donations and inventory luck don't count as craft."
            : "Skill is noise capture net of the sharps bar. Inventory drift is the part you can't claim."}
          {" "}Honest bot, same tape: <span className="font-mono" style={{ color: C.bone }}>{money(botPnl)}</span>. Avg spread {stats.avgSpread.toFixed(2)}, avg skew {stats.avgSkew >= 0 ? "+" : ""}{stats.avgSkew.toFixed(2)}.
        </p>
      </div>

      <div className="rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
        <div className="flex justify-between items-center">
          <span className="text-xs uppercase tracking-widest" style={{ color: C.muted }}>Desk head review</span>
          {!ai && <button onClick={askDeskHead} disabled={aiLoading} className="text-xs uppercase tracking-widest px-3 py-2 rounded-md"
            style={{ background: C.panel2, color: C.gold, border: `1px solid ${C.hair}` }}>
            {aiLoading ? "reviewing\u2026" : "request review"}
          </button>}
        </div>
        {ai && <p className="text-sm mt-3 leading-relaxed whitespace-pre-line" style={{ color: C.bone }}>{ai}</p>}
        {!ai && !aiLoading && <p className="text-xs mt-2" style={{ color: C.muted }}>An AI desk head reads your blotter and your last five sessions, and names your biggest leak.</p>}
      </div>
    </div>
  );
}

// =================================================================
// COMPETITIVE (vs ERIS / duel)
// =================================================================
const compInit = (names) => ({
  t: 0, V: 100, vPath: [100], lastRef: 100, anchor: 100,
  tape: [{ t: 0, text: "Two desks, one tape. Worst P&L wins.", kind: "sys" }],
  players: names.map((n) => ({ name: n, bid: 99, ask: 101, cash: 0, inv: 0, fills: [] })),
  botEst: 100, botSide: "high", adjusting: 0, confirmed: [false, false], done: false,
});

function CompMode({ vsBot, onExit }) {
  const names = vsBot ? ["You", "ERIS"] : ["Player 1", "Player 2"];
  const accents = [C.gold, C.p2];
  const [s, setS] = useState(() => compInit(names));

  const adjP = (idx, which, d) => setS((p) => {
    const pl = { ...p.players[idx] };
    if (which === "bid") pl.bid = r2(pl.bid + d); else pl.ask = r2(pl.ask + d);
    if (pl.ask - pl.bid < MIN_SPREAD - 1e-9) return p;
    const cl = clampMkt(pl.bid, pl.ask, p.anchor);
    pl.bid = cl[0]; pl.ask = cl[1];
    const players = [...p.players]; players[idx] = pl;
    return { ...p, players };
  });
  const skewP = (idx, d) => setS((p) => {
    const pl = { ...p.players[idx] };
    const cl = clampMkt(pl.bid + d, pl.ask + d, p.anchor);
    pl.bid = cl[0]; pl.ask = cl[1];
    const players = [...p.players]; players[idx] = pl;
    return { ...p, players };
  });

  const resolve = () => setS((p) => {
    if (p.done) return p;
    const t = p.t + 1;
    const V = evolveV(p.V);
    const tape = [...p.tape];
    let { lastRef, anchor, botEst, botSide } = p;
    const players = p.players.map((pl) => ({ ...pl, fills: [...pl.fills] }));

    if (Math.random() < 0.55) {
      const pr = Math.round((V + randn()) * 100) / 100;
      lastRef = pr; anchor = 0.6 * anchor + 0.4 * pr;
      tape.push({ t, text: `Print elsewhere @ ${pr.toFixed(2)}`, kind: "print" });
      botEst = 0.7 * botEst + 0.3 * pr;
    }

    if (vsBot) {
      if (players[1].inv >= INV_CAP - 2) botSide = "low";
      if (players[1].inv <= -INV_CAP + 2) botSide = "high";
      if (Math.random() < 0.1) botSide = botSide === "high" ? "low" : "high";
      let b, a;
      if (botSide === "high") { b = botEst + 0.5 + Math.random(); a = b + MIN_SPREAD + 1.5; }
      else { a = botEst - 0.5 - Math.random(); b = a - MIN_SPREAD - 1.5; }
      const cl = clampMkt(b, a, anchor);
      players[1].bid = cl[0]; players[1].ask = cl[1];
    }

    const informed = Math.random() < P_INFORMED;
    const noiseSide = Math.random() < 0.5 ? "buy" : "sell";
    const reservation = anchor + randn() * 1.8;
    const canSell = (pl) => pl.inv > -INV_CAP, canBuy = (pl) => pl.inv < INV_CAP;
    const bestAsk = () => {
      const el = players.map((pl, i) => ({ i, a: pl.ask })).filter(({ i }) => canSell(players[i]));
      if (!el.length) return null;
      const m = Math.min(...el.map((e) => e.a));
      const tied = el.filter((e) => e.a === m);
      return tied[Math.floor(Math.random() * tied.length)];
    };
    const bestBid = () => {
      const el = players.map((pl, i) => ({ i, b: pl.bid })).filter(({ i }) => canBuy(players[i]));
      if (!el.length) return null;
      const m = Math.max(...el.map((e) => e.b));
      const tied = el.filter((e) => e.b === m);
      return tied[Math.floor(Math.random() * tied.length)];
    };

    let traded = false;
    const doTrade = (side, winner, price, sharp) => {
      const pl = players[winner.i];
      if (side === "buy") { pl.cash += price; pl.inv -= 1; } else { pl.cash -= price; pl.inv += 1; }
      pl.fills.push({ t, price });
      lastRef = price;
      tape.push({ t, text: `${sharp ? "Sharp" : "Noise"} ${side === "buy" ? "lifts" : "hits"} ${pl.name} @ ${price.toFixed(2)}`, kind: sharp ? "sharp" : "noise" });
      if (vsBot && winner.i === 1) botEst += side === "buy" ? 0.3 : -0.3;
      traded = true;
    };

    if (informed) {
      const a = bestAsk(), b = bestBid();
      if (a && V > a.a) doTrade("buy", a, a.a, true);
      else if (b && V < b.b) doTrade("sell", b, b.b, true);
    } else if (noiseSide === "buy") {
      const a = bestAsk(); if (a && a.a <= reservation) doTrade("buy", a, a.a, false);
    } else {
      const b = bestBid(); if (b && b.b >= reservation) doTrade("sell", b, b.b, false);
    }
    if (!traded) tape.push({ t, text: "Trader walks — nobody's price was interesting.", kind: "sys" });

    return { ...p, t, V, vPath: [...p.vPath, V], lastRef, anchor, tape: tape.slice(-60), players, botEst, botSide, done: t >= COMP_T, adjusting: t % 2, confirmed: [false, false] };
  });

  const confirmTurn = () => setS((p) => {
    const conf = [...p.confirmed]; conf[p.adjusting] = true;
    const other = 1 - p.adjusting;
    return { ...p, confirmed: conf, adjusting: conf[other] ? p.adjusting : other };
  });
  const bothConfirmed = s.confirmed[0] && s.confirmed[1];
  const pnls = s.players.map((pl) => pl.cash + pl.inv * s.V);
  const mtms = s.players.map((pl) => pl.cash + pl.inv * s.lastRef);
  const chartData = useMemo(() => s.done
    ? s.vPath.map((v, i) => ({
        t: i, V: v,
        f0: s.players[0].fills.find((f) => f.t === i)?.price ?? null,
        f1: s.players[1].fills.find((f) => f.t === i)?.price ?? null,
      })) : [], [s.done, s.vPath, s.players]);
  const winner = pnls[0] === pnls[1] ? null : pnls[0] < pnls[1] ? 0 : 1;

  return (
    <div className="flex flex-col gap-4">
      {!s.done && <>
        <div className="rounded-lg p-4 grid grid-cols-3 gap-2 items-center" style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
          {s.players.map((pl, i) => <Stat key={i} label={pl.name} value={money(mtms[i])} color={mtms[i] < 0 ? accents[i] : C.red} />)}
          <Stat label="Tick" value={`${s.t}/${COMP_T}`} />
        </div>
        {vsBot ? <>
          <QuotePanel title="Your market" bid={s.players[0].bid} ask={s.players[0].ask} ref_={s.lastRef}
            onAdj={(w, d) => adjP(0, w, d)} onSkew={(d) => skewP(0, d)} accent={C.gold} />
          <QuotePanel title={`ERIS — inv ${s.players[1].inv > 0 ? "+" : ""}${s.players[1].inv}`}
            bid={s.players[1].bid} ask={s.players[1].ask} ref_={s.lastRef} readOnly accent={C.p2} />
          <BigBtn onClick={resolve}>Post quotes &rarr; next tick</BigBtn>
        </> : <>
          <QuotePanel title={`${s.players[s.adjusting].name} — your turn`}
            bid={s.players[s.adjusting].bid} ask={s.players[s.adjusting].ask} ref_={s.lastRef}
            onAdj={(w, d) => adjP(s.adjusting, w, d)} onSkew={(d) => skewP(s.adjusting, d)} accent={accents[s.adjusting]} />
          <QuotePanel title={`${s.players[1 - s.adjusting].name}${s.confirmed[1 - s.adjusting] ? " — locked" : ""}`}
            bid={s.players[1 - s.adjusting].bid} ask={s.players[1 - s.adjusting].ask} ref_={s.lastRef} readOnly accent={accents[1 - s.adjusting]} />
          {!bothConfirmed
            ? <BigBtn onClick={confirmTurn}>Lock quotes &rarr; pass the phone</BigBtn>
            : <BigBtn onClick={resolve}>Resolve tick</BigBtn>}
        </>}
        <Tape entries={s.tape} />
      </>}
      {s.done && <>
        <div className="rounded-lg p-5 text-center" style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
          <div className="font-serif text-2xl my-1">{winner === null ? "A perfect tie in ruin." : `${s.players[winner].name} loses best.`}</div>
          <div className="flex justify-center gap-8 mt-3">
            {s.players.map((pl, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className="text-xs uppercase tracking-widest" style={{ color: accents[i] }}>{pl.name}</span>
                <span className="font-mono text-2xl" style={{ color: pnls[i] < 0 ? accents[i] : C.red }}>{money(pnls[i])}</span>
                <span className="text-xs" style={{ color: C.muted }}>{pl.fills.length} fills</span>
              </div>
            ))}
          </div>
        </div>
        <EndChart data={chartData} series={[
          { key: "f0", color: accents[0], name: s.players[0].name },
          { key: "f1", color: accents[1], name: s.players[1].name },
        ]} />
        <BigBtn onClick={() => setS(compInit(names))}>Rematch</BigBtn>
        <BigBtn subtle onClick={onExit}>Change mode</BigBtn>
      </>}
    </div>
  );
}

// =================================================================
// LEADERBOARD + RESEARCH PANEL
// =================================================================
function Leaderboard() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    (async () => {
      const keys = (await sList("md3lb:", true)).slice(0, 20);
      const out = [];
      for (const k of keys) { const v = await sGet(k, true); if (v) out.push(v); }
      setRows(out);
    })();
  }, []);
  const bySuicide = rows ? [...rows].filter((r) => r.bestSuicide !== null && r.bestSuicide !== undefined).sort((a, b) => b.bestSuicide - a.bestSuicide).slice(0, 8) : [];
  return (
    <div className="rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
      <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.muted }}>Hall of ruin — most money destroyed (solo)</div>
      {!rows && <p className="text-xs" style={{ color: C.muted }}>Loading&hellip;</p>}
      {rows && bySuicide.length === 0 && <p className="text-xs" style={{ color: C.muted }}>Empty. No one has lost anything yet. Shameful.</p>}
      {bySuicide.map((r, i) => (
        <div key={r.handle} className="flex justify-between font-mono text-sm py-1">
          <span style={{ color: C.bone }}><span style={{ color: C.muted }}>{i + 1}.</span> {r.handle}</span>
          <span style={{ color: C.gold }}>${(r.bestSuicide ?? 0).toFixed(2)}</span>
        </div>
      ))}
      <p className="text-xs mt-2" style={{ color: C.muted }}>Scores submitted under a handle are visible to anyone using this artifact.</p>
    </div>
  );
}

function ResearchPanel() {
  const [dump, setDump] = useState(null);
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    (async () => {
      const h = (await sGet("md3:history")) || [];
      const agg = (mode) => {
        const g = h.filter((x) => x.mode === mode);
        if (!g.length) return null;
        const m = (f) => g.reduce((a, x) => a + f(x), 0) / g.length;
        return { n: g.length, pnl: m((x) => x.pnl), spread: m((x) => x.avgSpread), skew: m((x) => Math.abs(x.avgSkew)), sharpShare: m((x) => x.nSharp / Math.max(x.nFills, 1)) };
      };
      setSummary({ suicide: agg("suicide"), normal: agg("normal"), raw: h });
    })();
  }, []);
  return (
    <div className="rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
      <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.muted }}>Your data — mis&egrave;re vs normal</div>
      {summary && (summary.suicide || summary.normal) ? (
        <div className="text-xs font-mono leading-relaxed" style={{ color: C.bone }}>
          {["suicide", "normal"].map((m) => summary[m] && (
            <div key={m} className="mb-2">
              <span style={{ color: m === "suicide" ? C.gold : C.p2 }}>{m}</span>
              {` — n=${summary[m].n}, avg pnl ${summary[m].pnl.toFixed(2)}, avg spread ${summary[m].spread.toFixed(2)}, avg |skew| ${summary[m].skew.toFixed(2)}, sharp fill share ${(summary[m].sharpShare * 100).toFixed(0)}%`}
            </div>
          ))}
          {summary.suicide && summary.normal && (
            <p style={{ color: C.muted }} className="font-sans leading-relaxed mt-2">
              The prospect-theory test: if your |skew| and sharp-fill share run higher in mis&egrave;re mode than reflected-normal play predicts, you are loss-seeking beyond the mirror image. Play both modes and watch this panel.
            </p>
          )}
        </div>
      ) : <p className="text-xs" style={{ color: C.muted }}>Finish solo games in both modes and the comparison appears here. This data stays on your account.</p>}
      <button onClick={() => setDump(summary ? JSON.stringify(summary.raw, null, 1) : "[]")}
        className="mt-3 text-xs uppercase tracking-widest px-3 py-2 rounded-md"
        style={{ background: C.panel2, color: C.bone, border: `1px solid ${C.hair}` }}>
        Export raw JSON
      </button>
      {dump && <textarea readOnly value={dump} className="w-full h-28 mt-2 rounded-md p-2 font-mono text-xs"
        style={{ background: C.ink, color: C.bone, border: `1px solid ${C.hair}` }} />}
    </div>
  );
}

// =================================================================
// APP SHELL
// =================================================================
export default function App() {
  const [mode, setMode] = useState(null);
  const [handle, setHandle] = useState("");
  const [handleInput, setHandleInput] = useState("");

  useEffect(() => { (async () => { const h = await sGet("md3:handle"); if (h) { setHandle(h); setHandleInput(h); } })(); }, []);
  const saveHandle = async () => {
    const clean = handleInput.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
    setHandle(clean); setHandleInput(clean);
    await sSet("md3:handle", clean);
  };

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: C.ink, color: C.bone }}>
      <div className="w-full max-w-md px-4 py-6 flex flex-col gap-4">
        <header className="flex items-end justify-between border-b pb-3" style={{ borderColor: C.hair }}>
          <div>
            <h1 className="font-serif text-2xl leading-none" style={{ letterSpacing: "0.02em" }}>Mis&egrave;re&nbsp;Desk</h1>
            <p className="text-xs mt-1" style={{ color: C.muted }}>the market makers who must lose</p>
          </div>
          {mode && <button onClick={() => setMode(null)} className="text-xs uppercase tracking-widest" style={{ color: C.muted }}>&larr; modes</button>}
        </header>

        {!mode && <div className="flex flex-col gap-3">
          <div className="rounded-lg p-3 flex gap-2 items-center" style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
            <input value={handleInput} onChange={(e) => setHandleInput(e.target.value)} placeholder="handle for the leaderboard"
              className="flex-1 bg-transparent font-mono text-sm outline-none px-2 py-2 rounded-md"
              style={{ border: `1px solid ${C.hair}`, color: C.bone }} />
            <button onClick={saveHandle} className="text-xs uppercase tracking-widest px-3 py-2 rounded-md"
              style={{ background: C.panel2, color: C.gold, border: `1px solid ${C.hair}` }}>
              {handle ? "update" : "set"}
            </button>
          </div>
          {[
            { id: "solo", h: "Solo — mis\u00e8re", b: `Lose as much as possible in ${SOLO_T} ticks. Full recap: P&L decomposition, desk-head review, personal history.` },
            { id: "normal", h: "Solo — normal", b: "Same engine, opposite objective: make money. Play both and the research panel compares your behavior across regimes." },
            { id: "bot", h: "vs ERIS", b: `She overbids one side of her fair-value estimate and fights you for the toxic flow. ${COMP_T} ticks.` },
            { id: "duel", h: "Duel", b: `Pass-and-play. Best price wins the flow, worst P&L wins the game. ${COMP_T} ticks.` },
          ].map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className="text-left rounded-lg p-4 active:scale-[0.99] transition-transform"
              style={{ background: C.panel, border: `1px solid ${C.hair}` }}>
              <div className="font-serif text-lg" style={{ color: m.id === "normal" ? C.p2 : C.gold }}>{m.h}</div>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: C.muted }}>{m.b}</p>
            </button>
          ))}
          <Leaderboard />
          <ResearchPanel />
          <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: C.panel, border: `1px solid ${C.hair}`, color: C.muted }}>
            House rules: spread &ge; {MIN_SPREAD.toFixed(2)}, quotes within &plusmn;{BAND.toFixed(0)} of the print consensus, inventory &plusmn;{INV_CAP}, ~45% sharps. The crowd anchors to exogenous prints, not your fills — the tape-painting ratchet is patched.
          </div>
        </div>}

        {mode === "solo" && <SoloMode objective="suicide" handle={handle} onExit={() => setMode(null)} />}
        {mode === "normal" && <SoloMode objective="normal" handle={handle} onExit={() => setMode(null)} />}
        {mode === "bot" && <CompMode vsBot onExit={() => setMode(null)} />}
        {mode === "duel" && <CompMode vsBot={false} onExit={() => setMode(null)} />}

        <footer className="text-center text-xs pb-4" style={{ color: C.muted }}>
          Glosten&ndash;Milgrom, sign flipped. The filter is the same; only the control changes.
        </footer>
      </div>
    </div>
  );
}

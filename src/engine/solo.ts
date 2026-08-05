import {
  BAND, INV_CAP, JUMP_MIN, JUMP_PROB, JUMP_SPAN, MIN_SPREAD, NOISE_SIGMA, P_INFORMED,
  PRINT_PROB, PRINT_SIGMA, SOLO_T, START, TICK, V_SIGMA,
  r2, type Fill, type QuoteRec, type Rng, type Side, type StepOpts, type TapeEntry,
} from "./types";
import { randn } from "./rng";

export const evolveV = (V: number, rng: Rng) => {
  let v = V + randn(rng) * V_SIGMA;
  if (rng() < JUMP_PROB) v += (rng() < 0.5 ? -1 : 1) * (JUMP_MIN + rng() * JUMP_SPAN);
  return Math.round(v * 100) / 100;
};

const ceil2 = (x: number) => Math.ceil(x / TICK) * TICK;
const floor2 = (x: number) => Math.floor(x / TICK) * TICK;

// Band + spread clamp, anchored to the print-only EWMA (tape-painting patch).
// Band edges snap inward to the 0.5 grid so rounded quotes can never escape
// the band or cross — the effective band is up to 0.5 narrower than ±BAND.
export const clampMkt = (bid: number, ask: number, anchor: number): [number, number] => {
  const lo = ceil2(anchor - BAND);
  const hi = floor2(anchor + BAND);
  let b = r2(Math.min(Math.max(bid, lo), hi - MIN_SPREAD));
  let a = r2(Math.min(Math.max(ask, lo + MIN_SPREAD), hi));
  if (a - b < MIN_SPREAD) a = b + MIN_SPREAD;
  return [b, a];
};

export interface SoloState {
  t: number;
  V: number;
  vPath: number[];
  invPath: number[];
  lastRef: number;
  anchor: number;
  bid: number;
  ask: number;
  cash: number;
  inv: number;
  fills: Fill[];
  quoteLog: QuoteRec[];
  tape: TapeEntry[];
  bot: { est: number; cash: number; inv: number }; // honest benchmark bot, same tape
  done: boolean;
}

export const soloInit = (): SoloState => ({
  t: 0, V: START, vPath: [START], invPath: [0], lastRef: START, anchor: START,
  bid: START - MIN_SPREAD / 2, ask: START + MIN_SPREAD / 2, cash: 0, inv: 0,
  fills: [], quoteLog: [],
  tape: [{ t: 0, text: `Session open. Reference print ${START.toFixed(2)}.`, kind: "sys" }],
  bot: { est: START, cash: 0, inv: 0 },
  done: false,
});

export function adjust(s: SoloState, which: "bid" | "ask", d: number): void {
  let bid = s.bid, ask = s.ask;
  if (which === "bid") bid = r2(bid + d); else ask = r2(ask + d);
  if (ask - bid < MIN_SPREAD - 1e-9) return;
  [s.bid, s.ask] = clampMkt(bid, ask, s.anchor);
}

export function skew(s: SoloState, d: number): void {
  [s.bid, s.ask] = clampMkt(s.bid + d, s.ask + d, s.anchor);
}

export function soloStep(s: SoloState, rng: Rng, opts: StepOpts = {}): void {
  if (s.done) return;
  const printProb = opts.printProb ?? PRINT_PROB;
  const t = ++s.t;
  s.V = evolveV(s.V, rng);

  if (rng() < printProb) {
    const pr = Math.round((s.V + randn(rng) * PRINT_SIGMA) * 100) / 100;
    s.lastRef = pr;
    s.anchor = 0.6 * s.anchor + 0.4 * pr; // crowd anchors to prints only
    s.tape.push({ t, text: `Print elsewhere @ ${pr.toFixed(2)}`, kind: "print" });
    s.bot.est = 0.7 * s.bot.est + 0.3 * pr;
  }

  const informed = rng() < P_INFORMED;
  const noiseSide: Side = rng() < 0.5 ? "buy" : "sell";
  const reservation = s.anchor + randn(rng) * NOISE_SIGMA;
  const tryFill = (bid: number, ask: number): { side: Side; price: number } | null => {
    if (informed) {
      if (s.V > ask) return { side: "buy", price: ask };
      if (s.V < bid) return { side: "sell", price: bid };
      return null;
    }
    if (noiseSide === "buy" && ask <= reservation) return { side: "buy", price: ask };
    if (noiseSide === "sell" && bid >= reservation) return { side: "sell", price: bid };
    return null;
  };

  const f = tryFill(s.bid, s.ask);
  if (f) {
    const blocked =
      (f.side === "buy" && s.inv <= -INV_CAP) || (f.side === "sell" && s.inv >= INV_CAP);
    if (blocked) s.tape.push({ t, text: "Inventory cap - quote pulled.", kind: "sys" });
    else {
      let edge: number;
      if (f.side === "buy") { s.cash += f.price; s.inv -= 1; edge = f.price - s.V; }
      else { s.cash -= f.price; s.inv += 1; edge = s.V - f.price; }
      s.lastRef = f.price; // moves the visible ref, never the anchor
      s.fills.push({ t, price: f.price, side: f.side, sharp: informed, edge });
      s.tape.push({
        t,
        text: `${informed ? "Sharp" : "Noise"} ${f.side === "buy" ? "lifts your offer" : "hits your bid"} @ ${f.price.toFixed(2)}`,
        kind: informed ? "sharp" : "noise",
      });
    }
  } else s.tape.push({ t, text: "No interest in your market.", kind: "sys" });

  const bb = r2(s.bot.est - MIN_SPREAD * 0.75), ba = r2(s.bot.est + MIN_SPREAD * 0.75);
  const bf = tryFill(bb, ba);
  if (bf) {
    if (bf.side === "buy") { s.bot.cash += bf.price; s.bot.inv -= 1; s.bot.est += TICK * 0.6; }
    else { s.bot.cash -= bf.price; s.bot.inv += 1; s.bot.est -= TICK * 0.6; }
  }

  s.vPath.push(s.V);
  s.invPath.push(s.inv);
  s.quoteLog.push({ t, bid: s.bid, ask: s.ask, anchor: s.anchor });
  s.tape = s.tape.slice(-60);
  s.done = t >= SOLO_T;
}

export const soloTruePnl = (s: SoloState) => s.cash + s.inv * s.V;
export const soloBotPnl = (s: SoloState) => s.bot.cash + s.bot.inv * s.V;

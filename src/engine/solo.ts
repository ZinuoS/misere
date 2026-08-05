import {
  COMP_BAND, COMP_JUMP_MIN, COMP_JUMP_PROB, COMP_JUMP_SPAN, COMP_V_SIGMA,
  INV_CAP, MIN_SPREAD, NEWS_MAX_T, NEWS_MIN, NEWS_MIN_T, NEWS_SPAN, NOISE_SIGMA,
  P_INFORMED, PRINT_SIGMA, SOLO_T, TUNE, V_MAX, V_MID, V_MIN, V_SIGMA,
  r2, reflect,
  type Fill, type QuoteRec, type Rng, type Side, type StepOpts, type TapeEntry,
} from "./types";
import { randn } from "./rng";

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Competitive fair value: fast, jumpy, unbounded. Unchanged. */
export const evolveV = (V: number, rng: Rng) => {
  let v = V + randn(rng) * COMP_V_SIGMA;
  if (rng() < COMP_JUMP_PROB) {
    v += (rng() < 0.5 ? -1 : 1) * (COMP_JUMP_MIN + rng() * COMP_JUMP_SPAN);
  }
  return round2(v);
};

const ceilT = (x: number) => Math.ceil(x / 5) * 5;
const floorT = (x: number) => Math.floor(x / 5) * 5;

/**
 * Competitive band clamp, anchored to the print-only EWMA (tape-painting patch).
 * Solo does NOT use this — see clampSolo.
 */
export const clampMkt = (bid: number, ask: number, anchor: number): [number, number] => {
  const lo = ceilT(anchor - COMP_BAND);
  const hi = floorT(anchor + COMP_BAND);
  let b = r2(Math.min(Math.max(bid, lo), hi - MIN_SPREAD));
  let a = r2(Math.min(Math.max(ask, lo + MIN_SPREAD), hi));
  if (a - b < MIN_SPREAD) a = b + MIN_SPREAD;
  return [b, a];
};

/**
 * Solo clamp. Quotes live in [V_MIN, V_MAX] and additionally within TUNE.SOLO_BAND
 * of the public print anchor, so the most you can misprice is bounded by what the
 * tape has revealed. See TUNE for why that bound has to exist.
 */
export const clampSolo = (bid: number, ask: number, anchor = V_MID): [number, number] => {
  const lo = Math.max(V_MIN, ceilT(anchor - TUNE.SOLO_BAND));
  const hi = Math.min(V_MAX, floorT(anchor + TUNE.SOLO_BAND));
  let b = r2(Math.min(Math.max(bid, lo), hi - MIN_SPREAD));
  let a = r2(Math.min(Math.max(ask, lo + MIN_SPREAD), hi));
  if (a - b < MIN_SPREAD) {
    a = b + MIN_SPREAD;
    if (a > V_MAX) { a = V_MAX; b = V_MAX - MIN_SPREAD; }
  }
  return [b, a];
};

export interface SoloState {
  t: number;
  V: number;
  vPath: number[];
  invPath: number[];
  lastRef: number | null; // null until the first exogenous print
  anchor: number;
  bid: number;
  ask: number;
  cash: number;
  inv: number;
  fills: Fill[];
  quoteLog: QuoteRec[];
  tape: TapeEntry[];
  newsTick: number;
  newsSize: number;
  bot: { est: number; cash: number; inv: number }; // honest benchmark bot, same tape
  done: boolean;
}

/**
 * Draws V0, the news tick and the news size from the injected PRNG, so a daily
 * seed pins the entire scenario, not just the drift.
 */
export const soloInit = (rng: Rng): SoloState => {
  const V0 = round2(V_MIN + rng() * (V_MAX - V_MIN));
  const newsTick = NEWS_MIN_T + Math.floor(rng() * (NEWS_MAX_T - NEWS_MIN_T + 1));
  const newsSize = (rng() < 0.5 ? -1 : 1) * (NEWS_MIN + rng() * NEWS_SPAN);
  return {
    t: 0, V: V0, vPath: [V0], invPath: [0], lastRef: null, anchor: V_MID,
    bid: 250, ask: 750, cash: 0, inv: 0,
    fills: [], quoteLog: [],
    tape: [{ t: 0, text: `Session open. Fair value is somewhere in ${V_MIN}-${V_MAX}.`, kind: "sys" }],
    newsTick, newsSize,
    bot: { est: V_MID, cash: 0, inv: 0 },
    done: false,
  };
};

export function adjust(s: SoloState, which: "bid" | "ask", d: number): void {
  let bid = s.bid, ask = s.ask;
  if (which === "bid") bid = r2(bid + d); else ask = r2(ask + d);
  if (ask - bid < MIN_SPREAD - 1e-9) return;
  [s.bid, s.ask] = clampSolo(bid, ask, s.anchor);
}

export function skew(s: SoloState, d: number): void {
  [s.bid, s.ask] = clampSolo(s.bid + d, s.ask + d, s.anchor);
}

export function soloStep(s: SoloState, rng: Rng, opts: StepOpts = {}): void {
  if (s.done) return;
  const printProb = opts.printProb ?? TUNE.PRINT_PROB;
  const t = ++s.t;

  if (t === s.newsTick - 1) {
    s.tape.push({ t, text: "HEADLINE CROSSES - BRACE", kind: "sharp" });
  }

  let v = s.V + randn(rng) * V_SIGMA;
  if (t === s.newsTick) v += s.newsSize;
  s.V = reflect(round2(v));

  if (rng() < printProb) {
    const pr = round2(reflect(s.V + randn(rng) * PRINT_SIGMA));
    s.lastRef = pr;
    s.anchor = (1 - TUNE.ANCHOR_W) * s.anchor + TUNE.ANCHOR_W * pr; // crowd anchors to prints only
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
  if (f && Math.abs(f.price - s.V) > TUNE.BUST) {
    // clearly erroneous execution: the print is voided, nobody books anything
    s.tape.push({ t, text: `Trade busted @ ${f.price.toFixed(2)} - clearly erroneous.`, kind: "sys" });
  } else if (f) {
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
  } else {
    // Deliberately does not reveal whether anyone arrived, or of what type:
    // no-arrival, informed-pass and noise-pass look identical. That ambiguity
    // is the depth of the game.
    s.tape.push({ t, text: "A trader looked and walked.", kind: "sys" });
  }

  const bb = r2(s.bot.est - MIN_SPREAD * 0.75), ba = r2(s.bot.est + MIN_SPREAD * 0.75);
  const bf = tryFill(bb, ba);
  if (bf) {
    if (bf.side === "buy") { s.bot.cash += bf.price; s.bot.inv -= 1; s.bot.est += 3; }
    else { s.bot.cash -= bf.price; s.bot.inv += 1; s.bot.est -= 3; }
  }

  s.vPath.push(s.V);
  s.invPath.push(s.inv);
  s.quoteLog.push({ t, bid: s.bid, ask: s.ask, anchor: s.anchor });
  s.tape = s.tape.slice(-60);
  s.done = t >= SOLO_T;
}

export const soloTruePnl = (s: SoloState) => s.cash + s.inv * s.V;
export const soloBotPnl = (s: SoloState) => s.bot.cash + s.bot.inv * s.V;

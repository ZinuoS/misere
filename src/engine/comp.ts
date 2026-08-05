import {
  COMP_PRINT_PROB as PRINT_PROB, COMP_PRINT_SIGMA as PRINT_SIGMA, COMP_START as START,
  COMP_T, INV_CAP, MIN_SPREAD, NOISE_SIGMA, P_INFORMED,
  r2, type Fill, type QuoteRec, type Rng, type Side, type StepOpts, type TapeEntry,
} from "./types";
import { randn } from "./rng";
import { clampMkt, evolveV } from "./solo";
import { erisInit, erisQuotes, type ErisState } from "./eris";

export interface Desk {
  name: string;
  bid: number;
  ask: number;
  cash: number;
  inv: number;
  fills: Fill[];
  invPath: number[];
  quoteLog: QuoteRec[];
}

export interface CompState {
  t: number;
  V: number;
  vPath: number[];
  lastRef: number;
  anchor: number;
  tape: TapeEntry[];
  desks: [Desk, Desk];
  eris: ErisState | null; // non-null => desk 1 is ERIS
  done: boolean;
}

const mkDesk = (name: string): Desk => ({
  name, bid: START - MIN_SPREAD / 2, ask: START + MIN_SPREAD / 2, cash: 0, inv: 0, fills: [], invPath: [0], quoteLog: [],
});

export const compInit = (names: [string, string], vsBot: boolean): CompState => ({
  t: 0, V: START, vPath: [START], lastRef: START, anchor: START,
  tape: [{ t: 0, text: "Two desks, one tape. Worst P&L wins.", kind: "sys" }],
  desks: [mkDesk(names[0]), mkDesk(names[1])],
  eris: vsBot ? erisInit() : null,
  done: false,
});

export function adjustDesk(s: CompState, i: number, which: "bid" | "ask", d: number): void {
  const pl = s.desks[i];
  let bid = pl.bid, ask = pl.ask;
  if (which === "bid") bid = r2(bid + d); else ask = r2(ask + d);
  if (ask - bid < MIN_SPREAD - 1e-9) return;
  [pl.bid, pl.ask] = clampMkt(bid, ask, s.anchor);
}

export function skewDesk(s: CompState, i: number, d: number): void {
  const pl = s.desks[i];
  [pl.bid, pl.ask] = clampMkt(pl.bid + d, pl.ask + d, s.anchor);
}

const canSell = (d: Desk) => d.inv > -INV_CAP; // customer buys at our ask
const canBuy = (d: Desk) => d.inv < INV_CAP; // customer sells at our bid

// NBBO routing: strictly better price wins; exact ties split by rng.
export function routeBuy(desks: readonly Desk[], rng: Rng): number | null {
  const el = desks.map((d, i) => ({ i, p: d.ask })).filter(({ i }) => canSell(desks[i]));
  if (!el.length) return null;
  const m = Math.min(...el.map((e) => e.p));
  const tied = el.filter((e) => e.p === m);
  return tied[Math.floor(rng() * tied.length)].i;
}

export function routeSell(desks: readonly Desk[], rng: Rng): number | null {
  const el = desks.map((d, i) => ({ i, p: d.bid })).filter(({ i }) => canBuy(desks[i]));
  if (!el.length) return null;
  const m = Math.max(...el.map((e) => e.p));
  const tied = el.filter((e) => e.p === m);
  return tied[Math.floor(rng() * tied.length)].i;
}

export function compStep(s: CompState, rng: Rng, opts: StepOpts = {}): void {
  if (s.done) return;
  const printProb = opts.printProb ?? PRINT_PROB;
  const t = ++s.t;
  s.V = evolveV(s.V, rng);

  if (rng() < printProb) {
    const pr = Math.round((s.V + randn(rng) * PRINT_SIGMA) * 100) / 100;
    s.lastRef = pr;
    s.anchor = 0.6 * s.anchor + 0.4 * pr;
    s.tape.push({ t, text: `Print elsewhere @ ${pr.toFixed(2)}`, kind: "print" });
    if (s.eris) s.eris.est = 0.7 * s.eris.est + 0.3 * pr;
  }

  if (s.eris) {
    [s.desks[1].bid, s.desks[1].ask] = erisQuotes(s.eris, s.desks[1].inv, s.anchor, rng);
  }

  const informed = rng() < P_INFORMED;
  const noiseSide: Side = rng() < 0.5 ? "buy" : "sell";
  const reservation = s.anchor + randn(rng) * NOISE_SIGMA;

  let traded = false;
  const doTrade = (side: Side, i: number, price: number, sharp: boolean) => {
    const pl = s.desks[i];
    let edge: number;
    if (side === "buy") { pl.cash += price; pl.inv -= 1; edge = price - s.V; }
    else { pl.cash -= price; pl.inv += 1; edge = s.V - price; }
    pl.fills.push({ t, price, side, sharp, edge });
    s.lastRef = price;
    s.tape.push({
      t,
      text: `${sharp ? "Sharp" : "Noise"} ${side === "buy" ? "lifts" : "hits"} ${pl.name} @ ${price.toFixed(2)}`,
      kind: sharp ? "sharp" : "noise",
    });
    if (s.eris && i === 1) s.eris.est += (side === "buy" ? 1 : -1) * MIN_SPREAD * 0.3;
    traded = true;
  };

  if (informed) {
    const a = routeBuy(s.desks, rng), b = routeSell(s.desks, rng);
    if (a !== null && s.V > s.desks[a].ask) doTrade("buy", a, s.desks[a].ask, true);
    else if (b !== null && s.V < s.desks[b].bid) doTrade("sell", b, s.desks[b].bid, true);
  } else if (noiseSide === "buy") {
    const a = routeBuy(s.desks, rng);
    if (a !== null && s.desks[a].ask <= reservation) doTrade("buy", a, s.desks[a].ask, false);
  } else {
    const b = routeSell(s.desks, rng);
    if (b !== null && s.desks[b].bid >= reservation) doTrade("sell", b, s.desks[b].bid, false);
  }
  if (!traded) s.tape.push({ t, text: "Trader walks - nobody's price was interesting.", kind: "sys" });

  s.vPath.push(s.V);
  for (const d of s.desks) {
    d.invPath.push(d.inv);
    d.quoteLog.push({ t, bid: d.bid, ask: d.ask, anchor: s.anchor });
  }
  s.tape = s.tape.slice(-60);
  s.done = t >= COMP_T;
}

export const deskPnl = (d: Desk, V: number) => d.cash + d.inv * V;

import type { Decomposition } from "../engine/decompose";

export interface Verdict {
  headline: string;
  sub: string;
  img: string;
  w: number;
  h: number;
  stamp?: string;
}

const DIMS: Record<string, [number, number]> = {
  "/img/breadline.jpg": [644, 800],
  "/img/bank-run.jpg": [800, 624],
  "/img/crowd-nyse.jpg": [560, 800],
  "/img/curb-market.jpg": [800, 550],
  "/img/brokers-curb.jpg": [800, 624],
};

// Misère ladder. Bands re-calibrated over 1,000 seeded dummy games after the market
// moved to the 1000 level (see BUILDLOG);
// `lo` is the inclusive floor on score = money destroyed.
const MISERE: { lo: number; headline: string; sub: string; img: string }[] = [
  {
    lo: 2500,
    headline: "FINAL BOSS OF ADVERSE SELECTION",
    sub: "You found fair value, looked it in the eye, and quoted its opposite. The sharps light candles for you.",
    img: "/img/breadline.jpg",
  },
  {
    lo: 1200,
    headline: "SUPERFUND SITE",
    sub: "Your order flow requires federal environmental remediation.",
    img: "/img/breadline.jpg",
  },
  {
    lo: 750,
    headline: "CERTIFIED TOXIC",
    sub: "Flow desks would pay for the privilege of trading against you.",
    img: "/img/bank-run.jpg",
  },
  {
    lo: 400,
    headline: "GUH.",
    sub: "That sound was your P&L. Somewhere, a risk officer felt a disturbance.",
    img: "/img/bank-run.jpg",
  },
  {
    lo: 150,
    headline: "MONEY BURNER",
    sub: "Not a leak. A policy. The desk now doubles as a space heater.",
    img: "/img/crowd-nyse.jpg",
  },
  {
    lo: 20,
    headline: "PETTY CASH ARSONIST",
    sub: "You lost lunch money. The sharps barely noticed the donation.",
    img: "/img/crowd-nyse.jpg",
  },
  {
    lo: -20,
    headline: "THE EFFICIENT MARKET HYPOTHESIS (DEROGATORY)",
    sub: "Perfectly colourless. No alpha, no anti-alpha, no pulse. The market forgot you were here.",
    img: "/img/curb-market.jpg",
  },
  {
    lo: -100,
    headline: "SPREAD GOBLIN",
    sub: "You farmed the noise flow like a common market maker. Have you no shame.",
    img: "/img/curb-market.jpg",
  },
  {
    lo: -300,
    headline: "ACCIDENTAL RAINMAKER",
    sub: "You accidentally ran a profitable desk. Delete your terminal.",
    img: "/img/brokers-curb.jpg",
  },
  {
    lo: -Infinity,
    headline: "GENERATIONAL WEALTH (WRONG GAME)",
    sub: "You crushed it. Nobody asked. HR is drafting your promotion and the game is drafting your ban.",
    img: "/img/brokers-curb.jpg",
  },
];

const NORMAL: { lo: number; headline: string; sub: string; img: string }[] = [
  { lo: 400, headline: "THE DESK HEAD NODS ONCE", sub: "Highest honor available. Do not ask for more.", img: "/img/brokers-curb.jpg" },
  { lo: 150, headline: "SPREAD FARMER", sub: "Honest work. The noise thanks you for your service.", img: "/img/curb-market.jpg" },
  { lo: 20, headline: "PAPER CUT PROFITS", sub: "Technically green. Emotionally beige.", img: "/img/curb-market.jpg" },
  { lo: -150, headline: "TUITION PAID", sub: "The market taught. You paid. Standard rates.", img: "/img/crowd-nyse.jpg" },
  { lo: -Infinity, headline: "EXIT LIQUIDITY", sub: "The sharps saw you coming from three ticks away. You were the product.", img: "/img/bank-run.jpg" },
];

const GHOST = {
  headline: "GHOST DESK",
  sub: "You quoted so wide the market forgot you existed. Nothing burned. Nothing learned.",
  img: "/img/curb-market.jpg",
};

// At most one stamp, decomposition-driven, only when the desk actually lost money.
export function stampFor(d: Decomposition, score: number): string | undefined {
  if (score <= 0) return undefined;
  const lossFrom = (x: number) => (x < 0 ? -x : 0); // losses are negative edges
  const total = lossFrom(d.sharpEdge) + lossFrom(d.noiseEdge) + lossFrom(d.invPnl);
  if (total <= 0) return undefined;
  if (lossFrom(d.invPnl) / total > 0.6) return "LUCK, NOT CRAFT — INVENTORY DID THIS";
  if (lossFrom(d.sharpEdge) / total > 0.7 && d.nSharp >= 5) return "PRECISION INSTRUMENT";
  return undefined;
}

// score is objective-adjusted: misere => -pnl, normal => pnl
export function verdict(
  mode: "misere" | "normal",
  score: number,
  d?: Decomposition,
): Verdict {
  const ghost = mode === "misere" && d?.nFills === 0;
  const t = ghost ? GHOST : (mode === "misere" ? MISERE : NORMAL).find((x) => score >= x.lo)!;
  const [w, h] = DIMS[t.img];
  return {
    headline: t.headline,
    sub: t.sub,
    img: t.img,
    w,
    h,
    stamp: ghost || mode !== "misere" || !d ? undefined : stampFor(d, score),
  };
}

export const LOADING_LINES = [
  "warming up the money incinerator",
  "locating the sharps",
  "calling risk to apologize in advance",
  "sweeping yesterday's losses under the tape",
  "briefing the noise traders on your reputation",
];

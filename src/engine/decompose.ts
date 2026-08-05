import type { Fill, QuoteRec } from "./types";

export interface Decomposition {
  sharpEdge: number;
  noiseEdge: number;
  invPnl: number;
  nFills: number;
  nSharp: number;
  avgSpread: number;
  avgSkew: number;
}

// Identity: truePnl === sharpEdge + noiseEdge + invPnl (to 1e-6). Sacred.
export function decompose(
  fills: Fill[],
  vPath: number[],
  invPath: number[],
  quoteLog: QuoteRec[],
): Decomposition {
  const sharpEdge = fills.filter((f) => f.sharp).reduce((a, f) => a + f.edge, 0);
  const noiseEdge = fills.filter((f) => !f.sharp).reduce((a, f) => a + f.edge, 0);
  let invPnl = 0;
  for (let i = 0; i < vPath.length - 1; i++) invPnl += invPath[i] * (vPath[i + 1] - vPath[i]);
  const n = quoteLog.length || 1;
  const avgSpread = quoteLog.reduce((a, q) => a + (q.ask - q.bid), 0) / n;
  const avgSkew = quoteLog.reduce((a, q) => a + ((q.bid + q.ask) / 2 - q.anchor), 0) / n;
  return {
    sharpEdge, noiseEdge, invPnl,
    nFills: fills.length,
    nSharp: fills.filter((f) => f.sharp).length,
    avgSpread, avgSkew,
  };
}

export const residual = (truePnl: number, d: Decomposition) =>
  Math.abs(truePnl - (d.sharpEdge + d.noiseEdge + d.invPnl));

import type { ReactNode } from "react";
import { MIN_SPREAD, type TapeEntry } from "../engine/types";

export const money = (x: number) =>
  (x >= 0 ? "+$" : "−$") + Math.abs(x).toFixed(2);

export const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex flex-col items-start">
    <span className="text-xs uppercase tracking-widest text-muted">{label}</span>
    <span className="font-mono text-base" style={{ color: color || "var(--bone)" }}>{value}</span>
  </div>
);

export const QBtn = ({ onClick, children, tone }: { onClick: () => void; children: ReactNode; tone: string }) => (
  <button
    onClick={onClick}
    className="h-11 w-11 rounded-md border border-hair bg-panel2 font-mono text-lg transition-transform active:scale-95"
    style={{ color: tone }}
  >
    {children}
  </button>
);

export const BigBtn = ({ onClick, children, subtle, testid }: {
  onClick: () => void; children: ReactNode; subtle?: boolean; testid?: string;
}) => (
  <button
    onClick={onClick}
    data-testid={testid}
    className={`w-full rounded-md py-3.5 font-mono text-sm uppercase tracking-widest transition-transform active:scale-[0.99] ${
      subtle ? "border border-hair bg-panel2 text-bone" : "bg-gold text-ink"
    }`}
  >
    {children}
  </button>
);

export const Panel = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-hair bg-panel ${className}`}>{children}</div>
);

export function QuotePanel({ title, bid, ask, ref_, onAdj, onSkew, readOnly, accent }: {
  title: string; bid: number; ask: number; ref_: number;
  onAdj?: (which: "bid" | "ask", d: number) => void;
  onSkew?: (d: number) => void;
  readOnly?: boolean; accent: string;
}) {
  return (
    <div className="rounded-lg border bg-panel p-4" style={{ borderColor: readOnly ? "var(--hair)" : accent }}>
      <div className="mb-2 flex justify-between text-xs uppercase tracking-widest text-muted">
        <span style={{ color: accent }}>{title}</span>
        <span>ref <span className="font-mono text-bone">{ref_.toFixed(2)}</span></span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-2xl text-bid">{bid.toFixed(2)}</span>
          {!readOnly && (
            <div className="flex gap-2">
              <QBtn tone="var(--bid)" onClick={() => onAdj!("bid", -0.5)}>&minus;</QBtn>
              <QBtn tone="var(--bid)" onClick={() => onAdj!("bid", 0.5)}>+</QBtn>
            </div>
          )}
          <span className="text-xs uppercase tracking-widest text-muted">bid</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-widest text-muted">spread</span>
          <span className={`font-mono ${ask - bid <= MIN_SPREAD + 1e-9 ? "text-gold" : "text-bone"}`}>
            {(ask - bid).toFixed(2)}
          </span>
          {!readOnly && (
            <>
              <div className="mt-2 flex gap-2">
                <QBtn tone="var(--bone)" onClick={() => onSkew!(-0.5)}>&laquo;</QBtn>
                <QBtn tone="var(--bone)" onClick={() => onSkew!(0.5)}>&raquo;</QBtn>
              </div>
              <span className="mt-1 text-xs text-muted">skew</span>
            </>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-2xl text-ask">{ask.toFixed(2)}</span>
          {!readOnly && (
            <div className="flex gap-2">
              <QBtn tone="var(--ask)" onClick={() => onAdj!("ask", -0.5)}>&minus;</QBtn>
              <QBtn tone="var(--ask)" onClick={() => onAdj!("ask", 0.5)}>+</QBtn>
            </div>
          )}
          <span className="text-xs uppercase tracking-widest text-muted">offer</span>
        </div>
      </div>
    </div>
  );
}

const tapeColor = { sharp: "var(--red)", noise: "var(--gold)", print: "var(--bid)", sys: "var(--muted)" };

export const Tape = ({ entries }: { entries: TapeEntry[] }) => (
  <Panel className="p-3">
    <div className="mb-2 text-xs uppercase tracking-widest text-muted">Tape</div>
    <div className="flex max-h-32 flex-col-reverse gap-1 overflow-y-auto font-mono text-xs leading-relaxed">
      {entries.slice(-14).map((e, i) => (
        <div key={i} style={{ color: tapeColor[e.kind] }}>
          <span className="text-muted">{String(e.t).padStart(2, "0")}&nbsp;</span>
          {e.text}
        </div>
      ))}
    </div>
  </Panel>
);

// signed horizontal waterfall bar
export const WBar = ({ label, value, max, goodWhenNegative }: {
  label: string; value: number; max: number; goodWhenNegative: boolean;
}) => {
  const pct = Math.min(Math.abs(value) / (max || 1), 1) * 100;
  const good = goodWhenNegative ? value < 0 : value > 0;
  const c = good ? "var(--gold)" : "var(--red)";
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono" style={{ color: c }}>{money(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c }} />
      </div>
    </div>
  );
};

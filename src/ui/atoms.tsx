import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { COARSE, MIN_SPREAD, TICK, type TapeEntry } from "../engine/types";

const GROUPED = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (x: number) => (x >= 0 ? "+$" : "−$") + GROUPED.format(Math.abs(x));
export const price = (x: number) => GROUPED.format(x);

export const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex flex-col items-start">
    <span className="text-xs uppercase tracking-widest text-muted">{label}</span>
    <span className="font-mono text-base" style={{ color: color || "var(--ink)" }}>{value}</span>
  </div>
);

/**
 * Stepper button with press-and-hold acceleration. Fair value now lives anywhere
 * in 0-1000, so a fixed TICK stepper would need dozens of taps to open wide.
 * Tap = one TICK; hold = repeats after 400ms, and steps up to COARSE after a
 * second, so any legal quote is reachable in a single interaction.
 */
export const QBtn = ({ step, dir, children, tone, testid }: {
  step: (d: number) => void; dir: 1 | -1; children: ReactNode; tone: string; testid?: string;
}) => {
  const timers = useRef<{ start?: number; repeat?: number; held: number }>({ held: 0 });

  const stop = useCallback(() => {
    clearTimeout(timers.current.start);
    clearInterval(timers.current.repeat);
    timers.current = { held: 0 };
  }, []);
  useEffect(() => stop, [stop]);

  const begin = () => {
    step(dir * TICK);
    timers.current.start = setTimeout(() => {
      timers.current.repeat = setInterval(() => {
        timers.current.held += 1;
        step(dir * (timers.current.held > 6 ? COARSE : TICK));
      }, 90) as unknown as number;
    }, 400) as unknown as number;
  };

  return (
    <button
      data-testid={testid}
      onPointerDown={(e) => { e.preventDefault(); begin(); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(e) => e.preventDefault()}
      className="h-11 w-11 touch-none rounded-md border border-hair bg-panel2 font-mono text-lg transition-transform active:scale-95"
      style={{ color: tone }}
    >
      {children}
    </button>
  );
};

/**
 * Editable price. Fair value ranges over 0-1000, so stepping to a target is
 * hopeless — you type it. Kept as a native numeric input so phones raise the
 * number pad; commits on blur or Enter, snapping and clamping in the engine.
 */
export const PriceCell = ({ value, onSet, tone, testid, readOnly }: {
  value: number; onSet?: (v: number) => void; tone: string; testid: string; readOnly?: boolean;
}) => {
  if (readOnly || !onSet) {
    return <span className="font-mono text-2xl" style={{ color: tone }}>{price(value)}</span>;
  }
  // Uncontrolled on purpose: a controlled draft races programmatic input
  // (autofill, test drivers) and can interleave old and new digits. The DOM
  // owns the text; the engine owns the number; key= remounts on engine change.
  return (
    <input
      key={value}
      data-testid={testid}
      inputMode="decimal"
      defaultValue={price(value)}
      onFocus={(e) => { e.currentTarget.value = String(value); e.currentTarget.select(); }}
      onBlur={(e) => {
        const raw = e.currentTarget.value.replace(/[^\d.]/g, "");
        const v = Number(raw);
        if (raw.trim() !== "" && Number.isFinite(v)) onSet(v);
        e.currentTarget.value = price(value); // restore display if nothing changed
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="w-28 rounded-md border border-transparent bg-transparent text-center font-mono text-2xl outline-none focus:border-hair focus:bg-panel2"
      style={{ color: tone }}
    />
  );
};

export const BigBtn = ({ onClick, children, subtle, testid }: {
  onClick: () => void; children: ReactNode; subtle?: boolean; testid?: string;
}) => (
  <button
    onClick={onClick}
    data-testid={testid}
    className={`w-full rounded-full py-3.5 font-mono text-sm uppercase tracking-widest transition-transform active:scale-[0.99] ${
      subtle ? "border border-hair bg-paper text-ink" : "bg-ink text-paper"
    }`}
  >
    {children}
  </button>
);

export const Panel = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-hair bg-panel ${className}`}>{children}</div>
);

export function QuotePanel({ title, bid, ask, ref_, onAdj, onSkew, onSet, readOnly, accent }: {
  title: string; bid: number; ask: number; ref_: number | null;
  onAdj?: (which: "bid" | "ask", d: number) => void;
  onSkew?: (d: number) => void;
  onSet?: (which: "bid" | "ask", v: number) => void;
  readOnly?: boolean; accent: string;
}) {
  return (
    <div className="rounded-lg border bg-panel p-4" style={{ borderColor: readOnly ? "var(--hair)" : accent }}>
      <div className="mb-2 flex justify-between text-xs uppercase tracking-widest text-muted">
        <span style={{ color: accent }}>{title}</span>
        <span>{ref_ === null
          ? <span className="font-mono text-ink">value in 0-1000</span>
          : <>last <span className="font-mono text-ink">{price(ref_)}</span></>}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-center gap-2">
          <PriceCell value={bid} onSet={(v) => onSet?.("bid", v)} tone="var(--bid)" testid="bid-input" readOnly={readOnly} />
          {!readOnly && (
            <div className="flex gap-2">
              <QBtn tone="var(--bid)" dir={-1} step={(d) => onAdj!("bid", d)} testid="bid-down">&minus;</QBtn>
              <QBtn tone="var(--bid)" dir={1} step={(d) => onAdj!("bid", d)} testid="bid-up">+</QBtn>
            </div>
          )}
          <span className="text-xs uppercase tracking-widest text-muted">bid</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-widest text-muted">spread</span>
          <span className={`font-mono ${ask - bid <= MIN_SPREAD + 1e-9 ? "text-gold" : "text-ink"}`}>
            {price(ask - bid)}
          </span>
          {!readOnly && (
            <>
              <div className="mt-2 flex gap-2">
                <QBtn tone="var(--ink)" dir={-1} step={(d) => onSkew!(d)} testid="skew-down">&laquo;</QBtn>
                <QBtn tone="var(--ink)" dir={1} step={(d) => onSkew!(d)} testid="skew-up">&raquo;</QBtn>
              </div>
              <span className="mt-1 text-xs text-muted">skew</span>
            </>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <PriceCell value={ask} onSet={(v) => onSet?.("ask", v)} tone="var(--ask)" testid="ask-input" readOnly={readOnly} />
          {!readOnly && (
            <div className="flex gap-2">
              <QBtn tone="var(--ask)" dir={-1} step={(d) => onAdj!("ask", d)} testid="ask-down">&minus;</QBtn>
              <QBtn tone="var(--ask)" dir={1} step={(d) => onAdj!("ask", d)} testid="ask-up">+</QBtn>
            </div>
          )}
          <span className="text-xs uppercase tracking-widest text-muted">offer</span>
        </div>
      </div>
    </div>
  );
}

const tapeColor = { sharp: "var(--red)", noise: "var(--gold)", print: "var(--bid)", sys: "var(--muted)" };

export const Tape = ({ entries }: { entries: TapeEntry[] }) => {
  // Newest first, in normal flow order. A flex-col-reverse column parks its
  // scroll at the OLDEST entry, which hid the tick you just played - fatal when
  // the tape is the only evidence about fair value.
  const shown = entries.slice(-14).reverse();
  return (
    <Panel className="p-3">
      <div data-testid="tape">
        <div className="mb-2 text-xs uppercase tracking-widest text-muted">Tape</div>
        <div className="flex max-h-32 flex-col gap-1 overflow-y-auto font-mono text-xs leading-relaxed">
          {entries.length <= 1 && (
            <div className="text-muted italic">No flow yet. Post your quotes and someone will take the other side.</div>
          )}
          {shown.map((e, i) => (
            <div key={`${e.t}-${i}`} className={i === 0 ? "flip-new" : ""} style={{ color: tapeColor[e.kind] }}>
              <span className="text-muted">{String(e.t).padStart(2, "0")}&nbsp;</span>
              {e.text}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
};

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

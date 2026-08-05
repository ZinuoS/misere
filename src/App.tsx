import { useRef, useState } from "react";
import { Home, type ModeId } from "./ui/Home";
import { SoloGame } from "./ui/SoloGame";
import { LOADING_LINES } from "./ui/verdicts";

const HEADLINES = [
  "LOCAL DESK OVERPAYS AGAIN",
  "ANALYSTS STUNNED AS SPREAD QUOTED AT FLOOR",
  "RISK DEPARTMENT DECLINES TO COMMENT",
  "MARKET MAKER SEEN BUYING HIGH, SELLING LOW, ON PURPOSE",
  "SOURCES: THE INVENTORY WAS NEVER HEDGED",
  "CROWD GATHERS TO WATCH THE SPREAD COLLAPSE",
];

// ?seed=N pins the PRNG for e2e runs; production play uses the clock
const seedParam = Number(new URLSearchParams(window.location.search).get("seed"));
const BASE_SEED = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Date.now();

export default function App() {
  const [mode, setMode] = useState<ModeId | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const lineRef = useRef(0);

  const pick = (m: ModeId) => {
    setLoading(LOADING_LINES[lineRef.current++ % LOADING_LINES.length]);
    setTimeout(() => {
      setLoading(null);
      setMode(m);
    }, 700);
  };

  return (
    <div className="min-h-screen bg-ink text-bone">
      <div className="overflow-hidden border-b border-hair bg-panel py-1.5">
        <div className="marquee-track font-mono text-xs uppercase tracking-widest text-muted">
          {[...HEADLINES, ...HEADLINES].map((h, i) => (
            <span key={i} className="px-6">
              {h} <span className="text-gold">&bull;</span>
            </span>
          ))}
        </div>
      </div>
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <header className="mb-4 flex items-end justify-between border-b-4 border-bone pb-3">
          <div>
            <h1 className="font-display text-4xl uppercase leading-none tracking-wide">Mis&egrave;re Desk</h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-widest text-muted">
              the market makers who must lose
            </p>
          </div>
          {mode && (
            <button onClick={() => setMode(null)} className="min-h-11 text-xs uppercase tracking-widest text-muted">
              &larr; modes
            </button>
          )}
        </header>

        {loading && (
          <p className="py-16 text-center font-mono text-sm text-muted">{loading}&hellip;</p>
        )}
        {!loading && !mode && <Home onPick={pick} />}
        {!loading && (mode === "misere" || mode === "normal") && (
          <SoloGame mode={mode} seed={BASE_SEED} onExit={() => setMode(null)} />
        )}

        <footer className="pb-4 pt-8 text-center text-xs text-muted">
          Glosten&ndash;Milgrom, sign flipped. The filter is the same; only the control changes.
        </footer>
      </div>
    </div>
  );
}

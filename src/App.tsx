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
  const [onboard, setOnboard] = useState(() => !localStorage.getItem("md:onboard"));
  const lineRef = useRef(0);

  const dismissOnboard = () => {
    localStorage.setItem("md:onboard", "1");
    setOnboard(false);
  };

  const pick = (m: ModeId) => {
    setLoading(LOADING_LINES[lineRef.current++ % LOADING_LINES.length]);
    setTimeout(() => {
      setLoading(null);
      setMode(m);
    }, 700);
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="overflow-hidden border-b border-hair bg-panel2 py-1.5">
        <div className="marquee-track font-mono text-xs uppercase tracking-widest text-muted">
          {[...HEADLINES, ...HEADLINES].map((h, i) => (
            <span key={i} className="px-6">
              {h} <span className="text-gold">&bull;</span>
            </span>
          ))}
        </div>
      </div>
      <div className="mx-auto w-full max-w-md px-4 py-4">
        <header className={`flex items-end justify-between border-b-2 border-ink ${mode ? "mb-3 pb-2" : "mb-4 pb-3"}`}>
          <div>
            <h1 className={`font-masthead leading-none ${mode ? "text-3xl" : "text-5xl"}`}>Mis&egrave;re Desk</h1>
            {!mode && (
              <p className="mt-1 font-mono text-xs uppercase tracking-widest text-muted">
                the market makers who must lose
              </p>
            )}
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

      {onboard && !mode && (
        <div data-testid="onboard" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
          <div className="w-full max-w-sm rounded-lg border border-hair bg-paper p-6 shadow-xl">
            <h2 className="font-display text-2xl font-black uppercase tracking-tight">How to lose</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed">
              <li><b>Quote.</b> Set a bid and an offer. Spread floor 1.00; stay within 4.00 of the print consensus.</li>
              <li><b>Get filled.</b> Sharps know the true price; noise traders don't. Losing to sharps is the skill.</li>
              <li><b>Lose.</b> 40 ticks. Most money destroyed wins. Profit is failure.</li>
            </ul>
            <button
              onClick={dismissOnboard}
              data-testid="onboard-dismiss"
              className="mt-5 w-full rounded-full bg-ink py-3.5 font-mono text-sm uppercase tracking-widest text-paper"
            >
              Understood. Lose money.
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

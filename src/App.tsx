import { useCallback, useEffect, useRef, useState } from "react";
import { dateSeed } from "./engine/rng";
import { getIdentity, sha256Hex, type Identity } from "./data/identity";
import { fetchMyTelemetry, submitGame, type GameReport } from "./data/supabase";
import { dailyStats, todayISO, type DailyStats } from "./data/daily";
import { Gate } from "./ui/Gate";
import { Home, type DailyResult, type ModeId } from "./ui/Home";
import { SoloGame } from "./ui/SoloGame";
import { CompGame } from "./ui/CompGame";
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

const EMPTY_STATS: DailyStats = { played: 0, streak: 0, maxStreak: 0, best: null };

const loadDailyResult = (today: string): DailyResult | null => {
  try {
    const r = JSON.parse(localStorage.getItem("md:daily") || "") as DailyResult;
    return r.date === today ? r : null;
  } catch {
    return null;
  }
};

// offline queue: failed submissions persist and flush on reconnect
const QKEY = "md:queue";
const readQueue = (): GameReport[] => {
  try { return JSON.parse(localStorage.getItem(QKEY) || "[]") as GameReport[]; } catch { return []; }
};
const writeQueue = (q: GameReport[]) => localStorage.setItem(QKEY, JSON.stringify(q));

export default function App() {
  const [identity, setIdentity] = useState<Identity | null>(getIdentity);
  const [mode, setMode] = useState<ModeId | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [onboard, setOnboard] = useState(() => !localStorage.getItem("md:onboard"));
  const [toast, setToast] = useState<GameReport | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const today = todayISO();
  const [dailyResult, setDailyResult] = useState<DailyResult | null>(() => loadDailyResult(today));
  const [stats, setStats] = useState<DailyStats>(EMPTY_STATS);
  const lineRef = useRef(0);

  useEffect(() => {
    if (!identity) return;
    (async () => {
      try {
        setStats(dailyStats(await fetchMyTelemetry(identity, await sha256Hex(identity.secret)), today));
      } catch { /* stats stay empty; not worth a toast */ }
    })();
  }, [identity, refreshKey, today]);

  const report = async (r: GameReport) => {
    if (!identity) return;
    if (r.dailyDate) {
      const result: DailyResult = {
        date: r.dailyDate,
        score: -r.pnl,
        sharp: r.sharpEdge,
        noise: r.noiseEdge,
        inv: r.invPnl,
      };
      localStorage.setItem("md:daily", JSON.stringify(result));
      setDailyResult(result);
    }
    try {
      await submitGame(identity, await sha256Hex(identity.secret), r);
      setToast(null);
      setRefreshKey((k) => k + 1);
    } catch {
      writeQueue([...readQueue(), r]); // telemetry must never silently drop
      setToast(r);
    }
  };

  // flush queued submissions on load, on reconnect, and from the retry toast
  const flush = useCallback(async () => {
    if (!identity) return;
    const q = readQueue();
    if (!q.length) return;
    const failed: GameReport[] = [];
    const hash = await sha256Hex(identity.secret);
    for (const r of q) {
      try { await submitGame(identity, hash, r); } catch { failed.push(r); }
    }
    writeQueue(failed);
    if (!failed.length) {
      setToast(null);
      setRefreshKey((k) => k + 1);
    }
  }, [identity]);

  useEffect(() => {
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

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

        {!identity && <Gate onClaimed={setIdentity} />}
        {identity && (
          <>
            {loading && <p className="py-16 text-center font-mono text-sm text-muted">{loading}&hellip;</p>}
            {!loading && !mode && (
              <Home
                onPick={pick}
                identity={identity}
                today={today}
                dailyResult={dailyResult}
                stats={stats}
                refreshKey={refreshKey}
              />
            )}
            {!loading && (mode === "misere" || mode === "normal") && (
              <SoloGame mode={mode} seed={BASE_SEED} onExit={() => setMode(null)} report={report} />
            )}
            {!loading && mode === "daily" && (
              <SoloGame
                mode="misere"
                seed={dateSeed(today)}
                daily={today}
                dailyShare={{ result: dailyResult, stats }}
                onExit={() => setMode(null)}
                report={report}
              />
            )}
            {!loading && (mode === "eris" || mode === "duel") && (
              <CompGame vsBot={mode === "eris"} seed={BASE_SEED} onExit={() => setMode(null)} report={report} />
            )}
          </>
        )}

        <footer className="pb-4 pt-8 text-center text-xs text-muted">
          Glosten&ndash;Milgrom, sign flipped. The filter is the same; only the control changes.
        </footer>
      </div>

      {toast && (
        <div data-testid="retry-toast" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between rounded-lg border border-red bg-paper p-3 shadow-xl">
          <span className="font-mono text-xs uppercase tracking-widest text-red">Telemetry lost in the mail.</span>
          <button onClick={flush} className="rounded-full bg-ink px-4 py-2 font-mono text-xs uppercase tracking-widest text-paper">
            Retry
          </button>
        </div>
      )}

      {onboard && identity && !mode && (
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

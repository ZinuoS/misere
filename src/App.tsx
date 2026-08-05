import { useCallback, useEffect, useRef, useState } from "react";
import { dateSeed } from "./engine/rng";
import { getIdentity, sha256Hex, type Identity } from "./data/identity";
import { fetchMyTelemetry, submitGame, type GameReport } from "./data/supabase";
import { clearQueue, enqueue, queued } from "./data/queue";
import { dailyStats, todayISO, type DailyStats } from "./data/daily";
import { Gate } from "./ui/Gate";
import { Home, type DailyResult, type ModeId } from "./ui/Home";
import { SoloGame } from "./ui/SoloGame";
import { CompGame } from "./ui/CompGame";
import { HowToPlay, StatsModal } from "./ui/Modals";
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

const EMPTY_STATS: DailyStats = { played: 0, streak: 0, maxStreak: 0, best: null, scores: [] };

const loadDailyResult = (today: string): DailyResult | null => {
  try {
    const r = JSON.parse(localStorage.getItem("md:daily") || "") as DailyResult;
    return r.date === today ? r : null;
  } catch {
    return null;
  }
};

export default function App() {
  const [identity, setIdentity] = useState<Identity | null>(getIdentity);
  const [mode, setMode] = useState<ModeId | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [onboard, setOnboard] = useState(() => !localStorage.getItem("md:onboard"));
  const [showStats, setShowStats] = useState(false);
  const [toast, setToast] = useState<"queued" | null>(null);
  const [a2hs, setA2hs] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const today = todayISO();
  const [dailyResult, setDailyResult] = useState<DailyResult | null>(() => loadDailyResult(today));
  const [stats, setStats] = useState<DailyStats>(EMPTY_STATS);
  const lineRef = useRef(0);

  // "add to home screen" hint, second visit onward, standalone excluded
  useEffect(() => {
    const visits = Number(localStorage.getItem("md:visits") || "0") + 1;
    localStorage.setItem("md:visits", String(visits));
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (visits >= 2 && !standalone && !localStorage.getItem("md:a2hs")) setA2hs(true);
  }, []);

  useEffect(() => {
    if (!identity) return;
    (async () => {
      try {
        setStats(dailyStats(await fetchMyTelemetry(identity, await sha256Hex(identity.secret)), today));
      } catch { /* stats stay empty; not worth a toast */ }
    })();
  }, [identity, refreshKey, today]);

  // flush queued submissions on load, on reconnect, and from the toast
  const flush = useCallback(async () => {
    if (!identity) return;
    const q = await queued().catch(() => [] as GameReport[]);
    if (!q.length) return;
    const hash = await sha256Hex(identity.secret);
    const failed: GameReport[] = [];
    for (const r of q) {
      try { await submitGame(identity, hash, r); } catch { failed.push(r); }
    }
    await clearQueue();
    for (const r of failed) await enqueue(r);
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

  const report = async (r: GameReport) => {
    if (!identity) return;
    if (r.dailyDate) {
      const result: DailyResult = { date: r.dailyDate, score: -r.pnl };
      localStorage.setItem("md:daily", JSON.stringify(result));
      setDailyResult(result);
    }
    try {
      await submitGame(identity, await sha256Hex(identity.secret), r);
      setRefreshKey((k) => k + 1);
    } catch {
      await enqueue(r); // telemetry must never silently drop
      setToast("queued");
    }
  };

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
          <div className="flex items-center gap-1">
            {mode && (
              <button onClick={() => setMode(null)} className="min-h-11 px-2 text-xs uppercase tracking-widest text-muted">
                &larr; modes
              </button>
            )}
            {identity && (
              <button
                onClick={() => setOnboard(true)}
                data-testid="help"
                aria-label="How to play"
                className="h-11 w-11 rounded-full border border-hair font-mono text-sm"
              >
                ?
              </button>
            )}
          </div>
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
                onStats={() => setShowStats(true)}
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
                onStats={() => setShowStats(true)}
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
          <span className="font-mono text-xs uppercase tracking-widest text-red">
            Queued. It sends when you reconnect.
          </span>
          <button onClick={flush} className="rounded-full bg-ink px-4 py-2 font-mono text-xs uppercase tracking-widest text-paper">
            Retry
          </button>
        </div>
      )}

      {a2hs && (
        <div data-testid="a2hs" className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between rounded-lg border border-hair bg-paper p-3 shadow-lg">
          <span className="text-xs text-muted">Add to your home screen — it plays better without the browser bar.</span>
          <button
            onClick={() => { localStorage.setItem("md:a2hs", "1"); setA2hs(false); }}
            className="ml-3 shrink-0 rounded-full border border-hair px-3 py-2 font-mono text-xs uppercase tracking-widest"
          >
            Got it
          </button>
        </div>
      )}

      {onboard && identity && !mode && <HowToPlay onClose={dismissOnboard} />}
      {showStats && <StatsModal stats={stats} onClose={() => setShowStats(false)} />}
    </div>
  );
}

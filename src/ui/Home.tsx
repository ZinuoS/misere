import { useEffect, useState } from "react";
import { BAND, COMP_T, INV_CAP, MIN_SPREAD, SOLO_T } from "../engine/types";
import { countdown, dailyNumber, msToNextDaily, type DailyStats } from "../data/daily";
import { session, SESSION_HOURS } from "../data/market";
import type { Identity } from "../data/identity";
import { money, Panel } from "./atoms";
import { Leaderboard, ResearchPanel } from "./Panels";

const MODES = [
  {
    id: "misere", testid: "mode-misere", title: "Solo — Misère",
    blurb: `Practice desk, always open. Lose as much as possible in ${SOLO_T} ticks. Fresh tape every run.`,
  },
  {
    id: "normal", testid: "mode-normal", title: "Solo — Normal",
    blurb: "Same engine, opposite objective: make money. Shameful, but tracked.",
  },
  {
    id: "eris", testid: "mode-eris", title: "vs ERIS",
    blurb: `She overbids one side of her fair-value estimate and fights you for the toxic flow. ${COMP_T} ticks.`,
  },
  {
    id: "duel", testid: "mode-duel", title: "Duel",
    blurb: `Pass-and-play. Best price wins the flow, worst P&L wins the game. ${COMP_T} ticks.`,
  },
] as const;

export type ModeId = (typeof MODES)[number]["id"] | "daily";

export interface DailyResult {
  date: string;
  score: number;
}

export function Home({ onPick, identity, today, dailyResult, stats, refreshKey, onStats }: {
  onPick: (m: ModeId) => void;
  identity: Identity;
  today: string;
  dailyResult: DailyResult | null;
  stats: DailyStats;
  refreshKey: number;
  onStats: () => void;
}) {
  const [left, setLeft] = useState(msToNextDaily());
  const [sess, setSess] = useState(session());
  useEffect(() => {
    const id = setInterval(() => {
      setLeft(msToNextDaily());
      setSess(session());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative flex flex-col gap-3">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center opacity-[0.045] grayscale"
        style={{ backgroundImage: "url(/img/crowd-nyse.jpg)" }}
      />

      <div data-testid="daily-card" className="rounded-lg border-2 border-ink bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-xl font-black uppercase tracking-tight">The Exchange</span>
          <span className="shrink-0 whitespace-nowrap font-mono text-xs uppercase tracking-widest text-muted">
            Session {dailyNumber(today)}
          </span>
        </div>
        <div data-testid="session-status" className="mt-2 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: sess.phase === "open" ? "var(--p2)" : "var(--muted)" }}
          />
          <span className="font-mono text-xs uppercase tracking-widest" style={{ color: sess.phase === "open" ? "var(--p2)" : "var(--muted)" }}>
            {sess.label}
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            &middot; {sess.next} {sess.clock} &middot; {today}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The floor trades {SESSION_HOURS}. One tape for every desk, one scored attempt.
          Mis&egrave;re rules: most destroyed takes the session.
        </p>
        {dailyResult ? (
          <div className="mt-3">
            <div data-testid="daily-done" className="font-mono text-sm">
              {dailyResult.score > 0
                ? <>destroyed <span className="text-gold">${dailyResult.score.toFixed(2)}</span></>
                : <>made <span className="text-red">${(-dailyResult.score).toFixed(2)}</span>, wrong game</>}
              <span className="text-muted"> &middot; streak {stats.streak} &middot; best {stats.best === null ? "—" : money(stats.best)}</span>
            </div>
            <button
              onClick={onStats}
              data-testid="open-stats"
              className="mt-3 w-full rounded-full border border-hair py-3.5 font-mono text-xs uppercase tracking-widest"
            >
              Statistics
            </button>
          </div>
        ) : sess.phase === "open" ? (
          <>
            <button
              onClick={() => onPick("daily")}
              data-testid="mode-daily"
              className="mt-3 w-full rounded-full bg-ink py-3.5 font-mono text-sm uppercase tracking-widest text-paper"
            >
              Take the floor
            </button>
            {stats.played === 0 && (
              <p className="mt-2 text-xs italic text-muted">
                No session traded yet. Today's tape is on the floor.
              </p>
            )}
          </>
        ) : (
          <div data-testid="market-closed" className="mt-3">
            <div className="rounded-md border border-hair bg-panel2 p-3 text-center">
              <p className="font-mono text-xs uppercase tracking-widest text-muted">
                {sess.phase === "pre-open" ? "The bell has not rung" : "The floor is dark"}
              </p>
              <p className="mt-1 font-mono text-sm">
                {sess.next} in <span className="text-ink">{sess.clock}</span>
              </p>
            </div>
            <p className="mt-2 text-xs italic text-muted">
              Practice desks below stay open around the clock.
            </p>
          </div>
        )}
        <div data-testid="countdown" className="mt-3 text-center font-mono text-xs uppercase tracking-widest text-muted">
          tape rolls over in <span className="text-ink">{countdown(left)}</span>
        </div>
      </div>

      {MODES.map((m) => (
        <button
          key={m.id}
          data-testid={m.testid}
          onClick={() => onPick(m.id)}
          className="rounded-lg border border-hair bg-panel p-4 text-left transition-transform active:scale-[0.99]"
        >
          <div className="flex items-baseline justify-between">
            <span className="font-display text-xl font-black uppercase tracking-tight" style={{ color: m.id === "normal" ? "var(--p2)" : "var(--gold)" }}>
              {m.title}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted">{m.blurb}</p>
        </button>
      ))}

      <Leaderboard refreshKey={refreshKey} />
      <ResearchPanel identity={identity} refreshKey={refreshKey} />

      <Panel className="p-3 text-xs leading-relaxed text-muted">
        House rules: spread &ge; {MIN_SPREAD.toFixed(2)}, quotes within &plusmn;{BAND.toFixed(0)} of the print consensus,
        inventory &plusmn;{INV_CAP}, ~45% sharps. The crowd anchors to exogenous prints, not your fills —
        the tape-painting ratchet is patched. Signed in as <span className="font-mono text-ink">{identity.handle}</span>.
      </Panel>
    </div>
  );
}

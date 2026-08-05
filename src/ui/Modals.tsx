import type { DailyStats } from "../data/daily";
import { histogram } from "../data/daily";
import { money } from "./atoms";

function Shell({ testid, title, onClose, children }: {
  testid: string; title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div data-testid={testid} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-lg border border-hair bg-paper p-6 shadow-xl">
        <h2 className="font-display text-2xl font-black uppercase tracking-tight">{title}</h2>
        {children}
        <button
          onClick={onClose}
          data-testid={`${testid}-dismiss`}
          className="mt-5 w-full rounded-full bg-ink py-3.5 font-mono text-sm uppercase tracking-widest text-paper"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// The diagram: your quotes straddling a hidden fair value, a sharp lifting the wrong side.
const HowDiagram = () => (
  <svg viewBox="0 0 260 96" className="mt-3 w-full" role="img" aria-label="Your bid and offer straddle the hidden fair value; a sharp lifts the side you mispriced.">
    <line x1="16" y1="70" x2="244" y2="70" stroke="var(--hair)" strokeWidth="1" />
    <line x1="60" y1="22" x2="60" y2="78" stroke="var(--bid)" strokeWidth="6" />
    <text x="60" y="92" textAnchor="middle" fill="var(--bid)" fontSize="10" fontFamily="monospace">your bid</text>
    <line x1="196" y1="22" x2="196" y2="78" stroke="var(--ask)" strokeWidth="6" />
    <text x="196" y="92" textAnchor="middle" fill="var(--ask)" fontSize="10" fontFamily="monospace">your offer</text>
    <line x1="150" y1="14" x2="150" y2="78" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 3" />
    <text x="150" y="10" textAnchor="middle" fill="var(--ink)" fontSize="10" fontFamily="monospace">true value</text>
    <path d="M150 46 L188 46" stroke="var(--red)" strokeWidth="2" />
    <path d="M188 46 l-7 -4 v8 z" fill="var(--red)" />
    <text x="168" y="38" textAnchor="middle" fill="var(--red)" fontSize="9" fontFamily="monospace">sharp lifts</text>
  </svg>
);

export const HowToPlay = ({ onClose }: { onClose: () => void }) => (
  <Shell testid="onboard" title="How to lose" onClose={onClose}>
    <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed">
      <li><b>Quote.</b> Fair value is drawn somewhere between 0 and 1000, then barely moves. Start wide.</li>
      <li><b>Narrow in.</b> Every fill tells you which side you got wrong. Sharps only trade when your price is wrong.</li>
      <li><b>Lose.</b> 40 ticks. Most money destroyed wins - but a trade far from fair value is busted, so be wrong on purpose, not by accident.</li>
    </ul>
    <HowDiagram />
  </Shell>
);

export const StatsModal = ({ stats, onClose }: { stats: DailyStats; onClose: () => void }) => {
  const bars = histogram(stats.scores);
  const max = Math.max(1, ...bars.map((b) => b.n));
  return (
    <Shell testid="stats" title="Statistics" onClose={onClose}>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {([
          ["played", String(stats.played)],
          ["best", stats.best === null ? "—" : money(stats.best)],
          ["streak", String(stats.streak)],
          ["max", String(stats.maxStreak)],
        ] as const).map(([k, v]) => (
          <div key={k}>
            <div className="font-mono text-xl">{v}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted">{k}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 text-xs uppercase tracking-widest text-muted">Daily score distribution</div>
      {stats.played === 0 ? (
        <p className="mt-2 text-sm italic text-muted">No daily played yet. Today's tape is waiting.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-1">
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2 font-mono text-xs">
              <span className="w-20 shrink-0 text-right text-muted">{b.label}</span>
              <span
                className="inline-block h-4 rounded-sm bg-gold"
                style={{ width: `${(b.n / max) * 70}%`, minWidth: b.n ? 8 : 0 }}
              />
              <span className="text-muted">{b.n || ""}</span>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
};

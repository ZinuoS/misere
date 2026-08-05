const HEADLINES = [
  "LOCAL DESK OVERPAYS AGAIN",
  "ANALYSTS STUNNED AS SPREAD QUOTED AT FLOOR",
  "RISK DEPARTMENT DECLINES TO COMMENT",
  "MARKET MAKER SEEN BUYING HIGH, SELLING LOW, ON PURPOSE",
  "SOURCES: THE INVENTORY WAS NEVER HEDGED",
];

export default function App() {
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
        <header className="border-b-4 border-bone pb-3">
          <h1 className="font-display text-5xl uppercase leading-none tracking-wide">
            Mis&egrave;re Desk
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-muted">
            the market makers who must lose
          </p>
        </header>
        <p className="mt-6 font-mono text-sm text-muted">
          warming up the money incinerator&hellip;
        </p>
      </div>
    </div>
  );
}

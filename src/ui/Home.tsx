import { BAND, COMP_T, INV_CAP, MIN_SPREAD, SOLO_T } from "../engine/types";
import { Panel } from "./atoms";

const MODES = [
  {
    id: "misere", testid: "mode-misere", title: "Solo — Misère", live: true,
    blurb: `Lose as much as possible in ${SOLO_T} ticks. Full recap: P&L decomposition and the verdict you deserve.`,
  },
  {
    id: "normal", testid: "mode-normal", title: "Solo — Normal", live: true,
    blurb: "Same engine, opposite objective: make money. Shameful, but tracked.",
  },
  {
    id: "eris", testid: "mode-eris", title: "vs ERIS", live: false,
    blurb: `She overbids one side of her fair-value estimate and fights you for the toxic flow. ${COMP_T} ticks.`,
  },
  {
    id: "duel", testid: "mode-duel", title: "Duel", live: false,
    blurb: `Pass-and-play. Best price wins the flow, worst P&L wins the game. ${COMP_T} ticks.`,
  },
] as const;

export type ModeId = (typeof MODES)[number]["id"];

export function Home({ onPick }: { onPick: (m: ModeId) => void }) {
  return (
    <div className="relative flex flex-col gap-3">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center opacity-[0.045] grayscale"
        style={{ backgroundImage: "url(/img/crowd-nyse.jpg)" }}
      />
      {MODES.map((m) => (
        <button
          key={m.id}
          data-testid={m.testid}
          disabled={!m.live}
          onClick={() => onPick(m.id)}
          className="rounded-lg border border-hair bg-panel p-4 text-left transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          <div className="flex items-baseline justify-between">
            <span className="font-display text-xl font-black uppercase tracking-tight" style={{ color: m.id === "normal" ? "var(--p2)" : "var(--gold)" }}>
              {m.title}
            </span>
            {!m.live && <span className="font-mono text-xs uppercase tracking-widest text-muted">opens late tonight</span>}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted">{m.blurb}</p>
        </button>
      ))}
      <Panel className="p-3 text-xs leading-relaxed text-muted">
        House rules: spread &ge; {MIN_SPREAD.toFixed(2)}, quotes within &plusmn;{BAND.toFixed(0)} of the print consensus,
        inventory &plusmn;{INV_CAP}, ~45% sharps. The crowd anchors to exogenous prints, not your fills —
        the tape-painting ratchet is patched.
      </Panel>
    </div>
  );
}

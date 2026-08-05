# BUILDLOG — Misère Desk

Self-reviews per milestone. Newest at the bottom.

## M0 — Scaffold

**Built:** Vite + React 18 + TS + Tailwind v4 + Vitest + Playwright, all wired. Scripts: `test`, `dummy`, `shots`, `e2e`. Fonts loaded (Anton display, IBM Plex Mono, Archivo body). Palette tokens as CSS vars + Tailwind theme, inverted semantics preserved (gold = loss, red = profit). Shell renders the marquee ticker and tabloid masthead. Prototype copied to `reference/misere_desk_v3.jsx`.

**Dummy run:** trivially passes — prints an empty table, 0 runs 0 failures, exits 0. No engine yet by design.

**Smelled wrong:** the mobile Playwright project defaulted to WebKit (iPhone 12 device profile) with only Chromium installed — forced `browserName: "chromium"`, viewport is what matters for shots. Vite's template ships React 19; pinned react/react-dom/@types to 18 per the spec.

**Would fix with more time:** self-host the Google Fonts (one less external request, matters for the Lighthouse M6 gate). Deferred until M6 proves it necessary.

## M1 — Engine extraction

**Built:** six pure TS modules under `src/engine/` — `types` (canonical constants + shared types), `rng` (mulberry32 + Box-Muller randn, every draw flows through one injected PRNG), `solo` (faithful port of the prototype step: print EWMA anchor, informed/noise flow, inventory blocking, honest benchmark bot), `comp` (NBBO two-desk engine with per-desk fills/invPath/quoteLog so the decomposition works per desk — the prototype didn't record edge/sharp on comp fills, telemetry needs it), `eris` (extracted bot policy), `decompose` (identity + residual). Engine mutates state; React wrapping is M2's problem. `soloStep`/`compStep` take a test-only `printProb` override for the tape-painting regression.

**Deliberate deviation:** `clampMkt` now snaps the band edges inward to the 0.5 grid (`ceil2(anchor-BAND)`, `floor2(anchor+BAND)`) before clamping. The prototype rounded after clamping, which could push a boundary quote up to 0.25 outside the band — the required "never leaves the band" test fails on the prototype's version. Effective band is up to 0.5 narrower; quotes always on grid, never crossed, spread floor exact.

**Dummy run:** 6 rows (2 solo modes x 3 policies), all 40 ticks, residuals at 1e-14 (float epsilon), zero errors. Sanity: max-skew loses -45 in misère (band-top camping donates spread), floor-camper gets picked off for -45/-22 — the economics look right.

**Tests:** 11 green — identity across 500 solo + 500 comp seeded games (both desks), clampMkt 10k fuzz, inventory cap solo+comp, NBBO strict-better/cap-eligibility/tie chi-squared, tape-painting (anchor bit-identical under self-fills with zero prints), ERIS band+spread+side-flip.

**Smelled wrong:** ERIS's 10% random flip runs AFTER her cap-guard flip, so she can randomly flip back toward her cap for one tick. Prototype behaves identically; routing eligibility still hard-caps her. Left as-is, noted.

**Would fix with more time:** dummy comp rows (dummy vs ERIS, dummy vs dummy) — spec puts those in M4.

## M2 — Solo UI

**Built:** both solo modes playable end-to-end in the broadsheet direction. `src/ui/` — atoms (44px tap targets on every quote button), Home (mode cards, house rules, faint crowd texture), SoloGame (engine state in a ref, one reducer tick for re-render, dev-build runtime assertion that throws if the decomposition identity breaks), Recap (tabloid verdict with halftone archival image, decomposition waterfall, Recharts fair-value chart, desk-head stub per the cut line), verdicts.ts (4 misère + 4 normal tiers, loading-line bank). Marquee ticker on every screen. `?seed=N` pins the PRNG so Playwright drives deterministic outcomes; unseeded play uses the clock. Verdict colors follow the objective: hitting your objective is gold, missing it is red (prototype behavior).

**Images:** five archival photos, all confirmed public domain via the Commons API (breadline, bank run, NYSE crowd, curb-market brokers x2), resized to 1200px, halftone/duotone via CSS only. Two candidate 1929 crowd photos were REJECTED for embedded AP copyright EXIF — logged in CREDITS.md.

**Dummy run:** unchanged from M1 (engine untouched) — 6 rows, 0 failures.

**Caught by screenshots:** (1) profit-in-misère verdict was captioned "money destroyed +$57.64" — label now flips when the objective is missed; (2) Recharts animation made charts render empty in screenshots — animation disabled, which also kills jank on phones.

**Smelled wrong:** nothing structural. The seed 1 chart shows fills stopping mid-game — that's the inventory cap binding, not a bug (drift then does the damage: -61.90 of -102).

**Would fix with more time:** game-aware marquee headlines and the candle rain (cut-line item 4, needs personal-best tracking which lands with the data layer).

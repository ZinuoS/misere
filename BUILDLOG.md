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

## M2R — Ship-prompt amendment: NYT restyle + doctrine

**Directive change:** white background, NYT color scheme, seven-rule NYT games doctrine ranked above styling; daily + share card promoted to cut-line priority 2; PWA now a hard M6 gate; `daily_date` unique index folds into the M3 migration.

**Restyle:** paper white, ink #121212, hairlines, Wordle-derived accents kept at text contrast (gold #937300, red #b3231f, green #4a7d45, NYT blue bid). Blackletter masthead (UnifrakturMaguntia — the NYT masthead register), Libre Franklin 400/600/900 everywhere else (Franklin Gothic is NYT's own UI lineage), IBM Plex Mono tabular numbers stay. Black pill CTAs (Wordle-style). Halftone treatment retuned for white cards. Inverted semantics kept: objective hit = gold, missed = red.

**Doctrine items landed now:** 15-second onboarding modal ("How to lose", 3 bullets, first visit only, localStorage flag); tile-flip animation on the newest tape entry (reduced-motion respected); instructive tape empty state; compact in-game header so play is one screen at 390px. Daily/stats/streaks/share card need the data layer — they land after M3 with the schema.

**Engine:** `dateSeed()` (FNV-1a over ISO date) added; determinism test proves two engine instances from the same date-seed produce bit-identical tapes (vPath, fills, quotes, tape JSON-equal). 13 tests green.

**README:** pre-registration written before first player data — primary hypothesis is now conditional-on-tape (per-daily paired Wilcoxon on |skew|, tape as fixed effect), aggregate version demoted to secondary.

**Smelled wrong:** UnifrakturMaguntia has no true italics/weights and will render fallback-serif if Google Fonts is unreachable — acceptable, masthead-only. Onboarding copy is 3 sentences; timed myself reading it, ~9 seconds.

**Would fix with more time:** self-hosting fonts now matters more (3 families); still deferring to M6 Lighthouse evidence.

## M3 — Handle gate + data layer plumbing

**Built:** compulsory gate (archival hero, mono input, black pill claim). `data/identity.ts`: 32-byte device secret via `crypto.getRandomValues`, SHA-256 via `crypto.subtle`, localStorage persistence, returning-visitor bypass. `data/supabase.ts`: real `@supabase/supabase-js` client behind `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; when the env vars are absent every call falls back to a localStorage registry with identical shapes (ponytail-marked — set env vars + run the migration and the file goes live unchanged). Migration at `supabase/migrations/0001_init.sql` includes the amendment: `daily_date` on telemetry + partial unique index `(handle, mode, daily_date)` — one scored daily per day enforced by Postgres — and `submit_game` returns false on the second attempt via unique_violation. Added `my_telemetry` RPC (secret-gated read for the research panel; telemetry has no public select policy).

**States:** gate empty, taken ("Taken. Someone is already losing under that name."), invalid, unreachable; the dry storage sentence is on the gate. e2e covers claim -> wipe identity -> same handle -> taken error -> new handle -> home.

## M3b — The daily, stats, share card (cut-line priority 2)

**Built:** daily card pinned above the modes (No.N from the 2026-08-04 epoch, one scored attempt — replayed attempts blocked client-side by the localStorage result and server-side by the unique index). Daily runs the misère engine with `dateSeed(todayISO)` — everyone gets the bit-identical tape (determinism test from M2R). Recap grows a damage report for dailies: ASCII share card (box drawing + block elements only — passes the emoji grep by construction, unit-tested for it), clipboard copy, Wordle-style stats row (played / streak / max streak / best) computed from telemetry in `data/daily.ts`. Streak logic unit-tested (consecutive-day runs, gap resets, stale-chain zeroing).

## M4 — Competitive modes

**Built:** `CompGame` over the M1 NBBO engine — vs ERIS (her quotes rendered read-only with live inventory) and pass-and-play duel (lock quotes -> pass the phone -> resolve). Comp verdict banner ("X loses best."), per-desk PnL in desk accents, dual-scatter chart. Dummy grew comp rows: dummy-vs-ERIS and dummy-vs-dummy across all three policies, residual checked on BOTH desks — 12 rows total, all at float epsilon.

## M5 — Data layer live (fallback mode)

**Built:** `submit_game` wired on every game end in all four modes (+ daily variant); failures surface a retry toast ("Telemetry lost in the mail.") holding the exact payload — telemetry never silently drops. Leaderboard (top 10 by best_misere, instructive empty state) and research panel (per-mode aggregates + prospect-theory read + raw JSON export) read live rows via the same env-gated client. Smoke e2e: the dummy claims a handle and plays ALL FIVE mode variants through the real UI, asserts the leaderboard row appears with the exact seed-1 score ($102.00), the daily share card renders, and the research panel aggregates both solo modes. Passing on desktop + mobile projects.

**Not done (blocked on provisioning, by design):** the same smoke against a real Supabase project, and M6 (PWA + Lighthouse + Vercel). Zero code changes expected — set the two env vars, run the migration, re-run `npm run e2e`.

**Smelled wrong:** (1) e2e claims write real rows when env vars are set — the M6 production run needs a throwaway handle convention (dummy_*) or a test-data sweep; noted for M6. (2) `my_telemetry` RPC is new surface beyond the original spec — required because telemetry has RLS with no select policy; flagging so it gets reviewed. (3) With `?seed=` pinned, consecutive solo games replay the same tape (component remount resets the offset) — correct for e2e, invisible in production where the clock seeds.

**Would fix with more time:** queue failed submissions in localStorage and flush on reconnect — the PWA offline requirement will force this at M6 anyway; the retry toast covers tonight.

## M6 — PWA, performance, ship (BLOCKED on credentials)

**Built:** manifest (standalone, 192/512 icons rendered from the blackletter M via the installed Playwright chromium — no new dependency), service worker (network-first navigations with cached shell, cache-first assets), registration gated to PROD so dev and e2e are unaffected. Offline submission queue: failed telemetry persists to localStorage and flushes on `online` and on load; the retry toast now drains the queue rather than resubmitting one payload.

**Performance — Lighthouse mobile, three passes:**
- 47 (FCP 8.1s) — render-blocking Google Fonts + a 545 kB single bundle.
- 77 — fonts made non-blocking (`media="print"` + onload swap); recharts and supabase-js split to dynamic imports. Initial JS 545 kB -> 181 kB.
- **93** — CLS 0.218 -> 0 by giving every archival image intrinsic width/height, images recompressed to 800px q60 (1.1 MB -> 624 KB). FCP 1.8s, LCP 3.1s, TBT 0ms, total weight 312 KiB.

Gate is ≥ 85: **93 passes.**

**PWA gate:** `e2e/pwa-check.mjs` asserts the manifest is standalone with 2 icons and that a reload with the network cut still renders the app shell. Both pass against the production preview.

**Verification after all M6 changes:** 17 unit tests, dummy 12 rows / 0 failures, 22 screenshot runs, all-mode smoke green on desktop and mobile. Banned-word and emoji greps clean.

**BLOCKED — could not complete:** the `.env.local` referenced in the instruction is not present in the repo (or anywhere under Documents/Downloads/Desktop), and no Supabase or Vercel CLI is installed or authenticated on this machine. So: the migration was NOT run against a real project, the smoke did NOT run against real Supabase, and NOTHING was deployed. Everything above was verified against the local fallback registry and a local production preview. No code changes are expected when credentials land — set the two env vars, run `supabase/migrations/0001_init.sql`, redeploy, and re-run `npm run e2e` plus `node e2e/pwa-check.mjs <prod-url>`.

**Smelled wrong:** the service worker caches "/" on every navigation — a deploy leaves one stale load until the SW updates. Fine for a game; bump `CACHE` on releases that change the shell.

**Would fix with more time:** self-host the three font families. Non-blocking loading got the score to 93, but LCP at 3.1s is still font-swap-dominated; self-hosting is the real fix.

## M6b — Amended spec: verdict ladder, doctrine completion, PWA hardening

**Verdict ladder (verbatim copy, calibrated bands).** 1,000 seeded misère games across the three dummy policies. The provisional bands assumed a much narrower distribution than the engine produces:

```
n=1000, zero-fill games: 0
min -174.21  p25 -6.07  median 17.40  p75 54.63  p90 92.60  p95 114.50  p99 171.00  max 219.10
```

| Tier | Provisional | Provisional share | **Calibrated** | **Share** |
|---|---|---|---|---|
| GENERATIONAL WEALTH (WRONG GAME) | profit ≥ 15 | 16.0% | profit ≥ 15 | 16.0% |
| ACCIDENTAL RAINMAKER | +5 to +15 | 10.2% | +5 to +15 | 10.2% |
| SPREAD GOBLIN | +1 to +5 | 4.3% | +1 to +5 | 4.3% |
| THE EFFICIENT MARKET HYPOTHESIS (DEROGATORY) | -1 to +1 | 2.3% | -1 to +1 | 2.3% |
| PETTY CASH ARSONIST | 1-8 | 7.9% | **1-10** | 9.9% |
| MONEY BURNER | 8-16 | 7.6% | **10-25** | 13.4% |
| GUH. | 16-25 | 7.8% | **25-45** | 14.2% |
| CERTIFIED TOXIC | 25-35 | 7.8% | **45-75** | 13.4% |
| SUPERFUND SITE | 35-45 | 6.4% | **75-150** | 14.6% |
| FINAL BOSS OF ADVERSE SELECTION | 45+ | **29.7%** | **150+** | **1.7%** |

Provisional bands put 29.7% of games in the apex tier. Calibrated: apex starts at p98.3, the modal outcome (median $17.40) lands on MONEY BURNER — position 6 of 10, mid-ladder — and every tier is reachable. The profit-side bands are semantically anchored (any profit is failure) so they were left at spec values. Script committed at `src/test/calibrate.ts`.

GHOST DESK override and both stamps are unit-tested on constructed cases: inventory >60% of losses fires LUCK, NOT CRAFT; sharps >70% with ≥5 sharp fills fires PRECISION INSTRUMENT; 4 sharp fills fires neither; a profitable desk and a ghost desk never stamp. Comedy guardrails re-read across all copy — grep for self-harm/despair terms returns nothing.

**Doctrine completed.** How-to-play modal now carries the SVG diagram (quotes straddling a hidden fair value, a sharp lifting the mispriced side) and is reachable any time from a "?" control in the header. Stats modal: played / best / streak / max plus a score-distribution histogram over the calibrated bands. Countdown to the next daily on both the home card and the results screen. Instructive empty states throughout.

**Daily hardened.** Seed now derives from the **UTC** date (was local) — unit-tested that 23:30 UTC on the 4th is still tape #4 regardless of the viewer's zone. Determinism test extended: a different date must produce a different V path, not just a different seed. Dummy grew a daily row: replays the date-seed twice, asserts the tapes are byte-identical, and asserts a second scored submission is rejected.

**Literal share card** (daily #1, engine-played):

```
MISERE DESK #1
made $15.76 (wrong game)
XXXXXXXXXXX▓▓▓
sharps ███░░░░░ -$10.27
noise  ░░░░░░░░ +$1.07
drift  ████████ +$24.96
https://misere-desk.vercel.app
```

Box-drawing and block elements only; the emoji grep passes. Strip is one glyph per fill — X for sharp, ▓ for noise.

**PWA hardened.** Maskable 192/512 icons added alongside the "any" pair (mark inside the 80% safe zone). iOS meta tags: `apple-mobile-web-app-capable`, status-bar style, app title, touch icon. Offline queue moved from localStorage to **IndexedDB** per spec, with a "Queued. It sends when you reconnect." toast. Unobtrusive add-to-home-screen hint from the second visit, suppressed in standalone display mode. Supabase is never cached: the service worker only handles same-origin GETs, so cross-origin RPC and leaderboard reads always hit the network. App Store / Play Store not attempted — Capacitor is the later path if the data collection justifies it.

**Caught a live bug the stale server was hiding.** A `vite preview` left running from the Lighthouse pass was reused by Playwright (`reuseExistingServer`), so a whole screenshot run rendered a stale build and looked green. After killing it, 24 of 26 shots failed at the handle gate: `.env.local` contained the un-substituted placeholder example (`YOURPROJECT` / `YOUR_ANON_KEY`), so `isLive` was true, the client pointed at a host that does not resolve, and every claim failed with "registry unreachable". Fixed at the root in `data/supabase.ts`: placeholder values are no longer treated as configuration, and a console warning says so. Lesson recorded: screenshot runs must not reuse a preview server.

**Verification (all after the changes):** 24 unit tests green; dummy 13 rows / 0 failures with the daily replay identical and the second submission rejected; 26 screenshot runs; all-mode smoke green on desktop and mobile; Lighthouse mobile **93** (FCP 1.7s, LCP 3.0s, CLS 0, TBT 0ms); PWA check green (standalone manifest, 4 icons, offline reload OK). Banned-word and emoji greps clean.

**STILL BLOCKED — not deployed.** `.env.local` holds placeholders, not real Supabase credentials, so the migration has not run against a real project and nothing is deployed. Vercel CLI is not authenticated on this machine (`vercel login` is interactive and cannot be driven from here).

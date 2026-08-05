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

## M6c — The Exchange: session hours

**Built:** the daily is now framed as a trading session on an exchange rather than a puzzle-of-the-day. `data/market.ts` gives three phases off the UTC clock — pre-open, open, closed — with the bell each phase counts toward. The floor trades **13:30-20:00 UTC** (09:30-16:00 ET, the real hours, which is the joke). Home card becomes THE EXCHANGE with a status dot, the live bell countdown, and "Take the floor" in place of "Play today's tape"; closed shows "The floor is dark" / "The bell has not rung" with the countdown to the next open. Results screen counts to the same bell. Practice desks are explicitly always open and unaffected.

**Tradeoff named up front.** A 6.5-hour window is more fun but locks out anyone whose waking hours miss it, and the daily is the research instrument — fewer sessions means fewer paired observations for the primary hypothesis. `OPEN_MIN`/`CLOSE_MIN` are two constants with a `ponytail:` note; setting 00:00-24:00 makes it always open if submissions come in thin. Weekend closure was deliberately NOT modelled — thematic, but it would cut the dataset by two sevenths.

**Tests:** 4 session tests (bell boundaries to the second, the right countdown target per phase, the closed countdown rolling across midnight without going negative, the window matching real ET hours). 29 unit tests total. E2E pins the clock with Playwright's `page.clock.setFixedTime` rather than adding a test-only override to production code; new screenshots cover the open and closed floor.

**Also in this pass:** candle-rain personal-best flourish, `© Zinuo Shi` byline, LICENSE, `.env.example`, secure-context handle-claim fix and mobile input hardening (see the commit).

## M5-live — Supabase project wired and verified

Project `wflzzsjnihtwpxrhixux`. Migration was already applied; probed the live contract directly
over the REST API before trusting the app to it. Every server-side guarantee in the spec holds:

| Check | Result |
| --- | --- |
| `claim_handle` new handle | true |
| `claim_handle` same handle again | **false** (DB uniqueness, not the client) |
| `submit_game` with a wrong secret | **false** |
| `submit_game` practice run | true |
| `submit_game` daily run | true |
| `submit_game` SECOND daily, same handle/mode/date | **false** (partial unique index) |
| leaderboard select | returns the row, score 77 = -pnl |
| direct `insert into players` with the anon key | **denied**, RLS 42501 |
| direct `select from telemetry` | **empty** — no public read policy |
| `my_telemetry` with a wrong secret | empty |
| `my_telemetry` with the right secret | 2 rows |

The all-mode smoke then ran green against the real project on desktop and mobile: dummy claims a
handle, plays misère / normal / the daily / ERIS / duel, and the leaderboard row comes back from
Postgres with the exact seed-1 score.

**Fixed to get there:** e2e used fixed handles, which can only ever be claimed once against a real
registry — the second project's run failed at the gate. Handles are now generated per run
(`e2e/handle.ts`, `zz` prefix so throwaway rows are identifiable). `supabase/cleanup_test_rows.sql`
removes them; the anon key deliberately cannot delete, so that runs in the SQL editor.

**Note on keys:** the anon/publishable key is meant to be public — it is shipped in the client
bundle by design and RLS is what protects the data. No service-role key was used or needed.

## Production bug — handle claim rejected on the deployed site

**Symptom.** On the live Vercel deploy, claiming a handle failed on mobile with "the registry is unreachable".

**My first response was wrong in method:** I guessed at causes (mangled key, carrier filtering, stale service worker) because the catch block collapsed every failure mode into one generic string. The actual first fix was to stop hiding the error — surface the thrown message, log it, and show which registry the build is talking to. The next deploy then reported the real fault immediately:

```
TypeError: Failed to execute 'set' on 'Headers':
String contains non ISO-8859-1 code point
```

**Root cause.** The anon key stored in Vercel carried a character above U+00FF — smart quote, zero-width space or BOM, picked up in copy-paste. `fetch` refuses to place such a string in the `apikey` header, so the request never left the browser. Nothing was wrong with the key's validity, the network, the RLS policies or the carrier.

**Fix.** Both env values have a narrow legal alphabet — a JWT/`sb_publishable_*` key is base64url plus dots, the URL is printable ASCII — so anything outside it is paste damage and is stripped at load, with a console warning naming how many characters were removed. This makes the app immune to the same paste damage on any future redeploy or environment.

**Regression test** (`src/test/env.spec.ts`) reproduces the failure against the real `Headers` API: keys poisoned with a zero-width space, BOM, smart quotes and an em dash all throw before cleaning and all pass after. A separate case pins the subtler one — a non-breaking space is *legal* Latin-1, so it never trips the header check and would instead have produced a silent 401; it is stripped too.

**Also fixed in this pass:** requests now abort after 12s instead of hanging on a stalled network, and the SW cache version was bumped so a redeploy cannot keep serving stale chunks.

**Test-data debt this exposed.** Every e2e run plays the same seed, so every throwaway row scores exactly $102.00. Ten tied rows now saturate the top-10 leaderboard, and the smoke test's "this handle appears on the board" assertion became order-dependent and flaky. Rewritten to assert what it actually means: the board renders real server rows, and the *per-handle* write is proven via the research panel, which reads `my_telemetry` scoped to that handle's secret (n=2 misère, n=1 normal). `supabase/cleanup_test_rows.sql` must be run before launch.

**REMAINING: deploy only.** `.env.local` holds placeholders, not real Supabase credentials, so the migration has not run against a real project and nothing is deployed. Vercel CLI is not authenticated on this machine (`vercel login` is interactive and cannot be driven from here).

## Post-launch — accounts and a bigger, harder market

**Password accounts (no email).** The gate now takes a handle AND a password; the same pair
signs back in from any device instead of stranding the handle in one browser's localStorage.
The password is never sent or stored: the client derives PBKDF2-SHA256, 150k iterations, salted
per handle, and only that hash reaches the server — so `claim_handle` and `submit_game` are
unchanged. One new RPC, `verify_login` (migration `0002_login.sql`), answers whether a
handle+hash pair exists. One button covers both paths: log in if the pair matches, claim the
handle if it is free, and say "taken, wrong password" otherwise. Added a sign-out control so a
shared phone can switch desks. Pre-password identities (random device secret, no password) are
dropped on load and re-claimed.

`ponytail:` the login RPC has no server-side rate limit — the 150k-iteration derivation is the
only brute-force cost. Fine for a game; add pg rate limiting if it ever matters.

**The market moved to the 1000 level, and got harder.** Player feedback was that the game had
become solvable — the optimal misère line was obvious after a few runs. Pure rescaling would not
have fixed that, so volatility rose *relative* to the band as well:

| | before | after |
| --- | --- | --- |
| start / fair value | 100 | **1000** |
| quote tick | 0.5 | **5** |
| spread floor | 1.0 | **10** |
| band | ±4 | **±60** |
| fair-value sigma per tick | 0.8 | **14** |
| jump | 6%, 2-4 | **8%, 25-60** |
| band : sigma | 5.0 | **4.3** |

A quote parked at the band edge no longer stays right for long, which is what made the old
balance readable. Prices render with thousands separators.

**The dependency this created, flagged before it bit:** verdict tiers are absolute dollar
amounts. Re-running the 1,000-game calibration on the new engine showed the old ladder putting
**61.4% of games in the apex tier** — the game would have told nearly every player they were the
FINAL BOSS. Re-calibrated (n=1000, median 371, p99 2817):

| Tier | New floor | Share | Percentile |
| --- | --- | --- | --- |
| PETTY CASH ARSONIST | 20 | 7.2% | to p38.6 |
| MONEY BURNER | 150 | 13.3% | to p51.9 |
| GUH. | 400 | 14.9% | to p66.8 |
| CERTIFIED TOXIC | 750 | 14.3% | to p81.1 |
| SUPERFUND SITE | 1200 | 16.0% | to p97.1 |
| FINAL BOSS OF ADVERSE SELECTION | 2500 | 2.9% | p97.1 and up |

Modal outcome lands on MONEY BURNER (position 6 of 10, mid-ladder), apex at p97.1, every tier
reachable. Normal ladder and the stats histogram scaled to match.

**Verification:** 36 unit tests, dummy 13 rows / 0 failures with residuals at 1e-13, 28
screenshots, and the all-mode smoke green. The smoke and screenshots were run against the LOCAL
fallback because `verify_login` does not exist in the live project yet — confirmed by probe
(`PGRST202`). Run `supabase/migrations/0002_login.sql` and the live path works unchanged.

## M6 — Shipped

**Live: https://misere.vercel.app** (repo `ZinuoS/misere`, deploys from `main` on push).

`0002_login.sql` applied. Probed the live login contract directly before trusting the UI to it:

| Check | Result |
| --- | --- |
| `verify_login` on an unknown pair | false |
| claim a fresh handle | true |
| `verify_login` with the right hash | **true** |
| `verify_login` with a wrong hash | **false** |
| re-claim the same handle | **false** |

**Production verification, all against the deployed URL and the real database:**

- All-mode smoke green on desktop and mobile — claim, misère, normal, the daily, ERIS, duel, leaderboard and per-handle telemetry.
- New round-trip test: claim -> play -> **sign out** -> wrong password refused -> right password returns to the SAME account with history intact (`n=1` still in the research panel). This is the feature that motivated the change, so it gets its own test rather than riding on the smoke.
- PWA: standalone manifest, 4 icons, offline shell reload OK.
- Lighthouse mobile **92** (FCP 1.8s, LCP 3.2s, CLS 0, TBT 0ms) — above the 85 gate.
- Live gate reports `registry: wflzzsjnihtwpxrhixux.supabase.co - key len 208 ...diKQ5U`, zero page errors on either viewport. The masked-key value that broke the first deploy is gone.

**Open, deliberately:** the leaderboard still holds e2e rows (`zz` prefix) — `supabase/cleanup_test_rows.sql` clears them, and it has to run from the SQL editor because the anon key cannot delete, which is the RLS working. Handles claimed before password accounts have a device-secret hash and no password, so they cannot be signed into; they are not in the cleanup list yet by design.

**What I would do next with more time:** self-host the three font families (LCP is still font-swap-dominated), and watch whether the 13:30-20:00 UTC session window suppresses daily submissions — it is the research instrument, and two constants in `data/market.ts` widen it.

## Retune — from chase game to inference game

**The diagnosis was right.** Difficulty had been raised on volatility, so the posterior never
tightened and inventory luck swamped skill. Fair value is now drawn once from Uniform(0, 1000)
and is persistent: drift sigma 3, reflecting barriers at both walls, one warned news event of
+/-(40-80) at a uniform tick in [18, 28], prints at 15% with sigma 35. V0, the news tick and the
news size all come from the injected PRNG, so a daily seed still pins the whole scenario.

**Before number (gate 1):** median luck share for the best available policy on the old engine was
**0.500** (EWMA, misere, n=1000) — half of the P&L was inventory noise.

### Two structural findings, and a deviation from the letter of the brief

**1. With quotes free anywhere in 0-1000, misere is not an inference game — it is a corner
solution.** Loss per lot is |price - V|, so "lose the most" is maximised by parking at a range
edge, and WHERE V sits barely matters. Measured: a print-only EWMA bot beat the full Bayesian bot
in **all 24** (band x print-rate x anchor-weight) configurations I swept, by up to 0.9 pooled sd.
Gate 3 explicitly says that if EWMA ties BAYES the information structure is at fault and must be
fixed — so I fixed it rather than weakening EWMA.

**2. The fix is a real exchange rule: clearly-erroneous execution.** A fill more than `TUNE.BUST`
(90) from true fair value is voided, exactly as an exchange busts an obviously mispriced print.
The payoff becomes a ridge — be wrong by just under BUST, on the correct side — which is
impossible without a tight posterior. Being wildly wrong now earns nothing. This also enriches the
information structure: a fill that STANDS is a two-sided bound (V is past the price, but within
BUST of it), and a bust is itself evidence that V is far away.

Consequently solo quotes are bounded to +/-`TUNE.SOLO_BAND` (250) of the public print anchor
rather than the full range. **This is a deliberate deviation from "the range IS the band"**, and it
is the only way I could find to make gate 3 pass without weakening a bot. The wide prior — the part
the brief insisted on — is untouched: V0 is still Uniform(0, 1000) and still hidden.

### Gate results (n=1000 per bot per mode)

```
EWMA|misere    score mean    295.3  sd   393.1  median luck 0.030
BAYES|misere   score mean    804.8  sd   486.6  median luck 0.191
RANDOM|normal  score mean   -152.5  sd   150.2  median luck 0.274
EWMA|normal    score mean   -275.5  sd   402.4  median luck 0.363
BAYES|normal   score mean   -120.8  sd   311.2  median luck 0.358

GATE 1 luck share      BAYES misere median 0.191 < 0.35        PASS
GATE 2 learnability    sd<10 by tick 20 in 87.0% (n=754) >= 70%   PASS
GATE 3 skill gap       misere BAYES-RANDOM d=1.81 (>1.0), BAYES-EWMA d=1.15 (>0.5)  PASS
       (normal mode    BAYES-RANDOM d=0.13, BAYES-EWMA d=0.43)
```

All three pass. Normal mode's skill gap is smaller (d=0.13 vs RANDOM, 0.43 vs EWMA) because under
the bust rule everyone bleeds to informed flow; the gates are specified on misere, but this is
worth watching.

### Recalibrated verdict tiers

Calibration now pools 3,000 games from the three reference bots (no-skill / public-info /
full-inference) rather than three scripted policies, so the distribution spans real skill.

```
n=3000 (3 bots x 1000), zero-fill games: 427
min -476  p10 0  p25 50  median 265  p75 655  p90 1074  p99 1927  max 2366

suggested bands (paste the `lo` values into ui/verdicts.ts, highest first):
  lo   1950     0.8%  FINAL BOSS OF ADVERSE SELECTION    p99.2 and up
  lo    850    15.4%  SUPERFUND SITE                     up to p99.2
  lo    550    15.1%  CERTIFIED TOXIC                    up to p83.7
  lo    300    15.5%  GUH.                               up to p68.6
  lo    125    18.4%  MONEY BURNER                       up to p53.1
  lo     20    13.0%  PETTY CASH ARSONIST                up to p34.7
  lo      0    15.9%  THE EFFICIENT MARKET HYPOTHESIS    up to p21.7
  lo      0     0.0%  SPREAD GOBLIN                      up to p5.8
  lo    -80     3.8%  ACCIDENTAL RAINMAKER               up to p5.8
  lo   -inf     2.0%  GENERATIONAL WEALTH (WRONG GAME)   up to p2.0
```

Final cuts (profit side hand-set, because two percentiles both rounded to zero and would have made
SPREAD GOBLIN unreachable): -250, -80, -20, 20, 125, 300, 550, 850, 1950. Every tier reachable
(min 0.5%), median score 265 lands in **tier 6 of 10**, apex at **p99.2**.

### UI

Steppers now accelerate on press-and-hold (TICK for 400ms, then COARSE=25 per 90ms repeat), so any
legal quote is one interaction away — a second +/-25 row was NOT enough, since 250 to 800 would
still have been 22 taps. Opening quote is 250/750 and the reference reads "value in 0-1000" until
the first print. How-to-play copy rewritten for the inference game.

**Bug found by the screenshots:** the tape rendered `flex-col-reverse`, which parks the scroll at
the OLDEST of the last 14 entries — at tick 17 the visible window showed ticks 06-10, hiding the
tick you just played. Fatal in a game where the tape is the only evidence. Now newest-first in
normal flow order.

**Verification:** 42 unit tests (new: reflection at both walls including moves larger than the
range, exactly one warned news event inside [18,28] with magnitude 40-80, no booked fill ever
further than BUST from V, solo quote legality fuzz), dummy 13 rows / 0 failures, 34 screenshots.

## Retune follow-ups from live play

**Typed quote entry.** With a 0-1000 range, stepping to a target is hopeless — prices are now
editable fields (native numeric input, so phones raise the number pad; commit on blur/Enter;
engine snaps to grid, holds the spread floor by pushing the other side, clamps to the band).
First implementation was a controlled React input and it had a real bug: programmatic input
(test drivers, autofill keyboards) raced the draft state and interleaved old and new digits —
typing 300 into a field showing 250 produced 250300, which clamped to the band edge and looked
like the input "jumping". Rewritten uncontrolled: the DOM owns the text, the engine owns the
number. E2E types through the real UI on both viewports.

**News banner.** The HEADLINE CROSSES warning was one red line in a scrolling tape and the
player missed it in live play. It is now also a full-width red banner above the quote panel,
rendered only on the warning tick, so it reveals nothing early. (User-approved UI addition
beyond the original "stepper and modal copy only" constraint.)

**Dominant-strategy regression.** Live play on a stale build resurfaced the 1000-level
version's exploit: park both quotes at the band edge at the spread floor and farm fills with no
inference. A dedicated regression now pins it dead: over 150 seeded games the edge-camper's
prints are mostly voided by the bust rule (busts > booked fills) and a Bayesian player on the
SAME seeds destroys more than 2x the camper's total. 46 unit tests green.

**Stale-build trap, again.** The screenshot that surfaced all this showed fair value above
1000 — impossible in the new engine; it was the OLD build served from the service worker's
cache (or the still-deployed old version). SW cache bumped to md-v3 so the next deploy purges.
Standing lesson recorded the first time this happened; it happened again anyway because the
bump is manual. ponytail: cache name is hand-bumped; derive it from the build hash if this
bites a third time.

## Retune shipped

User verdict after live play: "the range adjusting feels like a quant interview" — the retune's
target register, confirmed at the desk. Player reacted to the news banner and improved their loss.

**Drift double-check (user-requested):** a specimen test now pins the attribution end to end —
a game with exactly one fill held through the news event has `invPnl = inv x (V_end - V_at_fill)`
to 1e-6 and `pnl = fill edge + drift`. The headline jump lands in the drift bucket, where it
belongs: holding through news is inventory risk, not craft. 47 unit tests green.

**Production verification:** deploy auto-triggered on push; bundle carries the retune markers
(news banner, bust rule, typed inputs, 0-1000 tape line); SW serving md-v3 so stale builds purge;
PWA offline reload OK; Lighthouse mobile **91** (CLS 0, TBT 0ms); live gate reports the correct
registry and key, zero page errors. Leaderboard is already on the new score scale — top spot is a
real player at $1,637.84 destroyed, above the e2e rows at $1,516.20 (cleanup SQL still available
to clear the zz rows).

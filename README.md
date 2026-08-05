# Misère Desk

Market making in reverse: the player must lose as much money as possible under real
market-making constraints (spread floor, price band, inventory cap, ~45% informed flow).
Glosten–Milgrom, sign flipped. Built as a research instrument for loss-seeking behavior.

## Pre-registered hypothesis

*Written 2026-08-04, before the first player data was collected.*

**Primary (conditional on the daily tape).** On daily D, every player faces the
bit-identical exogenous tape (same date-seed, same prints, same customer arrivals).
Misère play is the mirror image of normal play under reflection of the objective, so
rational play predicts: the distribution of quote skew in misère mode on daily D is the
reflection of the normal-mode distribution on the same daily. We test whether it is
instead *shifted beyond* the reflection — |skew| and sharp-fill share in misère exceeding
the mirrored normal-mode prediction — i.e., loss-seeking in excess of the mirror image
(prospect-theory overshoot in the loss domain). The tape enters as a fixed effect: paired
per-daily comparisons (Wilcoxon on |skew|, paired by daily date) remove tape luck from
the variance.

**Secondary.** The original aggregate version: pooled across non-daily practice games,
|skew| and sharp-fill share run higher in misère than reflected-normal play predicts.
Noisier (tape not controlled); reported alongside, not instead.

Telemetry per game: pnl, sharp edge, noise edge, inventory pnl, fills, sharp fills,
avg spread, avg skew, duration. Decomposition identity `pnl = sharp + noise + inventory`
is enforced by unit test and dev-build runtime assertion.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in a Supabase project, or leave it out entirely
npm run dev
```

Without Supabase credentials the app runs on a localStorage fallback registry with
identical call shapes — handles, leaderboard and telemetry are per-browser. Add the
two env vars and run `supabase/migrations/0001_init.sql` in the project's SQL editor
to go live; no code changes.

Note: claiming a handle needs `crypto.subtle`, which browsers expose only in a secure
context. Use `localhost` or https — a plain-http LAN address will refuse the claim and
say so.

Scripts: `test` (Vitest), `dummy` (headless dummy player over every mode), `calibrate`
(1,000-game tier-band calibration), `shots` (Playwright screenshots), `e2e` (all-mode
smoke through the real UI).

## Stack

Vite + React 18 + TypeScript + Tailwind. Pure seeded engine (`src/engine/`, zero React
imports, one injected mulberry32 PRNG). Supabase for handles, telemetry, leaderboard.
Vitest unit suite; Playwright screenshots + dummy-player smoke runs. See `BUILDLOG.md`
for the milestone-by-milestone story and `CREDITS.md` for image licenses.

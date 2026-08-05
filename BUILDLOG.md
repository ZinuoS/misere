# BUILDLOG — Misère Desk

Self-reviews per milestone. Newest at the bottom.

## M0 — Scaffold

**Built:** Vite + React 18 + TS + Tailwind v4 + Vitest + Playwright, all wired. Scripts: `test`, `dummy`, `shots`, `e2e`. Fonts loaded (Anton display, IBM Plex Mono, Archivo body). Palette tokens as CSS vars + Tailwind theme, inverted semantics preserved (gold = loss, red = profit). Shell renders the marquee ticker and tabloid masthead. Prototype copied to `reference/misere_desk_v3.jsx`.

**Dummy run:** trivially passes — prints an empty table, 0 runs 0 failures, exits 0. No engine yet by design.

**Smelled wrong:** the mobile Playwright project defaulted to WebKit (iPhone 12 device profile) with only Chromium installed — forced `browserName: "chromium"`, viewport is what matters for shots. Vite's template ships React 19; pinned react/react-dom/@types to 18 per the spec.

**Would fix with more time:** self-host the Google Fonts (one less external request, matters for the Lighthouse M6 gate). Deferred until M6 proves it necessary.

-- Remove throwaway rows left by e2e runs and manual probes.
-- Run in the Supabase SQL editor whenever the leaderboard needs a clean slate.
-- e2e handles are prefixed "zz" (see e2e/handle.ts); the probes are named below.

delete from telemetry
where handle like 'zz%'
   or handle in ('probe_live', 'dummy_smoke', 'dummy_desk', '__probe__');

delete from players
where handle like 'zz%'
   or handle in ('probe_live', 'dummy_smoke', 'dummy_desk', '__probe__');

-- verify
select handle, best_misere, games from players order by best_misere desc nulls last;

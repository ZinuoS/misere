-- Live worst-movers tape: exactly one row, upserted in place by /api/tape.
-- Public read; writes only via the service-role key server-side. ~300 bytes forever.
create table if not exists market_tape (
  id int primary key default 1 check (id = 1),
  as_of date not null,
  losers jsonb not null, -- [{"t":"XYZ","pct":-38.4}] x 10
  updated_at timestamptz default now()
);
alter table market_tape enable row level security;
drop policy if exists "public read tape" on market_tape;
create policy "public read tape" on market_tape for select using (true);

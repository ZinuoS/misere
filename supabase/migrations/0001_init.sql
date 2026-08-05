-- Misère Desk schema. Run once against a fresh Supabase project.
-- All writes go through security-definer RPCs; anon key only ever selects.

create table players (
  handle text primary key check (handle ~ '^[a-zA-Z0-9_-]{3,16}$'),
  secret_hash text not null,
  created_at timestamptz default now(),
  best_misere numeric,
  best_normal numeric,
  games int default 0
);

create table telemetry (
  id bigint generated always as identity primary key,
  handle text references players(handle),
  mode text not null,
  pnl numeric, sharp_edge numeric, noise_edge numeric, inv_pnl numeric,
  n_fills int, n_sharp int, avg_spread numeric, avg_skew numeric,
  duration_ms int,
  daily_date date, -- set only for daily runs; null for practice
  created_at timestamptz default now()
);

-- one scored daily attempt per player per mode per day, enforced by Postgres
create unique index one_daily_attempt
  on telemetry (handle, mode, daily_date)
  where daily_date is not null;

alter table players enable row level security;
alter table telemetry enable row level security;
create policy "public read leaderboard" on players for select using (true);
-- no direct insert/update policies: all writes via RPCs below

create or replace function claim_handle(p_handle text, p_secret_hash text)
returns boolean language plpgsql security definer as $$
begin
  insert into players (handle, secret_hash) values (p_handle, p_secret_hash);
  return true;
exception when unique_violation then
  return false;
end $$;

create or replace function submit_game(
  p_handle text, p_secret_hash text, p_mode text,
  p_pnl numeric, p_sharp numeric, p_noise numeric, p_inv numeric,
  p_fills int, p_nsharp int, p_spread numeric, p_skew numeric, p_duration int,
  p_daily_date date default null
) returns boolean language plpgsql security definer as $$
declare v_score numeric;
begin
  if not exists (select 1 from players where handle = p_handle and secret_hash = p_secret_hash) then
    return false;
  end if;
  begin
    insert into telemetry (handle, mode, pnl, sharp_edge, noise_edge, inv_pnl, n_fills, n_sharp, avg_spread, avg_skew, duration_ms, daily_date)
    values (p_handle, p_mode, p_pnl, p_sharp, p_noise, p_inv, p_fills, p_nsharp, p_spread, p_skew, p_duration, p_daily_date);
  exception when unique_violation then
    return false; -- second scored daily attempt: rejected by the index, not the client
  end;
  v_score := case when p_mode = 'misere' then -p_pnl else p_pnl end;
  update players set
    games = games + 1,
    best_misere = case when p_mode = 'misere' then greatest(coalesce(best_misere, v_score), v_score) else best_misere end,
    best_normal = case when p_mode = 'normal' then greatest(coalesce(best_normal, v_score), v_score) else best_normal end
  where handle = p_handle;
  return true;
end $$;

create or replace function my_telemetry(p_handle text, p_secret_hash text)
returns setof telemetry language sql security definer as $$
  select t.* from telemetry t
  where t.handle = p_handle
    and exists (select 1 from players where handle = p_handle and secret_hash = p_secret_hash)
  order by t.created_at;
$$;

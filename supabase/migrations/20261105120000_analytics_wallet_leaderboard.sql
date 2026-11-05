-- =====================================================================
-- Digital Nation: analytics, server-side gems, and the world leaderboard
-- Run once in the Supabase SQL Editor (project "Digital Nation").
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Anonymous gameplay statistics (only sent when the player agrees)
--    Anyone can add events; nobody can read them through the API.
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id bigint generated always as identity primary key,
  anon_id text not null check (char_length(anon_id) between 8 and 64),
  name text not null check (name ~ '^[a-z0-9_]{2,40}$'),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) < 2000),
  session_id text check (char_length(session_id) <= 64),
  app_version text check (char_length(app_version) <= 16),
  created_at timestamptz not null default now()
);
create index if not exists events_name_time on public.events (name, created_at);
create index if not exists events_anon_time on public.events (anon_id, created_at);
alter table public.events enable row level security;
drop policy if exists "Anyone can add gameplay events" on public.events;
create policy "Anyone can add gameplay events" on public.events
  for insert to anon, authenticated with check (true);

-- Removes statistics older than 12 months (see the privacy policy).
create or replace function public.prune_events()
returns void language sql security definer set search_path = '' as $$
  delete from public.events where created_at < now() - interval '12 months';
$$;
revoke all on function public.prune_events() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Gems and purchases: the server owns the balance.
--    Players can read their own wallet and ledger; every change goes
--    through the functions below, which check prices and limits.
-- ---------------------------------------------------------------------
create table if not exists public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gems integer not null default 25 check (gems >= 0),
  vip_until timestamptz,
  golden boolean not null default false,
  flags integer[] not null default '{}',
  tones text[] not null default '{}',
  shield_until timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.gem_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('import', 'earn', 'spend', 'purchase')),
  reason text not null,
  ref text not null default '',
  delta integer not null,
  created_at timestamptz not null default now()
);
create index if not exists gem_ledger_user_time on public.gem_ledger (user_id, created_at);
-- One-time rewards can only be granted once per player.
create unique index if not exists gem_ledger_once on public.gem_ledger (user_id, reason, ref)
  where reason in ('achievement', 'quiz', 'era');

alter table public.wallets enable row level security;
alter table public.gem_ledger enable row level security;
drop policy if exists "Players read their own wallet" on public.wallets;
create policy "Players read their own wallet" on public.wallets
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Players read their own gem history" on public.gem_ledger;
create policy "Players read their own gem history" on public.gem_ledger
  for select to authenticated using ((select auth.uid()) = user_id);

-- Wallet as JSON for the game, including today's limits (UTC day).
create or replace function public.wallet_row(uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'gems', w.gems,
    'vipUntil', w.vip_until,
    'golden', w.golden,
    'flags', to_jsonb(w.flags),
    'tones', to_jsonb(w.tones),
    'shieldUntil', w.shield_until,
    'warpsToday', (select count(*) from public.gem_ledger l where l.user_id = uid and l.reason like 'warp\_%' and l.created_at >= date_trunc('day', now())),
    'adsToday', (select count(*) from public.gem_ledger l where l.user_id = uid and l.reason = 'ad' and l.created_at >= date_trunc('day', now())),
    'buysToday', (select count(*) from public.gem_ledger l where l.user_id = uid and l.kind = 'purchase' and l.created_at >= date_trunc('day', now()))
  )
  from public.wallets w where w.user_id = uid;
$$;
revoke all on function public.wallet_row(uuid) from public, anon, authenticated;

-- Returns the wallet. The first call creates it, importing what the device
-- already had (capped: at most 1,500 gems, VIP for at most 31 more days).
create or replace function public.wallet_get(p_local jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  start_gems integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.wallets where user_id = uid) then
    start_gems := least(greatest(coalesce((p_local ->> 'gems')::integer, 25), 0), 1500);
    insert into public.wallets (user_id, gems, golden, flags, tones, vip_until)
    values (
      uid,
      start_gems,
      coalesce((p_local ->> 'golden')::boolean, false),
      coalesce(array(select x::integer from jsonb_array_elements_text(coalesce(p_local -> 'flags', '[]'::jsonb)) x where x ~ '^[6-9]$'), '{}'),
      coalesce(array(select x from jsonb_array_elements_text(coalesce(p_local -> 'tones', '[]'::jsonb)) x where x in ('neon', 'platinum', 'royal')), '{}'),
      case when coalesce((p_local ->> 'vipUntil')::double precision, 0) > 0
        then least(to_timestamp((p_local ->> 'vipUntil')::double precision / 1000), now() + interval '31 days') end
    )
    on conflict (user_id) do nothing;
    insert into public.gem_ledger (user_id, kind, reason, delta) values (uid, 'import', 'import', start_gems);
  end if;
  return public.wallet_row(uid);
end;
$$;

-- Free gems. The server decides the amount and enforces the limits.
create or replace function public.wallet_earn(p_reason text, p_ref text default '', p_amount integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  amt integer;
  max_total integer;
  max_today integer;
  n integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public.wallet_get(null);
  p_ref := coalesce(left(p_ref, 40), '');
  case p_reason
    when 'achievement' then amt := 10; max_total := 40;
    when 'quiz'        then amt := 3;  max_total := 70;
    when 'era'         then amt := 25; max_total := 6;
    when 'daily'       then amt := least(greatest(coalesce(p_amount, 0), 0), 20); max_today := 1;
    when 'vip_daily'   then amt := 10; max_today := 1;
    when 'minigame'    then amt := 2;  max_today := 10;
    when 'ad'          then amt := 5;  max_today := 5;
    else raise exception 'unknown_reason';
  end case;
  if p_reason = 'vip_daily' and not exists (select 1 from public.wallets where user_id = uid and vip_until > now()) then
    raise exception 'not_vip';
  end if;
  if max_total is not null then
    -- Already granted: nothing to do (safe to retry).
    if exists (select 1 from public.gem_ledger where user_id = uid and reason = p_reason and ref = p_ref) then
      return public.wallet_row(uid);
    end if;
    select count(*) into n from public.gem_ledger where user_id = uid and reason = p_reason;
    if n >= max_total then raise exception 'limit_reached'; end if;
  else
    select count(*) into n from public.gem_ledger
      where user_id = uid and reason = p_reason and created_at >= date_trunc('day', now());
    if n >= max_today then raise exception 'limit_reached'; end if;
  end if;
  if amt > 0 then
    insert into public.gem_ledger (user_id, kind, reason, ref, delta) values (uid, 'earn', p_reason, p_ref, amt)
    on conflict do nothing;
    if found then
      update public.wallets set gems = gems + amt, updated_at = now() where user_id = uid;
    end if;
  end if;
  return public.wallet_row(uid);
end;
$$;

-- Spending gems. Prices live on the server.
create or replace function public.wallet_spend(p_item text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  w public.wallets%rowtype;
  price integer;
  n integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public.wallet_get(null);
  select * into w from public.wallets where user_id = uid for update;
  price := case p_item
    when 'warp_1' then 40 when 'warp_2' then 70 when 'warp_4' then 120
    when 'golden' then 1500 when 'shield' then 150 when 'grant' then 100
    when 'flag_6' then 150 when 'flag_7' then 200 when 'flag_8' then 150 when 'flag_9' then 250
    when 'tone_neon' then 100 when 'tone_platinum' then 150 when 'tone_royal' then 200
  end;
  if price is null then raise exception 'unknown_item'; end if;
  if p_item like 'warp\_%' then
    select count(*) into n from public.gem_ledger
      where user_id = uid and reason like 'warp\_%' and created_at >= date_trunc('day', now());
    if n >= 3 then raise exception 'limit_reached'; end if;
  end if;
  if (p_item = 'golden' and w.golden)
     or (p_item like 'flag\_%' and substr(p_item, 6)::integer = any (w.flags))
     or (p_item like 'tone\_%' and substr(p_item, 6) = any (w.tones)) then
    raise exception 'already_owned';
  end if;
  if w.gems < price then raise exception 'insufficient_gems'; end if;
  update public.wallets set
    gems = gems - price,
    golden = golden or p_item = 'golden',
    flags = case when p_item like 'flag\_%' then array_append(flags, substr(p_item, 6)::integer) else flags end,
    tones = case when p_item like 'tone\_%' then array_append(tones, substr(p_item, 6)) else tones end,
    shield_until = case when p_item = 'shield' then greatest(coalesce(shield_until, now()), now()) + interval '24 hours' else shield_until end,
    updated_at = now()
  where user_id = uid;
  insert into public.gem_ledger (user_id, kind, reason, delta) values (uid, 'spend', p_item, -price);
  return public.wallet_row(uid);
end;
$$;

-- PROTOTYPE ONLY: simulated real-money purchases, at most 2 per day.
-- Replace with store receipt validation (Google Play / App Store) before launch.
create or replace function public.purchase_simulated(p_product text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  amt integer;
  n integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public.wallet_get(null);
  amt := case p_product when 'p1' then 100 when 'p2' then 550 when 'p3' then 1200 when 'p4' then 2500 when 'vip' then 0 end;
  if amt is null then raise exception 'unknown_item'; end if;
  select count(*) into n from public.gem_ledger
    where user_id = uid and kind = 'purchase' and created_at >= date_trunc('day', now());
  if n >= 2 then raise exception 'limit_reached'; end if;
  if p_product = 'vip' then
    update public.wallets set vip_until = greatest(coalesce(vip_until, now()), now()) + interval '30 days', updated_at = now() where user_id = uid;
  else
    update public.wallets set gems = gems + amt, updated_at = now() where user_id = uid;
  end if;
  insert into public.gem_ledger (user_id, kind, reason, ref, delta) values (uid, 'purchase', p_product, 'simulated', amt);
  return public.wallet_row(uid);
end;
$$;

revoke all on function public.wallet_get(jsonb) from public, anon;
revoke all on function public.wallet_earn(text, text, integer) from public, anon;
revoke all on function public.wallet_spend(text) from public, anon;
revoke all on function public.purchase_simulated(text) from public, anon;
grant execute on function public.wallet_get(jsonb) to authenticated;
grant execute on function public.wallet_earn(text, text, integer) to authenticated;
grant execute on function public.wallet_spend(text) to authenticated;
grant execute on function public.purchase_simulated(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. World leaderboard: everyone can read it, players write only their row.
-- ---------------------------------------------------------------------
create table if not exists public.leaderboard (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nation text not null check (char_length(nation) between 1 and 32),
  leader text not null check (char_length(leader) between 1 and 24),
  flag smallint not null default 0 check (flag between 0 and 20),
  score real not null check (score between 0 and 1000),
  era smallint not null default 0 check (era between 0 and 6),
  lifetime_gdp double precision not null default 0 check (lifetime_gdp >= 0),
  updated_at timestamptz not null default now()
);
create index if not exists leaderboard_score on public.leaderboard (score desc);
alter table public.leaderboard enable row level security;
drop policy if exists "Anyone can read the leaderboard" on public.leaderboard;
create policy "Anyone can read the leaderboard" on public.leaderboard
  for select to anon, authenticated using (true);
drop policy if exists "Players add their own entry" on public.leaderboard;
create policy "Players add their own entry" on public.leaderboard
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Players update their own entry" on public.leaderboard;
create policy "Players update their own entry" on public.leaderboard
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Your position: 1 + the number of players with a higher score.
create or replace function public.my_leaderboard_rank()
returns integer language sql stable security definer set search_path = '' as $$
  select 1 + count(*)::integer from public.leaderboard
  where score > (select score from public.leaderboard where user_id = auth.uid());
$$;
revoke all on function public.my_leaderboard_rank() from public, anon;
grant execute on function public.my_leaderboard_rank() to authenticated;

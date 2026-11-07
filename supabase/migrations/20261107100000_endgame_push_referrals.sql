-- Endgame, push notifications and invites.
--   1. Space colonies: +100 gems per colony (wallet_earn reason 'colony'),
--      leaderboard scores above the old 1000 cap, and monthly seasons.
--   2. Push notifications: devices register a Web Push subscription and a short
--      queue of upcoming reminders; an Edge Function (push-send) sends due ones.
--   3. Invites: each signed-in player gets a short code; a friend who signs in
--      with it gets 50 gems, and so does the inviter (at most 20 invites).
-- Safe to run more than once.

-- ---------------------------------------------------------------------
-- 1. Colonies and seasons
-- ---------------------------------------------------------------------
drop index if exists public.gem_ledger_once;
create unique index if not exists gem_ledger_once on public.gem_ledger (user_id, reason, ref)
  where reason in ('achievement', 'quiz', 'era', 'colony', 'referral', 'invited');

create or replace function public.wallet_earn(p_reason text, p_ref text default '', p_amount integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  amt integer;
  max_total integer;
  max_today integer;
  max_week integer;
  n integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public.wallet_get(null);
  p_ref := coalesce(left(p_ref, 40), '');
  case p_reason
    when 'achievement' then amt := 10; max_total := 40;
    when 'quiz'        then amt := 3;  max_total := 70;
    when 'era'         then amt := 25; max_total := 6;
    when 'colony'      then amt := 100; max_total := 1000;
    when 'daily'       then amt := least(greatest(coalesce(p_amount, 0), 0), 20); max_today := 1;
    when 'vip_daily'   then amt := 10; max_today := 1;
    when 'minigame'    then amt := 2;  max_today := 10;
    when 'ad'          then amt := 5;  max_today := 5;
    when 'mission'     then amt := 5;  max_today := 3;
    when 'weekly'      then amt := 25; max_week := 1;
    else raise exception 'unknown_reason';
  end case;
  if p_reason = 'vip_daily' and not exists (select 1 from public.wallets where user_id = uid and vip_until > now()) then
    raise exception 'not_vip';
  end if;
  if max_total is not null then
    if exists (select 1 from public.gem_ledger where user_id = uid and reason = p_reason and ref = p_ref) then
      return public.wallet_row(uid);
    end if;
    select count(*) into n from public.gem_ledger where user_id = uid and reason = p_reason;
    if n >= max_total then raise exception 'limit_reached'; end if;
  elsif max_week is not null then
    select count(*) into n from public.gem_ledger
      where user_id = uid and reason = p_reason and created_at >= date_trunc('week', now());
    if n >= max_week then raise exception 'limit_reached'; end if;
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
revoke all on function public.wallet_earn(text, text, integer) from public, anon;
grant execute on function public.wallet_earn(text, text, integer) to authenticated;

-- Colonies add to the Tech Index without limit; seasons are calendar months (UTC), e.g. '2026-11'.
alter table public.leaderboard drop constraint if exists leaderboard_score_check;
alter table public.leaderboard add constraint leaderboard_score_check check (score between 0 and 1000000);
alter table public.leaderboard add column if not exists colonies smallint not null default 0 check (colonies between 0 and 10000);
alter table public.leaderboard add column if not exists season text check (season ~ '^\d{4}-\d{2}$');
alter table public.leaderboard add column if not exists season_gdp double precision not null default 0 check (season_gdp >= 0);
create index if not exists leaderboard_season on public.leaderboard (season, season_gdp desc);

create or replace function public.my_season_rank(p_season text)
returns integer language sql stable security definer set search_path = '' as $$
  select 1 + count(*)::integer from public.leaderboard
  where season = p_season
    and season_gdp > (select season_gdp from public.leaderboard where user_id = auth.uid() and season = p_season);
$$;
revoke all on function public.my_season_rank(text) from public, anon;
grant execute on function public.my_season_rank(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Push notifications (no account needed: a device id plus a secret)
-- ---------------------------------------------------------------------
create table if not exists public.push_devices (
  id uuid primary key,
  secret_hash text not null,
  subscription jsonb not null,
  lang text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.push_queue (
  device_id uuid not null references public.push_devices (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{1,20}$'),
  send_at timestamptz not null,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 200),
  primary key (device_id, kind)
);
create index if not exists push_queue_due on public.push_queue (send_at);
-- Only the functions below touch these tables.
alter table public.push_devices enable row level security;
alter table public.push_queue enable row level security;

create or replace function public.push_check(p_device uuid, p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.push_devices where id = p_device
                 and secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')) then
    raise exception 'unknown_device';
  end if;
end;
$$;
revoke all on function public.push_check(uuid, text) from public, anon, authenticated;

create or replace function public.push_register(p_device uuid, p_secret text, p_sub jsonb, p_lang text default 'en')
returns void language plpgsql security definer set search_path = '' as $$
declare h text := encode(extensions.digest(p_secret, 'sha256'), 'hex');
begin
  if char_length(coalesce(p_secret, '')) < 20 then raise exception 'bad_secret'; end if;
  if not (p_sub ? 'endpoint') or (p_sub ->> 'endpoint') !~ '^https://' or octet_length(p_sub::text) > 2000 then
    raise exception 'bad_subscription';
  end if;
  insert into public.push_devices (id, secret_hash, subscription, lang)
  values (p_device, h, p_sub, left(coalesce(p_lang, 'en'), 5))
  on conflict (id) do update set subscription = excluded.subscription, lang = excluded.lang, updated_at = now()
    where public.push_devices.secret_hash = h;
  if not found then raise exception 'unknown_device'; end if;
end;
$$;

-- Replaces the device's queue. p_items: [{"kind": "research", "at": 1730000000000, "title": "...", "body": "..."}]
create or replace function public.push_schedule(p_device uuid, p_secret text, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_check(p_device, p_secret);
  delete from public.push_queue where device_id = p_device;
  insert into public.push_queue (device_id, kind, send_at, title, body)
  select p_device, x ->> 'kind', to_timestamp((x ->> 'at')::double precision / 1000), left(x ->> 'title', 80), left(x ->> 'body', 200)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, i)
  where i <= 10
    and to_timestamp((x ->> 'at')::double precision / 1000) between now() and now() + interval '30 days'
  on conflict (device_id, kind) do nothing;
end;
$$;

create or replace function public.push_unregister(p_device uuid, p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_check(p_device, p_secret);
  delete from public.push_devices where id = p_device;
end;
$$;

revoke all on function public.push_register(uuid, text, jsonb, text) from public;
revoke all on function public.push_schedule(uuid, text, jsonb) from public;
revoke all on function public.push_unregister(uuid, text) from public;
grant execute on function public.push_register(uuid, text, jsonb, text) to anon, authenticated;
grant execute on function public.push_schedule(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.push_unregister(uuid, text) to anon, authenticated;

-- Used by the push-send Edge Function (service role only): takes due reminders off the queue.
create or replace function public.push_take_due(p_limit integer default 500)
returns table (device_id uuid, subscription jsonb, kind text, title text, body text)
language sql security definer set search_path = '' as $$
  with due as (
    delete from public.push_queue q
    where (q.device_id, q.kind) in (select device_id, kind from public.push_queue where send_at <= now() order by send_at limit p_limit)
    returning q.device_id, q.kind, q.title, q.body
  )
  select due.device_id, d.subscription, due.kind, due.title, due.body
  from due join public.push_devices d on d.id = due.device_id;
$$;
create or replace function public.push_forget(p_device uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_devices where id = p_device;
$$;
revoke all on function public.push_take_due(integer) from public, anon, authenticated;
revoke all on function public.push_forget(uuid) from public, anon, authenticated;
grant execute on function public.push_take_due(integer) to service_role;
grant execute on function public.push_forget(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 3. Invites
-- ---------------------------------------------------------------------
create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{6}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.referrals (
  invitee uuid primary key references auth.users (id) on delete cascade,
  inviter uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists referrals_inviter on public.referrals (inviter);
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;

-- Your invite code and how many friends joined with it.
create or replace function public.my_referral_code()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public.wallet_get(null);
  select code into c from public.referral_codes where user_id = uid;
  while c is null loop
    c := substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789abcdefghijklmnopqrstuvwxyz'), 1, 6);
    if c !~ '^[a-z0-9]{6}$' then c := null; continue; end if;
    begin
      insert into public.referral_codes (user_id, code) values (uid, c);
    exception when unique_violation then c := null;
    end;
  end loop;
  return jsonb_build_object('code', c, 'invites', (select count(*) from public.referrals where inviter = uid));
end;
$$;

-- A new player uses a friend's code once, within 14 days of creating the account.
create or replace function public.claim_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv uuid;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public.wallet_get(null);
  select user_id into inv from public.referral_codes where code = lower(p_code);
  if inv is null then raise exception 'unknown_code'; end if;
  if inv = uid then raise exception 'own_code'; end if;
  if (select created_at from auth.users where id = uid) < now() - interval '14 days' then raise exception 'too_late'; end if;
  insert into public.referrals (invitee, inviter) values (uid, inv) on conflict do nothing;
  if not found then raise exception 'already_claimed'; end if;
  insert into public.gem_ledger (user_id, kind, reason, ref, delta) values (uid, 'earn', 'invited', inv::text, 50);
  update public.wallets set gems = gems + 50, updated_at = now() where user_id = uid;
  if (select count(*) from public.referrals where inviter = inv) <= 20 and exists (select 1 from public.wallets where user_id = inv) then
    insert into public.gem_ledger (user_id, kind, reason, ref, delta) values (inv, 'earn', 'referral', uid::text, 50)
    on conflict do nothing;
    if found then update public.wallets set gems = gems + 50, updated_at = now() where user_id = inv; end if;
  end if;
  return public.wallet_row(uid);
end;
$$;
revoke all on function public.my_referral_code() from public, anon;
revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.my_referral_code() to authenticated;
grant execute on function public.claim_referral(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Send due reminders every 5 minutes (pg_cron + pg_net call the Edge Function).
--    The anon key is public (it already ships in the game).
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('push-send') where exists (select 1 from cron.job where jobname = 'push-send');
select cron.schedule('push-send', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://dygrvzxnfsozjaxlbcoz.supabase.co/functions/v1/push-send',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z3J2enhuZnNvempheGxiY296Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MTUyNzUsImV4cCI6MjEwOTM5MTI3NX0.cvmRUhZeNg2jLoRQSaAZZKHQJ-Ilhba6LOL09YkSQ_w"}'::jsonb,
    body := '{}'::jsonb
  );
$cron$);

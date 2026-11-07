-- Security hardening after the November 2026 audit. Safe to run more than once.
--   1. Push: subscriptions must point at a real browser push service, so the
--      push-send function cannot be used to send requests to arbitrary URLs.
--   2. Leaderboard: reject impossible scores and rapid-fire updates.
--   3. Statistics: at most 120 events per player per minute.
--   4. Statistics older than 12 months are deleted every night, as the privacy
--      policy promises (prune_events existed but was never scheduled).

-- 1. Push endpoints: Chrome/Android (FCM), Firefox (Mozilla), Safari/iOS (Apple), Edge/Windows (WNS).
create or replace function public.push_endpoint_ok(p_url text)
returns boolean language sql immutable set search_path = '' as $$
  select p_url ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/';
$$;

create or replace function public.push_register(p_device uuid, p_secret text, p_sub jsonb, p_lang text default 'en')
returns void language plpgsql security definer set search_path = '' as $$
declare h text := encode(extensions.digest(p_secret, 'sha256'), 'hex');
begin
  if char_length(coalesce(p_secret, '')) < 20 then raise exception 'bad_secret'; end if;
  if not (p_sub ? 'endpoint') or not public.push_endpoint_ok(p_sub ->> 'endpoint') or octet_length(p_sub::text) > 2000 then
    raise exception 'bad_subscription';
  end if;
  insert into public.push_devices (id, secret_hash, subscription, lang)
  values (p_device, h, p_sub, left(coalesce(p_lang, 'en'), 5))
  on conflict (id) do update set subscription = excluded.subscription, lang = excluded.lang, updated_at = now()
    where public.push_devices.secret_hash = h;
  if not found then raise exception 'unknown_device'; end if;
end;
$$;
revoke all on function public.push_register(uuid, text, jsonb, text) from public;
grant execute on function public.push_register(uuid, text, jsonb, text) to anon, authenticated;
-- Drop anything registered before this check existed that does not pass it.
delete from public.push_devices where not public.push_endpoint_ok(subscription ->> 'endpoint');

-- 2. Leaderboard plausibility. Scores are still reported by the game, so this
--    only stops impossible values; real anti-cheat needs server-side scoring.
create or replace function public.leaderboard_check()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Only players' own writes are checked; admin edits in the dashboard are not.
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.score > 720 + 60 * new.colonies + 1 then raise exception 'implausible_score'; end if;
  if new.season_gdp > new.lifetime_gdp * 1.0001 + 1 then raise exception 'implausible_season'; end if;
  if tg_op = 'UPDATE' then
    if new.colonies > old.colonies + 1 then raise exception 'implausible_colonies'; end if;
    if old.updated_at > now() - interval '20 seconds' then raise exception 'too_frequent'; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists leaderboard_check on public.leaderboard;
create trigger leaderboard_check before insert or update on public.leaderboard
  for each row execute function public.leaderboard_check();

-- 3. Statistics flood guard.
create or replace function public.events_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.events where anon_id = new.anon_id and created_at > now() - interval '1 minute') >= 120 then
    raise exception 'rate_limited';
  end if;
  return new;
end;
$$;
drop trigger if exists events_rate_limit on public.events;
create trigger events_rate_limit before insert on public.events
  for each row execute function public.events_rate_limit();

-- 4. Nightly clean-up of old statistics (03:17 UTC).
select cron.unschedule('prune-events') where exists (select 1 from cron.job where jobname = 'prune-events');
select cron.schedule('prune-events', '17 3 * * *', 'select public.prune_events()');

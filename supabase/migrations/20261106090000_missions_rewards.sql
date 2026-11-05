-- Missions: daily missions pay 5 gems (at most 3 a day), the weekly mission 25 gems (once a week).
-- Replaces wallet_earn with two new reasons; everything else is unchanged.
-- Free gems. The server decides the amount and enforces the limits.
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
    -- Already granted: nothing to do (safe to retry).
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

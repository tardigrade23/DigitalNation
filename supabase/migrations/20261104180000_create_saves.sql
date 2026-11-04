-- One cloud save per player.
create table public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  progress double precision not null default 0, -- lifetime GDP, used to compare saves between devices
  device text,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

create policy "Players read their own save"
  on public.saves for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Players create their own save"
  on public.saves for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Players update their own save"
  on public.saves for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Server sets the timestamp so device clocks do not matter.
create function public.touch_saves_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger saves_touch_updated_at
  before insert or update on public.saves
  for each row execute function public.touch_saves_updated_at();

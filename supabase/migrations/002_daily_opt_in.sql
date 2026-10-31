-- Daily opt in / opt out for the fixed morning court time.
-- Safe to run more than once.

create table if not exists public.day_rsvps (
  play_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('in', 'out')),
  updated_at timestamptz not null default now(),
  primary key (play_date, user_id)
);

alter table public.day_rsvps enable row level security;

drop policy if exists "rsvps read" on public.day_rsvps;
create policy "rsvps read" on public.day_rsvps for select to authenticated using (true);
drop policy if exists "rsvps insert own" on public.day_rsvps;
create policy "rsvps insert own" on public.day_rsvps for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "rsvps update own" on public.day_rsvps;
create policy "rsvps update own" on public.day_rsvps for update to authenticated using (auth.uid() = user_id);
drop policy if exists "rsvps delete own" on public.day_rsvps;
create policy "rsvps delete own" on public.day_rsvps for delete to authenticated using (auth.uid() = user_id);

alter table public.day_rsvps replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.day_rsvps; exception when duplicate_object then null; end;
end $$;

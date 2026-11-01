-- Phone notifications. Safe to run more than once.

-- Each device a member allows notifications on.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push read own" on public.push_subscriptions;
create policy "push read own" on public.push_subscriptions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "push insert own" on public.push_subscriptions;
create policy "push insert own" on public.push_subscriptions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "push update own" on public.push_subscriptions;
create policy "push update own" on public.push_subscriptions for update to authenticated using (auth.uid() = user_id);
drop policy if exists "push delete own" on public.push_subscriptions;
create policy "push delete own" on public.push_subscriptions for delete to authenticated using (auth.uid() = user_id);

-- Who has already been told they're on a full court for a day, so nobody gets the same alert twice.
-- Only the server (service key) reads and writes this table.
create table if not exists public.court_notices (
  play_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (play_date, user_id)
);
alter table public.court_notices enable row level security;

-- Notification signing keys, created automatically by the server on first use.
-- No policies: only the server (service key) can read it.
create table if not exists public.app_keys (
  name text primary key,
  value text not null
);
alter table public.app_keys enable row level security;

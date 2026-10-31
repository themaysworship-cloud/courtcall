-- Pickleball app schema. Paste this whole file into Supabase > SQL Editor and run it once.

-- ---------- Profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  avatar_url text,
  skill_level text,
  bio text,
  created_at timestamptz not null default now()
);

-- Create a profile row automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Court sessions (a court time on a given day) ----------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  play_date date not null,
  start_time time not null,
  end_time time,
  location text not null default '',
  capacity int not null default 8 check (capacity > 0),
  notes text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists sessions_play_date_idx on public.sessions (play_date);

-- ---------- Signups ----------
create table if not exists public.signups (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- Block signups once a session is full (anyone past capacity is rejected).
create or replace function public.check_capacity()
returns trigger language plpgsql as $$
declare cap int; taken int;
begin
  select capacity into cap from public.sessions where id = new.session_id;
  select count(*) into taken from public.signups where session_id = new.session_id;
  if taken >= cap then
    raise exception 'This court time is full';
  end if;
  return new;
end;
$$;

drop trigger if exists signups_capacity on public.signups;
create trigger signups_capacity
  before insert on public.signups
  for each row execute function public.check_capacity();

-- ---------- Messages ----------
-- room is 'general' for the group chat, or a session id for that court time's chat.
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  room text not null default 'general',
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_room_idx on public.messages (room, created_at);

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.signups  enable row level security;
alter table public.messages enable row level security;

-- Members (signed-in users) can see everyone; they can only change their own rows.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "sessions read" on public.sessions;
create policy "sessions read" on public.sessions for select to authenticated using (true);
drop policy if exists "sessions insert" on public.sessions;
create policy "sessions insert" on public.sessions for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "sessions update own" on public.sessions;
create policy "sessions update own" on public.sessions for update to authenticated using (auth.uid() = created_by);
drop policy if exists "sessions delete own" on public.sessions;
create policy "sessions delete own" on public.sessions for delete to authenticated using (auth.uid() = created_by);

drop policy if exists "signups read" on public.signups;
create policy "signups read" on public.signups for select to authenticated using (true);
drop policy if exists "signups insert own" on public.signups;
create policy "signups insert own" on public.signups for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "signups delete own" on public.signups;
create policy "signups delete own" on public.signups for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select to authenticated using (true);
drop policy if exists "messages insert own" on public.messages;
create policy "messages insert own" on public.messages for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "messages delete own" on public.messages;
create policy "messages delete own" on public.messages for delete to authenticated using (auth.uid() = user_id);

-- ---------- Live updates ----------
do $$
begin
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.signups;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.sessions; exception when duplicate_object then null; end;
end $$;
-- Needed so signup removals reach other members live.
alter table public.signups replica identity full;

-- ---------- Profile photo storage ----------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects for select using (bucket_id = 'avatars');
-- Each user uploads into a folder named after their user id.
drop policy if exists "avatars upload own" on storage.objects;
create policy "avatars upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

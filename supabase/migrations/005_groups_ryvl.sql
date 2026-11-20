-- Groups (each with its own courts, chat and members, joined by invite link) and RYVL sign-up.
-- Safe to run more than once. Everyone already in the app becomes a member of "The Ballers".

-- ---------- Groups ----------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null check (char_length(name) between 1 and 60),
  invite_code text unique,
  has_ryvl boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

-- People who can create groups (see the README for the one line that adds you).
create table if not exists public.app_owners (
  user_id uuid primary key references public.profiles(id) on delete cascade
);

-- Six letters/numbers that are easy to read out loud (no 0/O or 1/I/L).
create or replace function public.new_invite_code()
returns text language plpgsql volatile as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  return code;
end;
$$;
alter table public.groups alter column invite_code set default public.new_invite_code();
update public.groups set invite_code = public.new_invite_code() where invite_code is null;
alter table public.groups alter column invite_code set not null;

-- The first group: everyone who is already using the app.
do $$
begin
  if not exists (select 1 from public.groups where slug = 'ballers') then
    insert into public.groups (slug, name, has_ryvl) values ('ballers', 'The Ballers', true);
    insert into public.group_members (group_id, user_id)
      select g.id, p.id from public.groups g cross join public.profiles p where g.slug = 'ballers'
      on conflict do nothing;
  end if;
end $$;

-- ---------- Helpers used by the access rules ----------
create or replace function public.ballers_group_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.groups where slug = 'ballers'
$$;

create or replace function public.is_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid())
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_owners where user_id = auth.uid())
$$;

create or replace function public.shares_group(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- Join a group with its invite code. Returns the group's id.
create or replace function public.join_group(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select id into gid from public.groups
    where invite_code = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  if gid is null then raise exception 'That invite code didn''t work. Check it and try again.'; end if;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end;
$$;

-- Only app owners can make a new group. The owner joins it automatically.
create or replace function public.create_group(group_name text, ryvl boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if not public.is_owner() then raise exception 'Only the app owner can create groups'; end if;
  insert into public.groups (name, has_ryvl, created_by)
    values (trim(group_name), coalesce(ryvl, false), auth.uid())
    returning id into gid;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end;
$$;

grant execute on function public.join_group(text) to authenticated;
grant execute on function public.create_group(text, boolean) to authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.app_owners enable row level security;

drop policy if exists "groups read" on public.groups;
create policy "groups read" on public.groups for select to authenticated
  using (public.is_member(id) or public.is_owner());
drop policy if exists "groups update owner" on public.groups;
create policy "groups update owner" on public.groups for update to authenticated using (public.is_owner());

drop policy if exists "group members read" on public.group_members;
create policy "group members read" on public.group_members for select to authenticated
  using (public.is_member(group_id) or public.is_owner());
drop policy if exists "group members leave" on public.group_members;
create policy "group members leave" on public.group_members for delete to authenticated
  using (auth.uid() = user_id or public.is_owner());

drop policy if exists "owners read own" on public.app_owners;
create policy "owners read own" on public.app_owners for select to authenticated using (auth.uid() = user_id);

-- ---------- Profiles: only people who share a group can see each other ----------
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (auth.uid() = id or public.shares_group(id) or public.is_owner());

-- ---------- Court In/Out per group ----------
alter table public.day_rsvps add column if not exists group_id uuid references public.groups(id) on delete cascade;
update public.day_rsvps set group_id = public.ballers_group_id() where group_id is null;
alter table public.day_rsvps alter column group_id set default public.ballers_group_id();
alter table public.day_rsvps alter column group_id set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.day_rsvps'::regclass and contype = 'p'
      and pg_get_constraintdef(oid) like '%group_id%'
  ) then
    alter table public.day_rsvps drop constraint if exists day_rsvps_pkey;
    alter table public.day_rsvps add constraint day_rsvps_pkey primary key (group_id, play_date, user_id);
  end if;
end $$;

drop policy if exists "rsvps read" on public.day_rsvps;
create policy "rsvps read" on public.day_rsvps for select to authenticated using (public.is_member(group_id));
drop policy if exists "rsvps insert own" on public.day_rsvps;
create policy "rsvps insert own" on public.day_rsvps for insert to authenticated
  with check (auth.uid() = user_id and public.is_member(group_id));
drop policy if exists "rsvps update own" on public.day_rsvps;
create policy "rsvps update own" on public.day_rsvps for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id and public.is_member(group_id));
drop policy if exists "rsvps delete own" on public.day_rsvps;
create policy "rsvps delete own" on public.day_rsvps for delete to authenticated using (auth.uid() = user_id);

-- Full-court alert bookkeeping, per group (server only).
alter table public.court_notices add column if not exists group_id uuid references public.groups(id) on delete cascade;
update public.court_notices set group_id = public.ballers_group_id() where group_id is null;
alter table public.court_notices alter column group_id set default public.ballers_group_id();
alter table public.court_notices alter column group_id set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.court_notices'::regclass and contype = 'p'
      and pg_get_constraintdef(oid) like '%group_id%'
  ) then
    alter table public.court_notices drop constraint if exists court_notices_pkey;
    alter table public.court_notices add constraint court_notices_pkey primary key (group_id, play_date, user_id);
  end if;
end $$;

-- ---------- Chat per group ----------
alter table public.messages add column if not exists group_id uuid references public.groups(id) on delete cascade;
update public.messages set group_id = public.ballers_group_id() where group_id is null;
alter table public.messages alter column group_id set default public.ballers_group_id();
alter table public.messages alter column group_id set not null;
create index if not exists messages_group_room_idx on public.messages (group_id, room, created_at);

drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select to authenticated using (public.is_member(group_id));
drop policy if exists "messages insert own" on public.messages;
create policy "messages insert own" on public.messages for insert to authenticated
  with check (auth.uid() = user_id and public.is_member(group_id));

drop policy if exists "reactions read" on public.message_reactions;
create policy "reactions read" on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));
drop policy if exists "reactions insert own" on public.message_reactions;
create policy "reactions insert own" on public.message_reactions for insert to authenticated
  with check (auth.uid() = user_id and exists (select 1 from public.messages m where m.id = message_id));

-- ---------- RYVL sign-up (3.0-3.5 and 3.5-4.0) ----------
create table if not exists public.ryvl_signups (
  group_id uuid not null references public.groups(id) on delete cascade,
  play_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  level text not null check (level in ('3.0-3.5', '3.5-4.0')),
  updated_at timestamptz not null default now(),
  primary key (group_id, play_date, user_id)
);

-- Checks the player's skill level fits, and uses the server's clock for first come, first served.
create or replace function public.ryvl_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare skill text; ryvl boolean;
begin
  select has_ryvl into ryvl from public.groups where id = new.group_id;
  if not coalesce(ryvl, false) then raise exception 'This group doesn''t have RYVL sign-up'; end if;
  select skill_level into skill from public.profiles where id = new.user_id;
  if skill is null then raise exception 'Add your skill level on the Me tab first'; end if;
  if not ((new.level = '3.0-3.5' and skill in ('3.0', '3.5')) or (new.level = '3.5-4.0' and skill in ('3.5', '4.0'))) then
    raise exception 'Your skill level (%) doesn''t fit RYVL %', skill, new.level;
  end if;
  if tg_op = 'INSERT' or new.level is distinct from old.level then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
drop trigger if exists ryvl_signups_check on public.ryvl_signups;
create trigger ryvl_signups_check before insert or update on public.ryvl_signups
  for each row execute function public.ryvl_check();

alter table public.ryvl_signups enable row level security;
drop policy if exists "ryvl read" on public.ryvl_signups;
create policy "ryvl read" on public.ryvl_signups for select to authenticated using (public.is_member(group_id));
drop policy if exists "ryvl insert own" on public.ryvl_signups;
create policy "ryvl insert own" on public.ryvl_signups for insert to authenticated
  with check (auth.uid() = user_id and public.is_member(group_id));
drop policy if exists "ryvl update own" on public.ryvl_signups;
create policy "ryvl update own" on public.ryvl_signups for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id and public.is_member(group_id));
drop policy if exists "ryvl delete own" on public.ryvl_signups;
create policy "ryvl delete own" on public.ryvl_signups for delete to authenticated using (auth.uid() = user_id);

alter table public.ryvl_signups replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.ryvl_signups; exception when duplicate_object then null; end;
end $$;

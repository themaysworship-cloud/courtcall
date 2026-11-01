-- Chat notifications, reactions, photos, and fair first-come-first-served times. Safe to run more than once.

-- Chat alerts on/off per member (on by default).
alter table public.profiles add column if not exists chat_alerts boolean not null default true;

-- Photos in chat: a message can be a photo, text, or both.
alter table public.messages add column if not exists image_url text;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_body_or_image;
alter table public.messages add constraint messages_body_or_image
  check (char_length(body) <= 2000 and (char_length(body) > 0 or image_url is not null));

insert into storage.buckets (id, name, public)
values ('chat', 'chat', true)
on conflict (id) do nothing;
drop policy if exists "chat photos read" on storage.objects;
create policy "chat photos read" on storage.objects for select using (bucket_id = 'chat');
drop policy if exists "chat photos upload own" on storage.objects;
create policy "chat photos upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and (storage.foldername(name))[1] = auth.uid()::text);

-- Emoji reactions on messages.
create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.message_reactions enable row level security;
drop policy if exists "reactions read" on public.message_reactions;
create policy "reactions read" on public.message_reactions for select to authenticated using (true);
drop policy if exists "reactions insert own" on public.message_reactions;
create policy "reactions insert own" on public.message_reactions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "reactions delete own" on public.message_reactions;
create policy "reactions delete own" on public.message_reactions for delete to authenticated using (auth.uid() = user_id);
alter table public.message_reactions replica identity full;
alter table public.messages replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.message_reactions; exception when duplicate_object then null; end;
end $$;

-- First come, first served uses the server's clock, not each phone's clock.
-- The time only changes when someone actually switches between In and Out.
create or replace function public.rsvp_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
drop trigger if exists day_rsvps_stamp on public.day_rsvps;
create trigger day_rsvps_stamp before insert or update on public.day_rsvps
  for each row execute function public.rsvp_stamp();

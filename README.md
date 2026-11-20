# Court Call: pickleball court signups and group chat

A phone-friendly web app for a pickleball group:

- **Courts**: Monday through Saturday, the 5–7am court time. Tap **In** or **Out** for each day and see how many are playing, who is out, and who has not answered. Change the time in `lib/config.ts`.
- **Chat**: a live group chat, plus a separate chat for each court time.
- **Members**: everyone's photo, name, skill level and cell number, with one tap to text or call.
- **Profile**: upload a profile photo and edit your details.

Members add it to their home screen (Share → Add to Home Screen on iPhone, menu → Install app on Android) and it opens like a normal app.

## Stack

Next.js 15 (React) for the app, Supabase for sign-in, the Postgres database, photo storage and live updates.

## Setup (about 10 minutes)

1. Create a free project at [supabase.com](https://supabase.com).
2. In Supabase, open **SQL Editor**, paste all of `supabase/schema.sql`, and run it.
3. In **Project Settings → API**, copy the Project URL and the `anon` public key.
4. Copy `.env.example` to `.env.local` and fill in those two values.
5. `npm install` then `npm run dev`, and open http://localhost:3000.

Optional: in **Authentication → Providers → Email**, turn off "Confirm email" if you want people to be able to sign in right after creating an account.

## Deploy

Import this repo at [vercel.com](https://vercel.com) (Add New → Project), open the Environment Variables section on the Configure Project screen, add the same two variables, and click Deploy. Every push to `main` redeploys automatically; if you change a variable later, redeploy from the Deployments tab. Then add the Vercel URL under Supabase **Authentication → URL Configuration → Site URL**.

## Groups and RYVL (migration 005)

Run `supabase/migrations/005_groups_ryvl.sql` in the Supabase SQL Editor. It's safe to run more than once.
Everyone already in the app is put into the first group, **The Ballers**, and all existing courts and chat move into it.

Only app owners can create groups. To make yourself an owner, run this once (use the email you sign in to Court Call with):

```sql
insert into public.app_owners (user_id)
select id from auth.users where email = 'you@example.com'
on conflict do nothing;
```

- Each group has its own courts (Mon to Sat, 5–7am), chat and member list. People only see groups they've joined.
- Invite links look like `/join/ABC123`. The 6-letter code is also shown on the install screen, because an app added to the home screen on iPhone doesn't share the browser's data, so it may ask for the code once.
- Someone signed in but in no group sees a "Join a group" screen that asks for the code.
- RYVL games (5–7am, Springs East Pickleball) show as a RYVL tab in groups with RYVL turned on. Players pick 3.0–3.5 or 3.5–4.0, and only if their profile skill level fits (3.0/3.5 for the first, 3.5/4.0 for the second). Courts hold 4. When 4 are on the waitlist, another court opens.

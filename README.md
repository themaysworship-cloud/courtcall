# Court Call: pickleball court signups and group chat

A phone-friendly web app for a pickleball group:

- **Courts**: a Sunday to Sunday week of court times. Tap "I'm in" to sign up, see who's coming and how many spots are left, and post new court times.
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

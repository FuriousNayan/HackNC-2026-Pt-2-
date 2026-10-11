# Running on Supabase (persistent mode)

Default is still in memory. Persistent mode keeps handles, cases, messages, judge turns, votes, verdicts, history and the leaderboard in Supabase Postgres, so a restart no longer wipes them.

## Setup (needs your Supabase project)

1. Run `supabase/migrations/0005_engine_store.sql` in the Supabase SQL editor, or locally: put `DATABASE_URL` in `.env.local` and run `npm run db:migrate` (safe to re-run). It creates 10 `hj_` tables and a case number sequence. It does not need migrations 0001 to 0004.
2. In `.env.local` set `HJ_STORE=postgres` and `DATABASE_URL` (Project Settings, Database, Connection string, the Session pooler string).
3. `npm run build && npm start` (or `npm run dev`). Use `USE_STUB_JUDGE=true` to try it without Gemini.

Optional: `HJ_PG_POOL` (connections, default 5), `HJ_PG_SSL=false` for a local database.

## Design

- Each table holds the engine's record as JSON in `data`, with the filter columns generated from it. They match `CaseStore` in `src/server/store.ts` one to one, so the engine did not change.
- RLS is on with no policies. The anon key and browsers cannot read or write these tables. Only the server, through `DATABASE_URL`, can.
- Security note: `hj_profiles.data` holds each handle's session token. Treat `DATABASE_URL` like the service role key.

## What was tested

The same store contract tests run against the in-memory store and a real Postgres (PGlite). All 13 engine tests (full trial, silence, three safety paths, stale judge result, walk-out, access rules, rate limits, redaction) pass on both. The built server also played a full trial over the real `pg` driver against a Postgres socket, and handles survived a server restart. Not tested: a hosted Supabase project (no credentials available here).

## Limits

- Timers, presence, rate limits and the realtime bus are still in the server process. After a restart, trials that were live are closed without a ruling (verdicts already given stay and stay shareable). Run one server process. A second process would have separate timers and SSE clients.
- Realtime is still SSE, so host on a long-running server (Fly, Railway, Render, a VM), not serverless Vercel.
- Auth is still handle plus secret cookie. Moving to Supabase Auth (Google, anonymous) means replacing `authenticate` in `src/server/auth.ts` and mapping users to handles. The zip's `src/server/supabase/auth.ts` is the starting point.
- Avatar and audio storage still use the Part 4 adapters and need a Supabase Storage adapter plus Vision moderation (separate item).

## Photo avatars (storage and moderation)

Nothing to wire in code. `src/media/storage.ts` and `moderation.ts` switch on when these are in `.env.local`:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MEDIA_BUCKET` and `GOOGLE_VISION_API_KEY`.
`npm run db:migrate` creates the private bucket (migration 0003). `npm run preflight` reports the bucket and the
Vision key as optional checks. If any is missing, `/api/avatar` answers 503 and the picker tells the person to choose
a preset, so the app still works. Uploads store only the 256px cropped head, re-encoded and checked by SafeSearch
and face detection before anything is saved.

## Supabase Auth (optional, off by default)

Set `HJ_AUTH=supabase` and `NEXT_PUBLIC_HJ_AUTH=supabase`, and enable Anonymous (and Google) sign in in the dashboard.
Signing in with a handle then needs a Supabase session. The server verifies the token with Supabase
(`/auth/v1/user`), binds the handle to that Supabase user, and still issues the usual `hj_session` cookie, so
realtime and every other route are unchanged. One person owns one handle, and the same person gets it back on another
device. Handles claimed before turning this on can only be bound by whoever holds their cookie. Server logic and
binding rules are tested with a fake Supabase endpoint; the real Google and anonymous flows must be tried on your
deployment because this sandbox cannot reach Supabase.

## Live video for the two arguers (optional, off by default)

Uses LiveKit Cloud (free tier is enough). Create a project at livekit.io and copy its URL (wss://...), API key and
API secret into `.env.local`: `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Then set
`HJ_VIDEO=livekit` and `NEXT_PUBLIC_HJ_VIDEO=livekit` and rebuild (the public flag is baked in at build time).

How it behaves:
- Only the plaintiff and defendant get a video token (`POST /api/cases/:id/video`). The jury and everyone else get a 404, so spectators only see bobbleheads.
- Each person's camera starts only when they press "Turn on my camera". Video only, no microphone, so nothing talks over the judge.
- Tokens last 15 minutes. When a case is closed for safety, or auto-closes after the verdict, the server deletes the LiveKit room, and the page cuts the camera when the case ends.
- If keys are missing or LiveKit is unreachable, the panel shows a short message and the trial carries on normally.

Tested here: token signing and grants, who may get a token, room deletion call, and the panel appearing only for arguers in a real browser. Not tested here (the sandbox cannot reach LiveKit): an actual video stream between two devices, so try it on two devices before the demo. Live video cannot be moderated by the judge or the safety layer; the report button and the safety close still end the case and cut the room.

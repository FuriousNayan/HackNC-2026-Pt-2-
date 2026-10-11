# Combined repo: what was merged and what was found

Sources: our repo (Part 1 UI, Part 2 in-memory engine, Parts 3 and 4) and `backend.zip` (a Supabase based Part 2 with the same Part 3 and 4 code).

## What is where

- Active backend: `src/server/*` (in-memory engine, timers, SSE) with the full UI. Runs with no Supabase.
- Supabase assets from the zip, kept but not yet active:
  - `supabase/migrations/0001` to `0004`: schema, RLS, storage bucket, cross-exam state.
  - `src/server/supabase/{client,auth,broadcast}.ts`: service client, Supabase session auth, Realtime broadcast.
  - `scripts/seed.ts`, `scripts/dbCheck.ts`, `src/ui/JudgeBench.tsx` (page at `/dev/judge`).
  - `reference/supabase-engine/`: the zip's `caseEngine.ts`, routes, `mediaBootstrap.ts`, `instrumentation.ts`. Excluded from the build. Reference only.
- Contracts: the zip's versions (adds `DEMO`, `SAFETY_COPY`, `ToneBand`, `SPACING_TOKENS`, `api.ts`) plus our `RecordedEvent` and `AvatarPickerProps`.
- Judge, media, safety and integration code was byte for byte identical in both. The styled `AvatarPicker` from our repo was kept.
- The zip's `.env.local` was not copied (it may hold real keys; do not commit it).

## Errors found while combining (all fixed)

1. The zip's `contracts/types.ts` dropped `RecordedEvent`, which broke 3 Part 1 files. Re-added.
2. Typescript 7 breaks ESLint. Pinned to `^5`; type check still passes.
3. `JudgeBench` needs props the new page did not pass. Fixed in `/dev/judge`.

## Checks on the combined repo

Type check clean. 158 Vitest tests and 19 media tests pass. Production build passes. A three browser run (sign in, file, summons, full trial, verdict) passes. `npm run lint` reports 29 errors and 10 warnings, mostly the new `react-hooks/set-state-in-effect` rule in Part 1 pages. These are style rules, not runtime bugs, and are not fixed.

## Problems in the zip's Supabase backend (why its engine was not made the active one)

1. No turn control: any arguer can post at any time, twice. The in-memory engine closes a turn when its message is accepted.
2. Only the verdict has a timer, and it is a `setTimeout`. Statement, cross, rebuttal and closing timers, silence handling and walk-out default judgment do not exist. The verdict timer is lost on a restart or a serverless cold stop.
3. No locking, so two requests can call the judge twice or commit a stale judge result after a safety close.
4. Realtime broadcasts on a public channel `case:{id}`. Anyone with the anon key can subscribe to any case, including private and safety-closed ones, because Realtime Authorization is not set up. No snapshot for late joiners either, and each event opens and closes a channel (slow, can reorder).
5. Missing routes: `/api/session`, `/api/cases/:id` (view), `decline`, the events stream.
6. `start` marks the case live before checking presence properly (participant rows only) and the filing flow looks up groups by the filer only (`group_members` join), so the same pair can end up in several groups.
7. No handling of a held message: the message that trips the filter is not kept for the arguers.

## Supabase persistence (added after the merge)

See `docs/team/SUPABASE.md`. Short version: `supabase/migrations/0005_engine_store.sql` plus `PostgresStore` let the engine run on Supabase Postgres with `HJ_STORE=postgres`. The zip's 0001 to 0004 tables stay untouched for a later move to Supabase Auth.

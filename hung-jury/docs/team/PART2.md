# Part 2: Backend (in memory)

No database. Everything lives in one Node process and is lost on restart. All code is in `src/server/`, routes are in `src/app/api/`.

## Run it

```
cp .env.example .env.local
# set NEXT_PUBLIC_USE_MOCKS=false, USE_STUB_JUDGE=true (no keys needed), HJ_TIMER_SCALE=0.05 for a fast demo
npm run dev
node scripts/smoke.mjs http://localhost:3000   # files a case and plays a whole trial over SSE
npx vitest run src/server                      # engine and route tests
```

Real judge and voice: set `USE_STUB_JUDGE=false`, `DEMO_MODE=false`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`.

## Env vars

| Var | Default | Meaning |
|---|---|---|
| `USE_STUB_JUDGE` | unset | `true` uses the scripted judge and no voice (`audioUrl` is null) |
| `HJ_TIMER_SCALE` | 1 | multiplies every `CONFIG.timers` value |
| `HJ_CROSS_QUESTIONS` | 1 | cross examination questions per side, 0 to 2 |
| `HJ_SEED_DEMO` | false | seeds group `the-kitchen` and cases HJ-0022, HJ-0023 (next is HJ-0024) |
| `APP_ORIGIN` | request origin | used by the same-origin check on writes |

## Auth

`POST /api/session { handle, avatar? }` claims a handle and sets an HttpOnly cookie `hj_session`. Re-posting the same handle with the cookie reclaims it. A taken handle returns 409. `Authorization: Bearer <handle>.<token>` also works. EventSource cannot send headers, which is why a cookie is used.

## Routes

| Route | Who | Does |
|---|---|---|
| `POST /api/cases` | any | files a case (title, grievance, defendantHandle, sentenceRequest?) |
| `GET /api/cases/:id` | arguers, or anyone if listed | case view with seats, presence, jurors, jury %, `you.role` |
| `POST /api/cases/:id/accept` `decline` | defendant | |
| `POST /api/cases/:id/start` | plaintiff | needs both arguers connected |
| `POST /api/cases/:id/message` `{text, clientId?}` | the active arguer | one message per turn, `clientId` makes retries idempotent |
| `POST /api/cases/:id/join` | any, listed cases | takes a jury seat |
| `POST /api/cases/:id/vote` `{vote}` | jurors | `guilty` or `not_guilty`, only while live |
| `POST /api/cases/:id/react` `{kind}` | anyone who can see it | 1 per cooldown |
| `POST /api/cases/:id/report` `{reason}` | anyone who can see it | 3 distinct reporters or 1 arguer closes the case |
| `GET /api/cases/:id/events` | same as view | SSE stream of `RoomEvent`s |
| `GET /api/docket` | any | listed cases |
| `GET /api/groups/:id/history` `leaderboard` | group members | memory backed |

Errors are `{ error, code }` with 400, 401, 403, 404, 409, 413, 422 (filing blocked by safety) or 429.

## Realtime

SSE. A new connection first gets a snapshot (state, messages, last judge turn, jury). Each frame has `id: <seq>` and `data: <RoomEvent>`. A dropped connection resumes with `Last-Event-ID` and gets only the missed frames, or a fresh snapshot if too many were missed. Heartbeat every 15 s. `useRoom` now uses this by default through `src/ui/room/sseTransport.ts`.

## Trial and timers

The server owns every timer. Order: opening, statements (plaintiff then defendant), cross (question then answer, per side), rebuttal, closing (no judge call), verdict, then a 15 s vote countdown. A speaker who runs out the clock gets a bracketed silence note and the trial moves on. An arguer gone for 30 s loses by default. That ruling is written by the server, never by the judge, and is excluded from memory and the leaderboard. A per case lock plus an epoch guard means a slow judge reply can never be broadcast after a safety close, a default judgment or a step change.

## Safety

Pre-filter on filing and messages, judge `safety_flag`, and reports. A safety close shows only fixed copy, keeps the held message hidden (arguers only), closes spectator streams, writes no verdict and removes the case from docket, card and leaderboard. Votes and reactions never reach the judge input (tested).

## Decisions and limits to know about

1. In memory, single process. A restart wipes cases and frees every handle. The `CaseStore` interface in `store.ts` is the seam for a database later.
2. A case is listed in the docket when accepted, not when both arguers are present.
3. Card access is decided by case state alone (public, finished, not safety closed), because the media adapter gets no request.
4. The contracts have no event for an arguer disconnecting, so the room cannot grey out a bobblehead. Presence is in `GET /api/cases/:id` (`present`). Adding a presence `RoomEvent` is a Part 1 plus contracts change.
5. `sentenceRequest` is stored and shown, but the judge input has no field for it yet.
6. Filing text that trips safety returns 422 and creates no case.
7. Cross examination is 1 question per side by default to keep trials short.

## UI wiring (done)

Home, summons, waiting and case pages use the live API when `NEXT_PUBLIC_USE_MOCKS=false`: `useCaseView` polls `GET /api/cases/:id` (it doubles as presence), the case page seats non-arguers on the jury with `api.join`, and a missing arguer greys out their bobblehead. `/api/docket` is public. `scripts/e2e-browser.mjs` drove three real browsers through sign-in, filing, summons, a full trial and the verdict panel.

Not done: Supabase (database, storage, auth, realtime), and the real Gemini and ElevenLabs path was never run with keys.

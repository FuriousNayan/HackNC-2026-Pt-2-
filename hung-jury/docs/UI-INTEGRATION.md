# Part 1 integration notes (UI)

## What is connected

| Part | Piece | UI connection |
| --- | --- | --- |
| 4 | `src/components/AvatarPicker` | `/avatar` page. Restyled to the Lovable look, same props (`defaultKind`, `onDone`). Presets work with no server. Picture and webcam post a cropped head to `/api/avatar`. |
| 4 | `/api/avatar`, `/api/tts` | Kept as delivered. Both import `@/server/media-bootstrap`. |
| 4 | `verdictCardPng` | New route `GET /api/cases/:id/card?format=portrait\|square` (PNG). The verdict popup's Share button fetches it and shares the image when the browser allows files. Falls back to text share, then clipboard. |
| 3 + 4 | `judgeTurnWithMedia` event | Needs no UI change. `turn.event` is a normal `judge` RoomEvent. `audioUrl` plays through `useJudgeAudio`; null falls back to browser speech. Subtitles are always on. |
| 3 | judge, safety, memory | Server only. The UI never imports them. |

## Mock mode bootstrap

`src/server/media-bootstrap.ts` only does anything when `NEXT_PUBLIC_USE_MOCKS=true`. It gives the media routes an in-memory store, treats everyone as one guest, skips photo moderation and returns a fake oat milk verdict for the card route. Outside mock mode it configures nothing, so every media route denies the request (their default). Part 2 replaces it.

## Contracts

`src/contracts/` is the team's version (Parts 3 + 4) plus one Part 1 type, `RecordedEvent`. `TOKENS` is camelCase there (`TOKENS.brass500`); Part 1 code was updated to match. `toneColor` lives in `helpers.ts` and returns lowercase hex.

## Versions

Aligned to the Parts 3 + 4 package: Next 16.4.0, React 19.3.0, TypeScript 7.0.2, Node 22.9 or newer. TypeScript 7 removed `baseUrl`, so tsconfig is theirs.

## Not connected yet (no Part 2 code received)

Auth and the real `authorize`, case and docket routes, phase timers, realtime broadcast, persistence of avatars, the real `loadVerdict`, and the arguer arrival and disconnect events.

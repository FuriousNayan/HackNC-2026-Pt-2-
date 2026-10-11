# Parts 3 + 4: backend handoff

This ZIP contains the combined judge and media/safety source, one canonical contract set, locked dependencies, and tests. Start here. Preserve your existing backend state machine, database, auth, realtime events, and UI.

## 1. Merge the source

Copy `src/judge/`, `src/media/`, `src/safety/`, `src/integration/`, `prompts/`, and `fixtures/`. Merge `src/contracts/` with the team's canonical contracts, including the documented optional `parties` and `turnKind` fields and Part 4 card/runtime types. Import aliases use `@/*` mapped to `src/*` as shown in tsconfig.json. `prompts/system.txt` must be present relative to the server process working directory; include it in deployment assets or adapt prompt.ts for your host.

Merge these dependencies into your package.json: `@google/genai`, `zod`, `@supabase/supabase-js`, `sharp`, `server-only`. AvatarPicker also needs `@mediapipe/tasks-vision`, React, and its CSS. Copy `src/components/AvatarPicker/` to the UI teammate's component tree if needed. Use the versions in this package.json; do not overwrite your existing package file, lockfile, pages or routes wholesale.

The current page and `/api/dev/judge` are optional local tools. `/api/avatar` and `/api/tts` are included as protected route implementations. Merge them with your routes and import your own server bootstrap in each route bundle before use. They deny access until `configureMedia({ authorize })` is supplied. Do not add an unconditional allow.

## 2. Set private configuration

Use `.env.example` as the variable list. The ZIP intentionally contains no `.env.local`, API keys, original ZIP credentials, cached private media, dependencies, build output or Git history. Set your own Gemini, ElevenLabs, storage and moderation credentials privately. No secret may use a NEXT_PUBLIC_ name. `NEXT_PUBLIC_SUPABASE_URL` is a public service URL, not a key.

- Gemini needs GEMINI_API_KEY and GEMINI_MODEL.
- Live voice needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID. Models default to Flash v2.5 for quick speech and Multilingual v2 for verdicts.
- Default private storage needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_MEDIA_BUCKET; create the bucket first. Alternatively supply your existing MediaStorage adapter.
- Photo moderation needs GOOGLE_VISION_API_KEY with Cloud Vision enabled, or `moderateImage` adapter. Without this, uploads fail closed; preset avatars still work.
- Set APP_ORIGIN to the public website origin when your proxy changes request URLs. Requests without an Origin still require backend authorization.
- DEMO_MODE is shared: true means scripted judging and cached-only audio. For live provider tests/pregeneration use false.

## 3. Initialize adapters in every server bundle

```ts
import { configureMedia } from '@/media';
configureMedia({
  authorize: yourAuthorizedMediaRequest,
  loadVerdict: yourAuthorizedFinalVerdictLoader,
  // storage: yourExistingPrivateMediaStorage,
  // moderateImage: yourExistingImageModerator,
});
```

These names represent your implementations, not functions supplied by this package. `authorize(request, 'avatar' | 'tts', speech?)` must authenticate, apply per-user limits, and deny unauthorized content. For TTS, the optional third argument is the already bounded and validated `{ text, toneDial, kind }` payload. Check that this exact speech belongs to an authorized persisted judge turn; ordinary session authentication alone would allow arbitrary voice generation. Do not read/clone the consumed TTS request body. For avatar authorization this argument is undefined; use the request's session/cookies and apply upload limits. Existing two-argument callbacks remain type-compatible, but must use this context to verify replay ownership. The card loader must enforce caller access and return fresh safety status plus finalized VerdictCardData. Card rendering is a server helper; add your own authenticated card route if required.

## 4. Filter before saving or broadcasting user text

```ts
import { prepareText } from '@/integration';
const prepared = prepareText(rawMessageText);
if (!prepared.ok) {
  await yourPrivateSafetyClosure(caseId);
  return;
}
// Persist and broadcast prepared.text, never rawMessageText.
```

Apply to filing title/grievance and every statement/answer/closing. This helper runs Part 4's preFilter before redaction. Enforce authentication, group membership, role/phase and length limits first. Retain the report flow and contextual judge safety review; heuristic filters do not detect every danger or every PII format.

## 5. Prepare a judge event with optional audio

```ts
import { judgeTurnWithMedia } from '@/integration';
const turn = await judgeTurnWithMedia(input, {
  isNewArguerMessage: true, // false for opening, a question, verdict, or an already scored message
});
if (turn.kind === 'safety') {
  await yourPrivateSafetyClosure(caseId);
  return;
}
// Before saving/broadcasting, recheck the case remains live, its version/phase
// still matches the input snapshot, and this message has not already been scored.
// Commit atomically under your case lock/version guard:
// save turn.output, turn.toneDial, and emit turn.event exactly once.
```

The helper validates input (invalid backend requests throw), filters title/grievance/transcript/memory text, redacts it, calls the judge, and never requests voice for a safety flag. It redacts returned fields, smooths the dial only on a new eligible arguer message, and uses the resulting dial for voice and the RoomEvent. Opening, cross questions and verdicts never rescore old messages even if the boolean is incorrectly true. Use `turnKind: 'reaction'` for cross answers.

Audio gets at most three seconds. A rejection or timeout produces `audioUrl: null` and valid subtitles; late audio may finish populating the cache but cannot change this result or create a second event. The helper itself never writes, broadcasts, closes cases, or schedules trial timers. A safety closure during an outstanding request must prevent the backend from broadcasting its stale result. Part 1 must also cancel queued audio/animations immediately on a safety event. Do not use returned internal safety_reason as public crisis copy.

Part 3's direct `judgeTurn()` remains available for judge-only callers. The integration entry point is the recommended combined path; raw text must already have been filtered/redacted if you bypass it. Group memory queries remain separate, described in INTEGRATION.md. Jury votes stay outside JudgeInput.

## 6. Media lifecycle

Private signed media URLs expire after one hour. Persist stable object references in your storage adapter/database and refresh URLs when loading room state. Ownership-aware avatar routes store only moderated 256px cropped heads. `deleteAvatarHeads(userId)` is broad user deletion, not case-end cleanup; delete case-owned object references individually through your backend adapter. Revoke artifacts when a case becomes safety-closed. The card helper rechecks current visibility before cache hits but cannot revoke previously shared URLs itself.

Server adapters do not run automatically: import your bootstrap in each route and backend bundle. Use Node runtime for sharp, voice and storage. Browser code imports only AvatarPicker, crop and presets; never the server media/judge/integration barrels.

## 7. Verify the merged website

1. Run `npm ci`, `npm test` and `npm run build` here to check the delivered source; run your own backend checks after merging.
2. Configure real auth, private storage and moderation. Confirm routes deny unauthenticated users and TTS rejects unowned speech.
3. Submit a PII-bearing message: only redacted text should be saved, broadcast and passed to Gemini.
4. Submit a safety case: close privately, remove spectators, cancel audio, and produce no verdict, card or leaderboard update.
5. Replay both cross questions and answer reactions; commit each message's dial update once.
6. Test actual voice, crop/webcam permissions, moderated uploads, expiring URLs, cleanup, card visibility and group RLS on the shared website.
7. Simulate a safety-close/version change while a judge or voice call is outstanding; stale results must never emit.

## Demo audio

`fixtures/media/demo-lines.json` is generated from the actual Part 3 oat-milk replay, with 120 entries covering every scripted speech/voice-band combination, exact boundaries, and neutral phase fallbacks. `npm run pregen-demo -- --manifest-only` rebuilds the manifest without network calls. `npm run pregen-demo` with DEMO_MODE=false generates/caches those exact lines using your configured voice and storage. `npm run verify:media` checks one real voice line and cached scripted replay. Local cache paths are files, not browser URLs: serve/copy them through your host or use private Supabase storage. Other cases, changed memory/participant names or prompts may require additional cached lines; DEMO_MODE will never silently generate them live.

See PART4.md for detailed media limitations, INTEGRATION.md for judge contracts/memory, and VERIFICATION.md for the measured checks and provider limits.

Read INTEGRATION-AUDIT.md for the re-audit findings and regression coverage. Card templates changed during the audit: invalidate existing cached cards before serving the new renderer.

> The shared contracts are already merged in this delivery. See [BACKEND-HANDOFF.md](BACKEND-HANDOFF.md) for the combined pipeline, public origin setting, and exact demo manifest.

# Part 4 integration

## Shared contracts

The supplied `src/contracts/` is a starter subset taken from Globals, plus proposed Part 4-specific limits, endpoints, provider URLs, and environment names in `MEDIA_CONFIG`. Merge those additions with the team's shared contracts first. It deliberately does not implement the other parts. Runtime imports use relative paths so these modules also typecheck without a Next.js alias.

The original Globals signatures are preserved:

```ts
redact(text: string): string;
preFilter(text: string): { ok: boolean; category?: SafetyCategory };
speak(text: string, toneDial: number, kind?: 'quick' | 'verdict'): Promise<{ audioUrl: string }>;
processAvatar(file: Blob): Promise<{ headImageUrl: string } | { error: 'no_face' | 'unsafe' }>;
renderVerdictCard(caseId: string, format: 'portrait' | 'square'): Promise<string>;
```

The ownership-aware upload and cleanup extensions (`processAvatarForOwner`, `deleteAvatarHeads`) and runtime adapter configuration are proposed contract additions. Agree on them with Part 2. No changes to the case engine are included.

## Part 2: initialize server adapters

Import `configureMedia` from `src/media/index.ts` and configure it from a server bootstrap imported by both route handlers and the backend engine. Configuration must run in every server process or serverless route bundle, not just a separate startup command.

```ts
configureMedia({
  authorize: async (request, action, speech) => {
    // Use your existing session verification, per-user rate limits,
    // and permission checks. Return null to deny.
    // For TTS replay, validate speech.text/toneDial/kind against an authorized judge turn.
    // The TTS body is already consumed; do not clone or parse it here.
    return { userId: authenticatedUser.id };
  },
  loadVerdict: async (caseId, format) => {
    // Load the finalized verdict and current safety status.
    // Return VerdictCardData, including caseId, both public handles,
    // title, caseNumber, ruling, headline, sentence, toneDial,
    // juryGuiltyPct, and safetyClosed.
    // Throw when no final verdict exists or caller access is not allowed.
    return finalizedCardData;
  },
});
```

The pseudocode above references your backend's variables; it is not an auth implementation. Do not replace it with an unconditional allow. The backend card route also needs authentication and visibility checks before calling the renderer. Its response contract can be `{ cardUrl }`, or it can fetch and proxy PNG bytes; agree with Part 1. Pass `portrait` or `square` explicitly.

### Storage

Default storage uses a private Supabase bucket. Part 2 creates it and configures:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `SUPABASE_MEDIA_BUCKET`

Alternatively inject `MediaStorage` for your existing storage implementation. Cached objects receive a newly generated signed URL on every lookup. Audio keys hash the exact text, voice, model, and settings; card keys hash the case ID and include the format. Avatar names are random, scoped under `heads/{userId}/` by the route. Metadata is stripped and only 256×256 cropped heads are accepted. Never persist service credentials in a browser module.

Supabase signed URLs expire after one hour. Persist stable object references in your database, not signed URLs; have your backend refresh participant URLs when building room state. An injected storage adapter can record `{userId, objectKey}` during `write()` and provide your own authenticated stable URL in `url()`. Map those object references to case participants for cleanup. The plain Globals `processAvatar()` signature has no ownership argument and writes under `heads/unassigned/`; use the owner-aware API route for real users.

`deleteAvatarHeads(userId)` deletes all of that user's cropped heads. Use this for an explicit user deletion request. For a single case ending, Part 2 must delete only the object references assigned to that case through its storage integration, so other live cases are not affected. Do not call the broad user cleanup on every case ending. There is no automatic case-end event listener in this module.

Cache deduplication prevents duplicate voice calls within one server process. Multiple server instances may still generate the same cache miss concurrently; add a shared lock in your engine if needed. Cards assume verdict data is immutable. Delete/rebuild their cached objects if you change card data, fonts, or templates. Safety-closed cases are checked again before returning cached card URLs; Part 2 must revoke/delete existing shared artifacts when access changes.

### Moderation

Use `GOOGLE_VISION_API_KEY` with Cloud Vision enabled, or inject `moderateImage(bytes)` returning `{ safe, hasFace }`. The built-in provider checks SafeSearch and face detection. Unknown/missing classifications and provider failures deny the upload. Adult, racy, and violence likelihoods of LIKELY/VERY_LIKELY are rejected. This is content moderation, not identity verification or age verification. The team still needs an age rule for photo/webcam access.

All routes require authorization. The avatar route also requires multipart `Content-Length` and a small body; configure your host's body limit to about 5 MB. API gateways that strip Content-Length need a bounded-body parser in your backend adapter. Route error responses hide provider details and credentials.

### Safety pipeline

Run `preFilter(rawText)` BEFORE broadcasting, then `redact(rawText)` BEFORE storing or passing text to the judge. On a pre-filter hit, follow Part 2's safety-close path. Patterns are intentionally conservative, including repeat unwanted contact. They are a heuristic: they do not reliably detect every language, euphemism, address, or obfuscated threat. Keep Part 3's judge safety flag and the report path. Extend and test `src/safety/lists.ts` for the launch audience.

Part 2 owns case closing, removing spectators, suppressing verdicts and leaderboard entries, and storing a private summary. Part 1 owns the plain safety screen and canceling queued audio/animations immediately when the safety event arrives. This module does not provide or verify crisis-resource copy.

### Voice

Call `speak(judgeSpeech, dial, 'quick')` or `speak(judgeSpeech, dial, 'verdict')`. Only judge lines should be sent. The provider's streaming response is consumed into a complete MP3 before upload; the function returns a playable cached URL, not an HTTP audio stream. Part 2 should use Globals' 3-second wait budget and send `audioUrl: null` when it expires. The provider has a separate 15-second deadline so an in-progress request can complete and populate the cache. Do not let a late result emit another judge event.

Defaults are Flash v2.5 and Multilingual v2 so all Globals numeric settings are supported. Eleven v3 is explicitly rejected until a separate stability-preset mapping is agreed; no speech tags are inserted or subtitles altered. Provider failures reject. Part 1 unlocks browser audio on first interaction, exposes mute, and falls back to browser speech/subtitles.

## Part 1: avatar picker

```tsx
import { AvatarPicker } from './components/AvatarPicker';

<AvatarPicker
  onDone={({ kind, headImageUrl }) => {
    // Save through your existing join/profile request, then navigate onward.
  }}
/>;
```

Presets are local SVG data URLs and never hit the server. Photo/webcam detection loads MediaPipe lazily. Only the padded square face crop leaves the browser. Webcam uses one snapshot and stops tracks at capture, cancel, tab change, and unmount. Permission denial offers presets/photos. The preview honors reduced-motion settings. The component includes its CSS; adapt shared fonts/tokens through the team's contract. Deployments with restrictive CSP should self-host the pinned WASM/model URLs and update `MEDIA_CONFIG`. The browser must support WebAssembly, canvas, and camera access over HTTPS.

## Verification and demo

`npm test` covers PII redaction/idempotence, safety triggers, voice cache/deduplication/settings, provider failure and demo fallback, unsafe/no-face upload rejection, crop-only enforcement, user cleanup, both PNG sizes, cached-card safety visibility, and authorization/validation on routes. It writes fixture previews to `.media-cache/previews/`.

Browser webcam permissions, real face detection, photo moderation, and live Supabase storage require a host website plus provider credentials and have not been end-to-end verified here. Test those with Part 1/2 at integration. The card template uses portable fallback fonts; replace token font names with your final installed UI fonts and rebuild caches. There are no pitch slides, rehearsal recordings, or website pages in this code-only delivery.

The demo manifest is now generated from Part 3's exact oat-milk replay, covering four voice bands. Run `npm run pregen-demo -- --manifest-only` to rebuild it without network, or `npm run pregen-demo` with DEMO_MODE=false and your configured storage/voice to cache the lines. With DEMO_MODE=true, a cache miss throws and never calls ElevenLabs. Local demo cache paths need serving/copying by your host; Supabase URLs work directly while their signatures are valid. Other case/memory/script variants require additional cached lines.

## Provider references

- [ElevenLabs streaming TTS API](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)
- [MediaPipe face detection for web](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js)
- [Cloud Vision SafeSearch](https://docs.cloud.google.com/vision/docs/detecting-safe-search)
- [Supabase Storage upload](https://supabase.com/docs/reference/javascript/storage-from-upload)

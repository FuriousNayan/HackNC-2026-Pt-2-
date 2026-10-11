# Integration re-audit — October 10, 2026

The original Part 4 ZIP was compared against the combined project, then each module and the judge/media boundary were reviewed. All partner implementation files and scripts are present. Shared CONFIG subset, MEDIA_CONFIG, TOKENS and helper outputs were compared directly against the original modules, including exact dial boundaries: the partner values are preserved. The first merge's substantive changes to existing partner modules were limited to the card-format guard, origin handling and server-only entry point. The additional corrections below were made during this audit.

## Issues found and fixed

1. **Demo audio at tone changes.** Judge speech uses the input dial while voice uses the smoothed dial. The old 36-entry manifest paired both with the same dial, so crossing a band could miss the audio cache. The manifest now contains 120 entries spanning every scripted speech/voice-band combination, exact tone boundaries, and neutral phase fallbacks. Tests exercise real band crossings and boundary values. Globals' different `<`/`<=` boundary rules were preserved.
2. **Stale photos and webcam retakes.** Starting a replacement photo or retake now clears and revokes the previous crop. Failed face detection or encoding cannot submit the old head. Camera tracks stop at capture, cancel, tab switch, preview failure and unmount, including a permission request resolved after unmount. Encoding/upload results are guarded against stale completion; malformed success replies are rejected.
3. **Input changes during a judge call.** Dial smoothing and phase eligibility now use the validated input snapshot and scoring option captured before awaiting. Mutating the caller's input while Gemini runs cannot change the prepared turn's dial.
4. **TTS authorization body handling.** Speech is bounded and validated before invoking the authorization adapter. The adapter gets an optional third `{text,toneDial,kind}` argument to verify ownership; handoff instructions no longer recommend parsing an unbounded request clone. Oversized bodies never reach that callback. Two-argument callbacks remain type-compatible, but the backend must use the context to verify replay ownership.
5. **Card layout and safety status.** Actual font/rendered pixel widths are measured so wide text fits inside the content area in both formats. Pixel-level tests reproduce and prevent overflow. Missing safetyClosed is denied, including cache hits; only explicit false permits cards.
6. **Moderation adapter flags.** Only literal safe:true and hasFace:true permit uploads. Malformed truthy values cannot bypass moderation.
7. **Storage cleanup.** Supabase cleanup lists in stable name order and removes owner-scoped files in bounded batches. Tests cover pagination, cache misses, permissions, upload failures and refreshed signed URLs. Local demo storage now supports relative roots and rejects paths escaping them.
8. **Judge retry feedback.** A rejected invented citation, unsupported quote or wrong phase now produces narrow trusted correction guidance for the second attempt. Provider exception text is not sent back to the model or logged. Fallback still applies if both attempts fail.

## Partner feature coverage

| Feature from partner source                                | Retained / connected                                     | Verification                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ElevenLabs quick/verdict models and Globals voice settings | speak/voiceRequest; combined helper                      | Live voice + combined Gemini/voice; cache and settings tests                                   |
| Exact-text audio cache and concurrent deduplication        | media/voice + storage adapters                           | Offline cache/dedup/error tests; cached demo replay live                                       |
| Preset avatars and onDone callback                         | AvatarPicker + local SVG presets                         | DOM interaction tests; no network calls                                                        |
| Lazy MediaPipe detection and padded square crop            | media/crop                                               | Mocked detection, largest face, crop bounds, retry, bitmap cleanup; real browser bundle built  |
| Photo uploads and ownership                                | AvatarPicker + /api/avatar                               | DOM crop-only upload; protected route and owner-scoped storage tests                           |
| Webcam snapshot, retake and cleanup                        | AvatarPicker                                             | DOM camera/canvas lifecycle tests                                                              |
| Cloud Vision safety/face checks                            | media/moderation                                         | Provider request/response tests, unknown classifications and failures deny uploads             |
| preFilter/redact                                           | safety module + combined pipeline                        | PII/idempotence and safety tests; no judge/audio for pre-filter flags                          |
| Portrait/square verdict cards                              | media/cards                                              | PNG dimensions, visibility, missing safety status and pixel overflow tests; previews inspected |
| Private Supabase media storage and cleanup                 | default adapter or injected MediaStorage                 | Mocked transport, pagination, batch deletion, signed-URL renewal and error tests               |
| Protected TTS/avatar routes                                | existing route implementations retained                  | Origin, body limits, deny-by-default, payload validation and speech ownership callback tests   |
| Demo pregeneration/test-voice scripts                      | retained; manifest now generated from actual judge lines | Manifest consistency/band-crossing/fallback tests; one cached demo verdict tested live         |
| Runtime adapter configuration                              | configureMedia retained                                  | Injected/default adapter behavior checked                                                      |

## Current checks

- 151 automated tests passed: 132 Vitest checks and 19 original/expanded media checks.
- Production build and TypeScript passed.
- A temporary audit route compiled the real AvatarPicker/MediaPipe client bundle successfully, then was removed. Its configured detector JS, WASM and model URLs returned HTTP 200. It is not shipped as a new website page.
- All six judge phases, cross-answer, family-attack and fake-precedent regressions returned validated Gemini output in the final nine-call live run.
- Combined Gemini-to-ElevenLabs verification passed. In that run voice exceeded the three-second room wait, so the event correctly returned audioUrl:null; generation subsequently completed into the cache. A separate scripted demo replay returned cached audio within the wait budget.
- The original partner constants and helper behavior were directly compared and preserved.
- A fresh extracted ZIP passed npm ci, all 151 tests and production build with no .env.local or preinstalled dependencies. Archive integrity and credential exclusion were verified. Details are in VERIFICATION.md.

An earlier live audit run rejected the fake-precedent response twice and used a neutral fallback. This was a successful failure-handling path, not a clean model pass. The final nine-call run passed; Gemini behavior remains probabilistic.

## What this does not verify

Real browser camera permissions and face detection on real photos, live Cloud Vision moderation, the deployed Supabase bucket/RLS, shared-site auth, realtime broadcasts, case-end cleanup events and queued audio cancellation still require the frontend/backend teammates' website and configuration. DOM/provider tests do not stand in for those end-to-end checks. All 120 demo audio entries have not been generated; run pregen-demo against the final voice/storage configuration before an offline demo. Existing card caches must be rebuilt after changing the template or fonts.

The partner's ZIP contains source modules rather than pitch slides, rehearsal recordings, a backup video or a media-testing website page. Those deliverables were not lost during integration and were not added to this code-only scope. The supplied streaming TTS response is still buffered into a complete MP3 before storage, matching the partner's original code; it does not expose a progressive browser audio stream.

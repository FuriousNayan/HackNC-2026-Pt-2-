# Verification record

Verified and re-audited October 10, 2026. [Integration re-audit](INTEGRATION-AUDIT.md).

## Combined Parts 3 + 4 checks

- 151 automated tests passed: 132 judge/integration/browser-lifecycle/provider-adapter checks plus 19 media checks. See [INTEGRATION-AUDIT.md](INTEGRATION-AUDIT.md) for the file comparison, corrections and feature-by-feature coverage.
- Production build and TypeScript compilation passed.
- All original input phases, plus cross-answer reactions, returned validated live Gemini results in the final phase check.
- Private credential file has mode 0600, is ignored by Git, and is absent from staged source and browser bundles.
- Dependencies are installed and locked; local branch is `part-3-judge`.

## Fresh handoff ZIP verification

The candidate ZIP was extracted into a new empty directory without .env.local, node_modules, .next or local media caches. `npm ci`, all 151 tests and the production build passed from that extracted source. This verifies the handoff does not rely on this Mac's existing dependencies, credentials or build files. The temporary avatar audit page is absent from the ZIP.

The actual AvatarPicker/MediaPipe browser bundle also compiled successfully. The configured detector JS, WASM and face-model asset URLs returned HTTP 200. Camera permission and real-photo detection still require browser/device integration checks.

Final archive integrity and credential-exclusion checks passed. The ZIP contains source, fixtures, documentation and lockfile; no actual keys, Git history, dependencies, build output or cached personal media.

## Combined live check

- Real Gemini verdict passed through the integration helper and real ElevenLabs generation successfully.
- Judge source was `gemini`; ruling was `guilty`; the complete event was ready in 9,358 ms. Audio was available within the three-second voice wait. This is one measured run, not a latency guarantee.
- A separate real voice generation followed by cached DEMO_MODE replay passed. The exact speech and cached URL matched.
- The 120-entry scripted/fallback demo audio manifest is generated from current judge scripts, not placeholder Part 4 text. Full audio pregeneration was not run; one real verdict line was tested.
- Both card sizes were rendered and the square preview was visually inspected. The card fixture was updated to match the judge's oat-milk remedy/headline.
- No live Cloud Vision/photo upload, real browser face detection/webcam, or deployed Supabase media storage was verified; these require shared-site integration and provider setup. Automated tests use injected storage and moderation adapters.

## Latest audit live checks

All six phases, cross-answer, family-attack and fake-precedent regressions returned Gemini output in the final nine-call audit run. A preceding run used fallback for the bogus-precedent scenario after semantic rejection; the final run passed after adding specific trusted retry feedback. Passing a later run does not guarantee every future model reply.

The latest combined live event took 8,822 ms. Voice exceeded the three-second wait, so audioUrl:null was returned as designed; the in-progress generation completed into the cache. Real voice plus cached scripted replay also passed separately. This supersedes the earlier single-run timing below.

## Earlier judge phase check

Model: `gemini-3.1-flash-lite`. Source must be Gemini for these checks to count as live passes.

| Call           | Result | Attempts | API time |
| -------------- | ------ | -------- | -------- |
| opening        | gemini | 1        | 9.33s    |
| statements     | gemini | 2        | 8.36s    |
| cross          | gemini | 1        | 9.80s    |
| rebuttal       | gemini | 1        | 6.94s    |
| closing        | gemini | 1        | 7.35s    |
| verdict        | gemini | 1        | 9.51s    |
| cross-answer   | gemini | —        | —        |
| family         | gemini | 1        | 8.19s    |
| fake-precedent | gemini | 2        | 12.65s   |

The cross-answer row did not record its API time. The final family and bogus-precedent regression replies refused the requested behavior and returned valid output.

## Broader live evaluation

The full three-tone / 20-hostile-case evaluation was run before the final grounding and phase-schema fixes. Money testimony averaged 0.35, meeting the <=0.45 goal. The available oat-milk results averaged about 0.78, meeting the >=0.65 score goal, but one tone call could not be evaluated because of a provider outage. Dishes averaged 0.55.

Among 20 hostile scenarios, 4 returned normal polite/refusal replies, 9 returned safety flags, and 7 used fallback outputs. All five explicit danger cases were flagged. The seven fallbacks included three provider outages, two timeouts and two rejected outputs. The two rejected-output scenarios (family attack and bogus precedent) were retested successfully after fixes. The broad evaluation correctly exited nonzero: provider failures are not counted as successful model evaluations. This is not a claim that all 20 scenarios passed a clean uninterrupted live-model run.

## Practical limits and remaining team work

- Current free-tier API timing was commonly around 6–10 seconds in the final run; the document’s approximately two-second target is not met consistently by this provider/model combination. Earlier standard Flash smoke calls were about 1.5–3 seconds but encountered a five-request-per-minute quota. Model selection remains configurable.
- Two bounded attempts and neutral phase fallbacks keep the trial moving when Gemini fails. Safety declarations are preserved even if other fields are malformed.
- The shared Supabase database, row-level permissions, auth, state machine, realtime events and production UI are still owned by teammates. Voice was tested live locally; deployed storage/moderation/auth and the full website must be verified after backend integration.
- Memory reads were tested with group-scoped fixtures and an emulated paginated Supabase adapter, including more than 1,000 historical cases, private cases, duplicates, errors and missing verdict joins.
- Optional participant handles, cross-answer call purpose, memory helper exports and the provisional guilty-count policy are explicitly documented for team contract review.
- Gemini is probabilistic. Schema and quotation checks constrain output, but do not prove every unquoted inference correct. Review live results after changing the model or prompt.

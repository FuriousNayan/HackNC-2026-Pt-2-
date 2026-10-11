> Parts 3 and 4 are now combined. Use [BACKEND-HANDOFF.md](BACKEND-HANDOFF.md) for the connected pipeline and deployment steps. This document retains the judge-specific contract details.

# Part 3 handoff to the team

## Copy into the shared website

Copy `src/judge/**` (including JSON fixture imports), `prompts/**`, and `fixtures/transcripts/**`. Add `@google/genai`, `zod`, and `@supabase/supabase-js` to the shared project; `tsx`, `vitest`, and `@next/env` are needed for these local scripts/tests. Merge the contracts deliberately with the team's existing files. Do not replace an existing package.json, UI, API routes, or backend. The test page and `/api/dev/judge` route are optional and are not production routes.

Part 2 calls:

```ts
import { judgeTurn } from '@/judge';
import { nextDial } from '@/contracts';

const output = await judgeTurn(input);
if (output.safety_flag) {
  // Close privately, hide testimony, remove spectators, show fixed safety copy.
  // Do not create a verdict or update the guilty leaderboard.
  return;
}
// Apply only when this call corresponds to a NEW arguer message:
const dialAfter = isNewArguerMessage ? nextDial(input.toneDial, output.tone_score) : input.toneDial;
// Save the turn, invoke Part 4's speak(), and broadcast RoomEvent.
```

Only the server imports the judge entry point. No frontend component should import it. The module never reads votes, writes the database, broadcasts events, schedules timers, or calls ElevenLabs. Backend input is already redacted. `judgeTurn` returns precisely JudgeOutput; internal `runJudge` diagnostics are for the local runner/tests.

Gemini credentials must remain server-only. Set GEMINI_API_KEY, GEMINI_MODEL and DEMO_MODE in the team's deployment environment. No `NEXT_PUBLIC_` credential. `DEMO_MODE=true` returns scripts with no model call. False uses Gemini with at most 2 requests, each bounded by 12 seconds; most replies should be faster. The SDK's additional automatic retries are disabled.

## Optional contract additions proposed here

The original fields, shared values and output shape are preserved. These additions solve gaps in the supplied documents; agree on them as a team before merging:

1. `JudgeInput.parties?: { plaintiff: string; defendant: string }`: identifies the parties even at opening with an empty transcript. Without it, the live prompt uses role names rather than making up handles. Known demo fixtures provide their names.
2. `JudgeInput.turnKind?: 'default' | 'reaction'`: set to `reaction` only during `cross` when responding to an answer. Omit it when asking the next question. This resolves the backend requirement for both cross questions and cross-answer reactions.
3. `JUDGE_CONFIG` in contracts/config.ts: shared enum lists, provider timeout/output limits, safety-independent neutral score, local runner/test limits and environment variable names. No new environment variables were added.
4. Memory helpers have the documented signatures but need listing in the team's cross-part contract.

Input constraints are deliberate: at most 40 messages (well above the planned trial), 5 precedents, 100 guilty-count entries, and the documented statement/answer limits. Pass only relevant counts for the arguers if the group becomes larger. Keep original testimony order and enforce backend length limits before storage. Invalid input produces a neutral valid opening fallback through judgeTurn; validate upstream so a malformed verdict request cannot be mistaken for a completed verdict.

## Phase calls

| Input                      | Output           | Notes                                                                                          |
| -------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| opening                    | opening          | Empty transcript is valid; use parties. Neutral score 0.5, no dial update.                     |
| statements                 | reaction         | Latest new arguer message drives the score.                                                    |
| cross, default             | question         | Target is required; question uses target's words. Do not resmooth a previously scored message. |
| cross, reaction            | reaction         | Latest answer; score/update once.                                                              |
| rebuttal                   | reaction         | Latest new rebuttal message.                                                                   |
| closing                    | reaction         | Supported if called, although backend spec permits skipping it.                                |
| verdict                    | verdict          | Do not update dial again from an already scored closing message.                               |
| any genuine safety concern | safety_flag=true | No verdict, neutral face, no SFX; backend uses the fixed safety screen.                        |

The supplied Phase enum cannot represent disconnect/default judgment metadata. Part 2 should own disconnect judgments or the team must extend JudgeInput to supply explicit, trusted disconnect context. Do not invent evidence or simulate a no-show by inserting an admission. Timer silence also needs a backend-created, clearly identified message convention; the current Message contract has no system role. Agree on that convention before integration.

## Fallback and demo policy

The PDF proposes a guilty fallback. This implementation deliberately uses `hung`, no sentence and an unavailable-review explanation when a live review fails. An API failure is not evidence. This is a documented recommendation from the earlier guide, not a verbatim PDF requirement.

Known demo fixtures have scripts. A script only declares guilt when the supplied record contains the fixture's actual admission. Changed testimony or custom cases receive neutral scripted output. Threat/stalking checks run before demo mode. Scripted speech can be handed to Part 4 for cached audio; keep the audio identical to the returned speech.

There is a deterministic backup for obvious hazards. It is conservative and may flag quoted/hypothetical danger; it does not understand all context. Gemini performs contextual safety review during live calls. Provider safety blocks also produce safety_flag, rather than an ordinary fallback. A model-declared safety flag is preserved even if other output fields are malformed: fixed plain backup text removes invalid verdict, face, and SFX fields. For hazards that neither the backup nor Part 4 catches, a network outage prevents contextual review. The fallback is plain, but the module cannot guarantee detection of subtle danger while offline.

## Memory queries

```ts
import { getPrecedents, getGuiltyCounts } from '@/judge/memory';
const [precedents, guiltyCounts] = await Promise.all([
  getPrecedents(supabaseServerClient, groupId, [plaintiffHandle, defendantHandle]),
  getGuiltyCounts(supabaseServerClient, groupId),
]);
```

Use the existing Part 2 server client and authentication/group membership checks. Do not expose a service-role client to browsers. The judge module does not need another Supabase secret.

Adapter assumptions follow the PDFs: cases(id, group_id, title, filer_id, defendant_id, status, safety_closed, closed_at); verdicts(case_id, ruling, findings, headline); profiles(id, handle). It reads completed non-safety cases and corresponding verdict/profile rows, skips missing joins, deduplicates IDs and scopes everything to the group. It paginates case history rather than silently truncating a leaderboard at Supabase's normal response limit.

Since the PDFs do not store a summary, this adapter derives one from findings, bounded to the input summary limit. Same-pair cases are prioritized, then recent cases, with 5 returned. Relevance is finally assessed by the judge; do not force a citation.

The provisional leaderboard rule is: only `guilty` increments the defendant's count. `partly_guilty`, `hung`, `not_guilty`, and safety-closed cases do not increment it. The current schema has no culpable-party field. Confirm this policy or add culpable-party data before supporting rulings against plaintiffs. A habitual offender enhancement is mild and applies only after a supported current guilty finding, never as evidence for guilt.

Query errors propagate; Part 2 decides whether to retry or use empty memory and log an internal failure. Do not present fabricated precedents on failure. These queries have been tested against memory fixtures; the team's actual Supabase instance and RLS must still be verified once Part 2 exists.

## Shared gate checks

1. Post a real message through Part 2; verify redaction, a saved valid judge turn, and matching broadcast text.
2. Verify both cross questions and answer reactions, with each new message updating the dial once.
3. Run the safety fixture; verify private closure, no verdict and no leaderboard change.
4. Verify precedent queries using actual group membership and RLS. Jury votes must remain absent from JudgeInput.
5. Replay the complete oat-milk case and give returned speech to Part 4's audio pre-generation.

## Current provider references

- https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html
- https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html
- https://ai.google.dev/gemini-api/docs/structured-output

Local testing selected gemini-3.1-flash-lite after gemini-3.8-flash reported heavy demand and gemini-3.5-flash was constrained to five free-tier requests per minute. It remains a Flash-class model. GEMINI_MODEL remains configurable; validate model availability and evaluate behavior when changing it.

Quoted speech is checked against the supplied record, including contractions and ordinary punctuation changes. Unsupported quotes and case titles cause a retry, then a neutral fallback. This is a grounding check, not a proof that every unquoted inference is correct.

Each call also narrows Gemini's JSON Schema to the requested output phase. Non-verdict calls only permit null verdicts; cross questions permit the requested target or the room for safety. Runtime validation remains the second check.

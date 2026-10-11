import type { Reaction } from '@/contracts';

/**
 * Part 2 only constants. Shared values (timers, limits, tone, channel names) stay in @/contracts and are
 * read from CONFIG. Everything here is either server plumbing or a proposal flagged in docs/team/PART2.md.
 */

/** Mirrors HANDLE_PATTERN in src/ui/session.ts. Keep the two in sync. */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'court',
  'judge',
  'admin',
  'system',
  'hungjury',
]);

export const REACTIONS = [
  'gasp',
  'gavel',
  'objection',
  'laugh',
  'boo',
  'order',
] as const satisfies readonly Reaction[];

/** Same fixed copy src/integration/turn.ts uses. Internal safety reasons are never shown publicly. */
export const SAFETY_REASON = 'This dispute has been paused for a safety concern.';
export const FILING_BLOCKED_MESSAGE =
  'This dispute cannot be filed as a mock trial. If someone is in danger, please contact local emergency services.';

/** Stored in place of testimony when a speaker's timer runs out. It is attributed to the silent party. */
export const SILENCE_TEXT = '(No response before the timer ran out.)';

export const SERVER_CONFIG = {
  /** Cross-examination questions per arguer. The shared maximum is CONFIG.limits.followUpsPerSide. */
  crossQuestionsPerSide: 1,
  /** A polling client (GET /api/cases/:id) counts as present for this long after its last request. */
  presenceTtlMs: 20_000,
  /** After the verdict the case is marked closed. The room stays viewable. */
  closeAfterMs: 10 * 60_000,
  maxBodyBytes: 20_000,
  maxHeadImageChars: 400_000,
  maxReasonChars: 200,
  maxSentenceRequestChars: 100,
  sseHeartbeatMs: 15_000,
  sseRetryMs: 2_000,
  sseReplayFrames: 300,
  maxConnectionsPerUserPerCase: 5,
  sessionMaxAgeSec: 60 * 60 * 24 * 30,
  ttsPerMinute: 30,
  avatarPerMinute: 6,
  /** Pause between a judge turn finishing and the next step starting, so spoken audio can land. */
  afterJudgeMs: 0,
} as const;

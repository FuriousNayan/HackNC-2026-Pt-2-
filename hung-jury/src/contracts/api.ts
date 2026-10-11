// Request and response types for every API route. Owned by Part 2 (backend).
// Written in phase 1 so Part 1 (UI) can call real routes against real
// shapes even while USE_STUB_JUDGE / NEXT_PUBLIC_USE_MOCKS are on.

import type { CaseStatus, Juror, Phase, Precedent, Role } from './types';

// ---------------------------------------------------------------------------
// POST /api/cases
export interface CreateCaseRequest {
  title: string;
  grievance: string; // <= CONFIG.limits.grievanceChars
  defendantHandleOrInvite: string;
  sentenceRequest?: string;
}
export interface CreateCaseResponse {
  caseId: string;
  status: CaseStatus;
}

// ---------------------------------------------------------------------------
// POST /api/cases/:id/accept
export type AcceptCaseRequest = Record<string, never>;
export interface AcceptCaseResponse {
  caseId: string;
  status: CaseStatus;
}

// ---------------------------------------------------------------------------
// POST /api/cases/:id/start
export type StartCaseRequest = Record<string, never>;
export interface StartCaseResponse {
  caseId: string;
  phase: Phase;
  timerEndsAt: string;
}

// ---------------------------------------------------------------------------
// POST /api/cases/:id/message
export interface PostMessageRequest {
  text: string;
  /** Client-generated idempotency key so a double tap cannot create two messages. */
  clientMessageId: string;
}
export interface PostMessageResponse {
  messageId: string;
  stored: boolean;
  /** true when this call resolved an existing clientMessageId instead of inserting a new row. */
  deduped: boolean;
}

// ---------------------------------------------------------------------------
// POST /api/cases/:id/join
export type JoinCaseRequest = Record<string, never>;
export interface JoinCaseResponse {
  role: Role;
  seatTaken: boolean;
}

// ---------------------------------------------------------------------------
// POST /api/cases/:id/vote
export interface VoteRequest {
  vote: 'guilty' | 'not_guilty';
}
export interface VoteResponse {
  recorded: boolean;
}

// ---------------------------------------------------------------------------
// POST /api/cases/:id/react
export interface ReactRequest {
  kind: 'gasp' | 'gavel' | 'objection' | 'laugh' | 'boo' | 'order';
}
export interface ReactResponse {
  recorded: boolean;
}

// ---------------------------------------------------------------------------
// POST /api/cases/:id/report
export interface ReportRequest {
  reason: string;
}
export interface ReportResponse {
  recorded: boolean;
  safetyClosed: boolean;
}

// ---------------------------------------------------------------------------
// GET /api/cases/:id/card?format=portrait|square
export interface VerdictCardQuery {
  format: 'portrait' | 'square';
}
// Response is a PNG image (image/png), not JSON.

// ---------------------------------------------------------------------------
// GET /api/docket
export interface DocketCaseSummary {
  caseId: string;
  title: string;
  toneDial: number;
  viewers: number;
  status: CaseStatus;
  plaintiffHandle: string;
  defendantHandle: string;
}
export interface DocketResponse {
  cases: DocketCaseSummary[];
}

// ---------------------------------------------------------------------------
// GET /api/groups/:id/history
export interface GroupHistoryResponse {
  precedents: Precedent[];
}

// ---------------------------------------------------------------------------
// GET /api/groups/:id/leaderboard
export interface LeaderboardEntry {
  handle: string;
  guiltyCount: number;
}
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}

// ---------------------------------------------------------------------------
// POST /api/tts (Part 4 implements, Part 2 server and Part 1 replay call it)
export interface TtsRequest {
  text: string;
  toneDial: number;
  kind?: 'quick' | 'verdict';
}
export interface TtsResponse {
  audioUrl: string | null;
}

// ---------------------------------------------------------------------------
// POST /api/avatar (Part 4 implements)
export interface AvatarUploadResponse {
  headImageUrl: string;
}
export interface AvatarUploadError {
  error: 'no_face' | 'unsafe';
}

export interface ApiErrorBody {
  error: string;
}

export type JurorList = Juror[];

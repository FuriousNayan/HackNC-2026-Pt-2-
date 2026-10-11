// Shared types for Hung Jury. Use camelCase everywhere except JudgeOutput,
// which keeps snake_case because it mirrors the Gemini JSON schema.
//
// Merged with the Part 3/4 handoff's contracts/types.ts: JudgeInput.parties
// and JudgeInput.turnKind, plus CardFormat, SpeechKind, and VerdictCardData
// are additions from that handoff (see docs/INTEGRATION.md).

export type Phase = 'opening' | 'statements' | 'cross' | 'rebuttal' | 'closing' | 'verdict';
export type CaseStatus = 'filed' | 'accepted' | 'live' | 'verdict' | 'closed';
export type Role = 'plaintiff' | 'defendant' | 'juror';
export type Face = 'neutral' | 'amused' | 'shocked' | 'stern' | 'speaking';
export type Sfx = 'none' | 'gavel' | 'gasp' | 'drumroll' | 'laugh';
export type Ruling = 'guilty' | 'not_guilty' | 'partly_guilty' | 'hung';
export type Reaction = 'gasp' | 'gavel' | 'objection' | 'laugh' | 'boo' | 'order';
export type AvatarKind = 'avatar' | 'photo' | 'webcam';
export type SafetyCategory = 'threat' | 'harassment' | 'self_harm' | 'other';

export interface Message {
  id: string;
  caseId: string;
  authorHandle: string;
  role: Role;
  kind: 'statement' | 'answer' | 'closing';
  text: string; // already redacted
  createdAt: string;
}

export interface Precedent {
  title: string;
  plaintiff: string;
  defendant: string;
  ruling: Ruling;
  summary: string;
}

export interface Juror {
  handle: string;
  headImageUrl: string;
}

export interface JudgeInput {
  caseTitle: string;
  grievance: string;
  phase: Phase;
  transcript: Message[];
  toneDial: number; // 0 to 1
  precedents: Precedent[];
  guiltyCounts: Record<string, number>; // handle to guilty rulings in this group
  target?: 'plaintiff' | 'defendant'; // who a question is for
  // Optional, backward-compatible additions from the Part 3/4 handoff
  // (docs/INTEGRATION.md "Optional contract additions"):
  parties?: { plaintiff: string; defendant: string };
  turnKind?: 'default' | 'reaction'; // 'reaction' only during cross, after an answer
  /** What the plaintiff asked for as a sentence. Untrusted wish, only considered if the ruling is guilty. */
  sentenceRequest?: string;
}

export interface JudgeOutput {
  phase: 'opening' | 'reaction' | 'question' | 'interjection' | 'verdict';
  tone_score: number;
  speech: string;
  target: 'plaintiff' | 'defendant' | 'room' | null;
  face: Face;
  sfx: Sfx;
  verdict: null | {
    ruling: Ruling;
    findings: string[];
    sentence: string | null;
    headline: string;
    cited_precedent: string | null;
  };
  safety_flag: boolean;
  safety_reason: string | null;
}

// Room events: one realtime channel per case, named by CONFIG.channel(caseId).
// Part 2 sends these, Part 1 renders them. A recorded trial is an array of
// { atMs: number, event: RoomEvent }.
export type RoomEvent =
  | { type: 'state'; phase: Phase | 'waiting'; activeRole: Role | 'judge' | null; timerEndsAt: string | null }
  | { type: 'message'; message: Message }
  | {
      type: 'judge';
      speech: string;
      face: Face;
      sfx: Sfx;
      toneDial: number;
      audioUrl: string | null;
      verdict: JudgeOutput['verdict'];
    }
  | { type: 'jury'; guiltyPct: number; notGuiltyPct: number; viewers: number; jurors: Juror[] }
  | { type: 'reaction'; kind: Reaction; fromHandle: string }
  | { type: 'presence'; role: 'plaintiff' | 'defendant'; present: boolean }
  | { type: 'safety'; reason: string };

export type CardFormat = 'portrait' | 'square';
export type SpeechKind = 'quick' | 'verdict';

export interface VerdictCardData {
  caseId: string;
  caseNumber: string;
  title: string;
  plaintiff: string;
  defendant: string;
  ruling: Ruling;
  headline: string;
  sentence: string | null;
  toneDial: number;
  juryGuiltyPct: number;
  safetyClosed: boolean;
}

// Function signatures across parts. Each owner exports exactly these.
// Nothing else is called across parts. (src/judge, src/safety, src/media now
// hold the real Part 3/4 implementations; these aliases just name their
// shapes.)

// Part 3: src/judge
export type JudgeTurnFn = (input: JudgeInput) => Promise<JudgeOutput>;

// Part 4: src/safety
export type RedactFn = (text: string) => string;
export type PreFilterFn = (text: string) => { ok: boolean; category?: SafetyCategory };

// Part 4: src/media
export type SpeakFn = (text: string, toneDial: number, kind?: SpeechKind) => Promise<{ audioUrl: string }>;
export type ProcessAvatarFn = (
  file: Blob,
) => Promise<{ headImageUrl: string } | { error: 'no_face' | 'unsafe' }>;
export type RenderVerdictCardFn = (caseId: string, format: CardFormat) => Promise<string>;

// Part 4: src/components/AvatarPicker
export interface AvatarPickerProps {
  defaultKind?: AvatarKind;
  onDone: (result: { kind: AvatarKind; headImageUrl: string }) => void;
}

export interface AvatarPickerProps {
  defaultKind?: AvatarKind;
  onDone: (result: { kind: AvatarKind; headImageUrl: string }) => void;
}

/** Part 1: one recorded RoomEvent with its offset, used by the mock player and fixtures. */
export interface RecordedEvent {
  atMs: number;
  event: RoomEvent;
}

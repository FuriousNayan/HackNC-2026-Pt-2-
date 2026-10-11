import type { Juror, Message, Phase, Reaction, Role, RoomEvent, Face, Sfx, JudgeOutput } from '@/contracts';
import { CONFIG } from '@/contracts';

export interface JudgeState {
  speech: string;
  face: Face;
  sfx: Sfx;
  audioUrl: string | null;
  verdict: JudgeOutput['verdict'];
  /** bumps on every judge event so effects can re-fire for identical speech */
  seq: number;
}

export interface ReactionPop {
  id: number;
  kind: Reaction;
  fromHandle: string;
}

export interface RoomState {
  phase: Phase | 'waiting';
  activeRole: Role | 'judge' | null;
  timerEndsAt: string | null;
  messages: Message[];
  judge: JudgeState | null;
  toneDial: number;
  jury: {
    guiltyPct: number;
    notGuiltyPct: number;
    viewers: number;
    jurors: Juror[];
  };
  reactions: ReactionPop[];
  safety: { reason: string } | null;
  /** set by the mock player or presence; arguer handle that is disconnected */
  disconnectedRole: Role | null;
  eventCount: number;
}

export const initialRoomState = (): RoomState => ({
  phase: 'waiting',
  activeRole: null,
  timerEndsAt: null,
  messages: [],
  judge: null,
  toneDial: CONFIG.tone.start,
  jury: { guiltyPct: 0, notGuiltyPct: 0, viewers: 0, jurors: [] },
  reactions: [],
  safety: null,
  disconnectedRole: null,
  eventCount: 0,
});

export type { RoomEvent };

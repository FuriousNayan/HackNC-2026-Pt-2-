import { CONFIG, type Message, type Role } from '@/contracts';
import type { RoomState } from './types';

/** Total seconds of the current turn, only used to draw the ring. The end time comes from the server. */
export function timerTotalSec(state: RoomState): number {
  const t = CONFIG.timers;
  switch (state.phase) {
    case 'opening':
      return t.openingSec;
    case 'statements':
      return t.statementSec;
    case 'cross':
      return t.answerSec;
    case 'rebuttal':
      return t.rebuttalSec;
    case 'closing':
      return t.closingSec;
    case 'verdict':
      return t.voteCountdownSec;
    default:
      return 0;
  }
}

export const latestMessage = (state: RoomState): Message | null =>
  state.messages.length ? state.messages[state.messages.length - 1] : null;

export interface Participant {
  handle: string;
  headImageUrl: string;
}

export interface Participants {
  plaintiff: Participant;
  defendant: Participant;
}

export interface Me {
  handle: string;
  role: Role;
}

/** Which of the three seats is the speaker right now. */
export function speakerOf(state: RoomState): 'judge' | 'plaintiff' | 'defendant' | null {
  if (state.activeRole === 'judge' || state.activeRole === 'plaintiff' || state.activeRole === 'defendant') {
    return state.activeRole;
  }
  return null;
}

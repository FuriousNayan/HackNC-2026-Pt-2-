import type { RoomEvent } from '@/contracts';
import { initialRoomState, type RoomState } from './types';

let reactionId = 0;

/**
 * Pure render reducer. It never computes the dial, phase, timer or tally.
 * It only copies what the server sent into state.
 */
export function applyEvent(state: RoomState, event: RoomEvent): RoomState {
  // Once a safety event arrives nothing else may change the screen.
  if (state.safety) return state;

  const next: RoomState = { ...state, eventCount: state.eventCount + 1 };

  switch (event.type) {
    case 'state':
      next.phase = event.phase;
      next.activeRole = event.activeRole;
      next.timerEndsAt = event.timerEndsAt;
      return next;

    case 'message':
      if (state.messages.some((m) => m.id === event.message.id)) return state;
      next.messages = [...state.messages, event.message];
      return next;

    case 'judge':
      next.toneDial = event.toneDial;
      next.judge = {
        speech: event.speech,
        face: event.face,
        sfx: event.sfx,
        audioUrl: event.audioUrl,
        verdict: event.verdict,
        seq: (state.judge?.seq ?? 0) + 1,
      };
      return next;

    case 'jury':
      next.jury = {
        guiltyPct: event.guiltyPct,
        notGuiltyPct: event.notGuiltyPct,
        viewers: event.viewers,
        jurors: event.jurors,
      };
      return next;

    case 'reaction': {
      reactionId += 1;
      // keep a short queue so stickers can float and expire
      next.reactions = [
        ...state.reactions.slice(-11),
        { id: reactionId, kind: event.kind, fromHandle: event.fromHandle },
      ];
      return next;
    }

    case 'presence':
      // An arguer dropped or came back. Only one side is tracked at a time, which is enough for the greyed bobblehead.
      if (event.present) {
        if (state.disconnectedRole !== event.role) return state;
        next.disconnectedRole = null;
      } else {
        next.disconnectedRole = event.role;
      }
      return next;

    case 'safety':
      next.safety = { reason: event.reason };
      return next;

    default:
      return state;
  }
}

export function replay(events: RoomEvent[]): RoomState {
  return events.reduce(applyEvent, initialRoomState());
}

import type { Participants } from '../room/selectors';

/**
 * Arguer heads for the demo case. The RoomEvent union has no event that carries arguer heads
 * (only jurors), so live mode needs one more source from Part 2. See the open questions in the handoff.
 */
export const DEMO_PARTICIPANTS: Participants = {
  plaintiff: { handle: 'dave', headImageUrl: '/art/avatars/a1.svg' },
  defendant: { handle: 'maya', headImageUrl: '/art/avatars/a2.svg' },
};

export const PRESET_AVATARS = [1, 2, 3, 4, 5, 6].map((n) => `/art/avatars/a${n}.svg`);

import { describe, expect, it } from 'vitest';
import { applyEvent } from './reducer';
import { initialRoomState } from './types';

describe('presence in the room reducer', () => {
  it('greys out an arguer who left and restores them when they return', () => {
    let s = applyEvent(initialRoomState(), { type: 'presence', role: 'defendant', present: false });
    expect(s.disconnectedRole).toBe('defendant');
    s = applyEvent(s, { type: 'presence', role: 'plaintiff', present: true }); // other side returning changes nothing
    expect(s.disconnectedRole).toBe('defendant');
    s = applyEvent(s, { type: 'presence', role: 'defendant', present: true });
    expect(s.disconnectedRole).toBeNull();
  });
});

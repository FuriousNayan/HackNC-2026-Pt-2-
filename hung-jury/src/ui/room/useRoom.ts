'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { CONFIG, type RoomEvent } from '@/contracts';
import { applyEvent } from './reducer';
import { initialRoomState, type RoomState } from './types';
import { MockPlayer, type JumpTarget } from './MockPlayer';
import { TRIAL_FIXTURES, type FixtureName } from './fixtures';
import { getLiveTransport } from './liveTransport';

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

export interface MockControls {
  enabled: boolean;
  playing: boolean;
  fixture: FixtureName;
  setFixture: (name: FixtureName) => void;
  play: () => void;
  pause: () => void;
  restart: () => void;
  jump: (target: JumpTarget) => void;
}

type Action = { kind: 'event'; event: RoomEvent } | { kind: 'reset' };

/** Fixtures store timerEndsAt as "+<ms>"; turn that into a real timestamp at replay time. */
function resolveMockEvent(event: RoomEvent): RoomEvent {
  if (event.type === 'state' && event.timerEndsAt && event.timerEndsAt.startsWith('+')) {
    const ms = Number(event.timerEndsAt.slice(1));
    return { ...event, timerEndsAt: new Date(Date.now() + ms).toISOString() };
  }
  return event;
}

function reducer(state: RoomState, action: Action): RoomState {
  if (action.kind === 'reset') return initialRoomState();
  return applyEvent(state, action.event);
}

/**
 * Subscribes to CONFIG.channel(caseId), or replays a fixture when NEXT_PUBLIC_USE_MOCKS=true.
 * Returns the room state plus mock controls (disabled in live mode).
 */
export function useRoomController(caseId: string, initialFixture: FixtureName = 'oat-milk') {
  const [state, dispatch] = useReducer(reducer, undefined, initialRoomState);
  const [fixture, setFixture] = useState<FixtureName>(initialFixture);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<MockPlayer | null>(null);

  useEffect(() => {
    dispatch({ kind: 'reset' });

    if (USE_MOCKS) {
      const player = new MockPlayer(
        TRIAL_FIXTURES[fixture],
        (event) => dispatch({ kind: 'event', event: resolveMockEvent(event) }),
        () => dispatch({ kind: 'reset' }),
      );
      playerRef.current = player;
      player.play();
// eslint-disable-next-line react-hooks/set-state-in-effect -- the mock player starts playing as the effect mounts
      setPlaying(true);
      return () => {
        player.destroy();
        playerRef.current = null;
      };
    }

    const transport = getLiveTransport();
    if (!transport) return;
    return transport(CONFIG.channel(caseId), (event) => dispatch({ kind: 'event', event }));
  }, [caseId, fixture]);

  const controls: MockControls = {
    enabled: USE_MOCKS,
    playing,
    fixture,
    setFixture,
    play: useCallback(() => {
      playerRef.current?.play();
      setPlaying(true);
    }, []),
    pause: useCallback(() => {
      playerRef.current?.pause();
      setPlaying(false);
    }, []),
    restart: useCallback(() => {
      playerRef.current?.restart();
      setPlaying(true);
    }, []),
    jump: useCallback((target: JumpTarget) => {
      playerRef.current?.jump(target);
      setPlaying(true);
    }, []),
  };

  return { state, controls };
}

export function useRoom(caseId: string): RoomState {
  return useRoomController(caseId).state;
}

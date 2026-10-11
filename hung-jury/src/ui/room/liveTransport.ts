import type { RoomEvent } from '@/contracts';
import { sseTransport } from './sseTransport';

/**
 * Part 2 owns Supabase Realtime. Part 1 only needs "give me events for this channel".
 * At Gate 2 Part 2 (or you) registers a transport that subscribes to CONFIG.channel(caseId)
 * and calls onEvent for each RoomEvent. Returns an unsubscribe function.
 */
export type LiveTransport = (channel: string, onEvent: (event: RoomEvent) => void) => () => void;

let transport: LiveTransport | null = null;

export function setLiveTransport(t: LiveTransport) {
  transport = t;
}

export function getLiveTransport(): LiveTransport | null {
  // Part 2's SSE stream is the default in the browser. setLiveTransport still overrides it.
  return transport ?? (typeof EventSource !== 'undefined' ? sseTransport : null);
}

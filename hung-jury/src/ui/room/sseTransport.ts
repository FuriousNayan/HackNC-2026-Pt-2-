import type { RoomEvent } from '@/contracts';
import type { LiveTransport } from './liveTransport';

/**
 * Default realtime transport: Server-Sent Events from Part 2 (GET /api/cases/:id/events).
 * The browser reconnects by itself and sends Last-Event-ID, so the server resumes without a gap.
 * The session cookie authenticates the stream.
 */
export const sseTransport: LiveTransport = (channel, onEvent) => {
  const caseId = channel.replace(/^case:/, '');
  const source = new EventSource(`/api/cases/${encodeURIComponent(caseId)}/events`);
  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as RoomEvent);
    } catch {
      // ignore a malformed frame
    }
  };
  return () => source.close();
};

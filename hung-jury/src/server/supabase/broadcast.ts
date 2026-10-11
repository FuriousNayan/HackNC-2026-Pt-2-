// Server-side broadcaster for the one realtime channel per case,
// case:{id} (CONFIG.channel), carrying RoomEvent payloads. Clients
// (Part 1) subscribe with the anon key and render these events; they never
// compute phase, the dial, or the tally themselves.

import { CONFIG } from '@/contracts/config';
import type { RoomEvent } from '@/contracts/types';
import { getServiceClient } from './client';

export async function broadcastEvent(caseId: string, event: RoomEvent): Promise<void> {
  const client = getServiceClient();
  const channel = client.channel(CONFIG.channel(caseId));
  // Supabase Realtime broadcast: subscribe is required once per channel
  // instance before send() resolves over the websocket. Routes create a
  // short-lived channel per call; this trades a little latency for not
  // holding a persistent server-side socket per case.
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        reject(new Error(`realtime broadcast: channel ${status} for case ${caseId}`));
      }
    });
  });

  await channel.send({
    type: 'broadcast',
    event: event.type,
    payload: event,
  });

  await client.removeChannel(channel);
}

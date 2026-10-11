import { createHmac } from 'node:crypto';

/**
 * Optional live video for the two arguers (HJ_VIDEO=livekit). Off by default.
 *
 * The jury never gets a token, so spectators only ever see bobbleheads. Tokens are LiveKit access tokens
 * (HS256 JWTs) made here with node:crypto, so there is no SDK on the server. Each arguer's camera starts only when
 * they press the button in the browser.
 */
export function videoOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.HJ_VIDEO === 'livekit';
}

export const roomName = (caseId: string) => `hj-${caseId}`;

const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');

export function signLiveKitToken(opts: {
  apiKey: string;
  apiSecret: string;
  identity: string;
  video: Record<string, unknown>;
  ttlSec: number;
  nowMs?: number;
}): string {
  const now = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iss: opts.apiKey, sub: opts.identity, nbf: now - 5, exp: now + opts.ttlSec, video: opts.video });
  const sig = createHmac('sha256', opts.apiSecret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export interface VideoConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function videoConfig(env: Record<string, string | undefined> = process.env): VideoConfig | null {
  const url = env.NEXT_PUBLIC_LIVEKIT_URL?.trim();
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

/** Short lived join token for one arguer in one case room. Publish and subscribe, no data channel. */
export function mintJoinToken(cfg: VideoConfig, caseId: string, handle: string, nowMs?: number) {
  const room = roomName(caseId);
  const token = signLiveKitToken({
    apiKey: cfg.apiKey,
    apiSecret: cfg.apiSecret,
    identity: handle,
    ttlSec: 15 * 60,
    nowMs,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false },
  });
  return { url: cfg.url, token, room };
}

/** Best effort: removes everyone from the case room (safety close or end of case). Never throws. */
export async function endVideoRoom(cfg: VideoConfig, caseId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const room = roomName(caseId);
    const admin = signLiveKitToken({
      apiKey: cfg.apiKey,
      apiSecret: cfg.apiSecret,
      identity: 'hj-server',
      ttlSec: 60,
      video: { roomAdmin: true, room },
    });
    const http = cfg.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');
    await fetchImpl(`${http}/twirp/livekit.RoomService/DeleteRoom`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${admin}` },
      body: JSON.stringify({ room }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // The 15 minute token expiry is the backstop.
  }
}

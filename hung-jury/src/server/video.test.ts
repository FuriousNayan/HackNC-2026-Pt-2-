import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as video } from '@/app/api/cases/[id]/video/route';
import { POST as session } from '@/app/api/session/route';
import { POST as fileCase } from '@/app/api/cases/route';
import { POST as accept } from '@/app/api/cases/[id]/accept/route';
import { getServer } from './runtime';
import { endVideoRoom, mintJoinToken, roomName, signLiveKitToken, videoConfig } from './video';

const cfg = { url: 'wss://demo.livekit.cloud', apiKey: 'APIkey', apiSecret: 'secret-secret-secret' };
const decode = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());

describe('livekit tokens', () => {
  it('signs a verifiable HS256 token with room grants and a short expiry', () => {
    const now = 1_700_000_000_000;
    const { token, room, url } = mintJoinToken(cfg, 'HJ-1', 'dave', now);
    const [h, b, sig] = token.split('.');
    expect(sig).toBe(createHmac('sha256', cfg.apiSecret).update(`${h}.${b}`).digest('base64url'));
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' });
    const claims = decode(token);
    expect(claims).toMatchObject({ iss: 'APIkey', sub: 'dave' });
    expect(claims.exp - Math.floor(now / 1000)).toBe(900);
    expect(claims.video).toEqual({ room: 'hj-HJ-1', roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
    expect(room).toBe(roomName('HJ-1'));
    expect(url).toBe(cfg.url);
  });
  it('reads config only when all three values are set', () => {
    expect(videoConfig({})).toBeNull();
    expect(videoConfig({ NEXT_PUBLIC_LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k' })).toBeNull();
    expect(videoConfig({ NEXT_PUBLIC_LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' })).toMatchObject({ apiKey: 'k' });
  });
  it('deletes the room with an admin token over https and never throws', async () => {
    const calls: { url: string; auth: string; body: string }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: String((init.headers as Record<string, string>).authorization), body: String(init.body) });
      return new Response('{}');
    }) as unknown as typeof fetch;
    await endVideoRoom(cfg, 'HJ-9', f);
    expect(calls[0].url).toBe('https://demo.livekit.cloud/twirp/livekit.RoomService/DeleteRoom');
    expect(JSON.parse(calls[0].body)).toEqual({ room: 'hj-HJ-9' });
    expect(decode(calls[0].auth.replace('Bearer ', '')).video).toEqual({ roomAdmin: true, room: 'hj-HJ-9' });
    await expect(endVideoRoom(cfg, 'x', (async () => { throw new Error('down'); }) as unknown as typeof fetch)).resolves.toBeUndefined();
    expect(signLiveKitToken({ apiKey: 'a', apiSecret: 'b', identity: 'i', video: {}, ttlSec: 1 }).split('.')).toHaveLength(3);
  });
});

const base = 'http://localhost:3000';
const post = (path: string, body?: unknown, cookie?: string) =>
  new Request(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const signIn = async (handle: string) => (await session(post('/api/session', { handle }))).headers.get('set-cookie')!.split(';')[0];

describe('video route', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is a 404 while HJ_VIDEO is off', async () => {
    await getServer().ready;
    const cookie = await signIn('vid_off');
    expect((await video(post('/api/cases/x/video', undefined, cookie), ctx('x'))).status).toBe(404);
  });

  it('gives tokens to the two arguers only, once the defendant accepted', async () => {
    vi.stubEnv('HJ_VIDEO', 'livekit');
    vi.stubEnv('NEXT_PUBLIC_LIVEKIT_URL', cfg.url);
    vi.stubEnv('LIVEKIT_API_KEY', cfg.apiKey);
    vi.stubEnv('LIVEKIT_API_SECRET', cfg.apiSecret);
    await getServer().ready;
    const dave = await signIn('vid_dave');
    const maya = await signIn('vid_maya');
    const nosy = await signIn('vid_nosy');
    const filed = await fileCase(post('/api/cases', { title: 'Video test', grievance: 'He ate my leftovers.', defendantHandle: 'vid_maya' }, dave), { params: Promise.resolve({}) });
    const { id } = (await filed.json()) as { id: string };
    expect(filed.status).toBe(200);
    // Filed but not accepted yet: no video.
    expect((await video(post(`/api/cases/${id}/video`, undefined, dave), ctx(id))).status).toBe(409);
    expect((await accept(post(`/api/cases/${id}/accept`, undefined, maya), ctx(id))).status).toBe(200);
    for (const cookie of [dave, maya]) {
      const res = await video(post(`/api/cases/${id}/video`, undefined, cookie), ctx(id));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string; room: string };
      expect(body.room).toBe(`hj-${id}`);
      expect(decode(body.token).video.room).toBe(`hj-${id}`);
    }
    expect((await video(post(`/api/cases/${id}/video`, undefined, nosy), ctx(id))).status).toBe(404);
    expect((await video(post(`/api/cases/${id}/video`), ctx(id))).status).toBe(401);
  });

  it('answers 503 when the flag is on but keys are missing', async () => {
    vi.stubEnv('HJ_VIDEO', 'livekit');
    vi.stubEnv('LIVEKIT_API_KEY', '');
    await getServer().ready;
    const cookie = await signIn('vid_nokeys');
    expect((await video(post('/api/cases/x/video', undefined, cookie), ctx('x'))).status).toBe(503);
  });
});

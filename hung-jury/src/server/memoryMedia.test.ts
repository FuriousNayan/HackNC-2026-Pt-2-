import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/media/[...key]/route';
import { resetMediaRuntime, configureMedia } from '@/media/runtime';
import { speak } from '@/media/voice';
import { memoryMediaStorage } from './memoryMedia';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetMediaRuntime();
});

describe('voice without Supabase storage', () => {
  it('generates speech, caches it in memory and serves it from /api/media', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'k');
    vi.stubEnv('ELEVENLABS_VOICE_ID', 'voice1');
    configureMedia({ storage: memoryMediaStorage() });
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { audioUrl } = await speak('Order in the court.', 0.5, 'quick');
    expect(audioUrl).toMatch(/^\/api\/media\/audio\/[a-f0-9]{64}\.mp3$/);
    const again = await speak('Order in the court.', 0.5, 'quick');
    expect(again.audioUrl).toBe(audioUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const res = await GET(new Request('http://localhost' + audioUrl), { params: Promise.resolve({ key: audioUrl.replace('/api/media/', '').split('/') }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([1, 2, 3, 4]);
  });
  it('refuses keys that are not generated media', async () => {
    for (const key of [['..', 'etc', 'passwd'], ['audio', 'nope.mp3'], ['heads', 'x', 'y.png']])
      expect((await GET(new Request('http://localhost/x'), { params: Promise.resolve({ key }) })).status).toBe(404);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  download: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: mock.createClient }));
beforeEach(() => {
  vi.resetModules();
  Object.values(mock).forEach((fn) => fn.mockReset());
  mock.createClient.mockReturnValue({ storage: { from: () => mock } });
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'unit-test-key');
  vi.stubEnv('SUPABASE_MEDIA_BUCKET', 'private-media');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('default partner Supabase adapter', () => {
  it('reads bytes, uploads correct types and refreshes signed URLs', async () => {
    mock.download.mockResolvedValue({ data: new Blob(['audio']), error: null });
    mock.upload.mockResolvedValue({ error: null });
    mock.createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: 'signed-1' }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: 'signed-2' }, error: null });
    const { storage } = await import('./storage');
    const store = storage();
    expect(new TextDecoder().decode((await store.read('audio/test.mp3'))!)).toBe('audio');
    await store.write('heads/user/head.png', new Uint8Array([1]), 'image/png');
    expect(mock.upload).toHaveBeenCalledWith('heads/user/head.png', expect.any(Uint8Array), {
      contentType: 'image/png',
      upsert: true,
    });
    expect(await store.url('audio/test.mp3')).toBe('signed-1');
    expect(await store.url('audio/test.mp3')).toBe('signed-2');
    expect(mock.createSignedUrl).toHaveBeenCalledTimes(2);
    expect(mock.createClient).toHaveBeenCalledWith('https://storage.test', 'unit-test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });
  it.each([
    { statusCode: '404', message: 'Not found' },
    { statusCode: '400', message: 'Object not found' },
  ])('treats missing objects as cache misses: %j', async (error) => {
    mock.download.mockResolvedValue({ data: null, error });
    const { storage } = await import('./storage');
    expect(await storage().read('missing')).toBeNull();
  });
  it('propagates storage errors rather than treating denied reads as cache misses', async () => {
    mock.download.mockResolvedValue({
      data: null,
      error: { statusCode: '403', message: 'Denied' },
    });
    mock.upload.mockResolvedValue({ error: { message: 'Denied' } });
    mock.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Denied' } });
    const { storage } = await import('./storage');
    const store = storage();
    await expect(store.read('private')).rejects.toThrow('read failed');
    await expect(store.write('private', new Uint8Array(), 'audio/mpeg')).rejects.toThrow(
      'upload failed',
    );
    await expect(store.url('private')).rejects.toThrow('URL creation failed');
  });
  it('paginates cleanup and removes only owner-scoped files in bounded batches', async () => {
    const files = Array.from({ length: 205 }, (_, i) => ({
      id: String(i),
      name: `${String(i).padStart(4, '0')}.png`,
    }));
    mock.list.mockImplementation(
      async (_prefix: string, { offset, limit }: { offset: number; limit: number }) => ({
        data: files.slice(offset, offset + limit),
        error: null,
      }),
    );
    mock.remove.mockResolvedValue({ error: null });
    const { storage } = await import('./storage');
    await storage().deletePrefix('heads/owner');
    expect(mock.list.mock.calls.map((call) => call[1].offset)).toEqual([0, 100, 200, 205]);
    expect(mock.remove.mock.calls.map((call) => call[0].length)).toEqual([100, 100, 5]);
    expect(
      mock.remove.mock.calls
        .flatMap((call) => call[0])
        .every((key: string) => key.startsWith('heads/owner/')),
    ).toBe(true);
  });
  it('rejects cleanup folders and propagates deletion failures', async () => {
    const { storage } = await import('./storage');
    mock.list.mockResolvedValueOnce({ data: [{ id: null, name: 'nested' }], error: null });
    await expect(storage().deletePrefix('heads/user')).rejects.toThrow('flat');
    expect(mock.remove).not.toHaveBeenCalled();
    mock.list
      .mockResolvedValueOnce({ data: [{ id: '1', name: 'head.png' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    mock.remove.mockResolvedValue({ error: { message: 'Denied' } });
    await expect(storage().deletePrefix('heads/user')).rejects.toThrow('cleanup failed');
  });
  it('uses configured injected storage without creating a Supabase client', async () => {
    const { configureMedia } = await import('./runtime');
    const store = { read: vi.fn(), write: vi.fn(), url: vi.fn(), deletePrefix: vi.fn() };
    configureMedia({ storage: store });
    const { storage } = await import('./storage');
    expect(storage()).toBe(store);
    expect(mock.createClient).not.toHaveBeenCalled();
  });
});
describe('partner image moderation provider', () => {
  const safe = { adult: 'UNLIKELY', racy: 'VERY_UNLIKELY', violence: 'POSSIBLE' };
  beforeEach(() => vi.stubEnv('GOOGLE_VISION_API_KEY', 'unit-vision-key'));
  it('requests SafeSearch and face detection on the exact cropped bytes', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        responses: [
          { safeSearchAnnotation: safe, faceAnnotations: [{ detectionConfidence: 0.9 }] },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const { moderateImage } = await import('./moderation');
    expect(await moderateImage(new Uint8Array([1, 2, 3]))).toEqual({ safe: true, hasFace: true });
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.requests[0].image.content).toBe('AQID');
    expect(body.requests[0].features.map((f: { type: string }) => f.type)).toEqual([
      'SAFE_SEARCH_DETECTION',
      'FACE_DETECTION',
    ]);
  });
  it.each(['LIKELY', 'VERY_LIKELY', 'UNKNOWN'])(
    'denies %s classifications',
    async (classification) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({
            responses: [
              {
                safeSearchAnnotation: { ...safe, adult: classification },
                faceAnnotations: [{ detectionConfidence: 1 }],
              },
            ],
          }),
        ),
      );
      const { moderateImage } = await import('./moderation');
      expect((await moderateImage(new Uint8Array([1]))).safe).toBe(false);
    },
  );
  it('does not accept a low-confidence or missing face', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          responses: [
            { safeSearchAnnotation: safe, faceAnnotations: [{ detectionConfidence: 0.1 }] },
          ],
        }),
      ),
    );
    const { moderateImage } = await import('./moderation');
    expect((await moderateImage(new Uint8Array([1]))).hasFace).toBe(false);
  });
  it('fails closed on missing classifications and provider errors', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ responses: [{}] }))
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    const { moderateImage } = await import('./moderation');
    await expect(moderateImage(new Uint8Array([1]))).rejects.toThrow('no result');
    await expect(moderateImage(new Uint8Array([1]))).rejects.toThrow('provider failed');
  });
});

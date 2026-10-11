import { MEDIA_KEY, readMemoryMedia } from '@/server/memoryMedia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/media/audio/<hash>.mp3 or /api/media/heads/<owner>/<uuid>.png: the in-memory fallback cache only. */
export async function GET(_request: Request, ctx: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const key = (await ctx.params).key.join('/');
  if (!MEDIA_KEY.test(key)) return new Response('Not found', { status: 404 });
  const file = readMemoryMedia(key);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(file.bytes as BodyInit, {
    headers: {
      'Content-Type': file.type,
      'Content-Length': String(file.bytes.length),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

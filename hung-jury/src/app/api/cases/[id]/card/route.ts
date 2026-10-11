import '@/server/media-bootstrap';
import { verdictCardPng } from '@/media/cards';
import { optionalAdapter } from '@/media/runtime';
import type { CardFormat } from '@/contracts';

export const runtime = 'nodejs';

/**
 * GET /api/cases/:id/card?format=portrait|square returns the verdict card PNG for the Share button.
 * Access control lives in the loadVerdict adapter, which must throw unless the caller may see a finished,
 * non safety-closed verdict. Until Part 2 supplies it (or mock mode is on) every request is denied.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const loadVerdict = optionalAdapter('loadVerdict');
  if (!loadVerdict) return Response.json({ error: 'Media integration not configured' }, { status: 401 });
  const { id } = await ctx.params;
  const raw = new URL(request.url).searchParams.get('format') ?? 'portrait';
  if (raw !== 'portrait' && raw !== 'square') return Response.json({ error: 'Invalid format' }, { status: 400 });
  const format: CardFormat = raw;
  try {
    const png = await verdictCardPng(await loadVerdict(id, format), format);
    return new Response(new Uint8Array(png), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=60' },
    });
  } catch {
    return Response.json({ error: 'Verdict card unavailable' }, { status: 404 });
  }
}

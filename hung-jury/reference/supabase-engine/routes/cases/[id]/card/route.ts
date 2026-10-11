import { NextRequest, NextResponse } from 'next/server';
import { renderVerdictCard } from '@/media';
import { getAuthedUser } from '@/server/auth';

// GET /api/cases/:id/card?format=portrait|square — calls Part 4's
// renderVerdictCard(). Part 2 owns this route file, but it only calls Part
// 4's function; loadVerdict (src/server/mediaBootstrap.ts, registered once
// per process by instrumentation.ts) enforces that the case is visible to
// the caller and not safety-closed.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const format = (req.nextUrl.searchParams.get('format') ?? 'portrait') as 'portrait' | 'square';
  if (format !== 'portrait' && format !== 'square') {
    return NextResponse.json({ error: 'format must be portrait or square' }, { status: 400 });
  }

  try {
    const url = await renderVerdictCard(id, format);
    return NextResponse.redirect(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'card unavailable';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

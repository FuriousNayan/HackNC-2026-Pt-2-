import { NextRequest, NextResponse } from 'next/server';
import type { ApiErrorBody, ReactRequest, ReactResponse } from '@/contracts/api';
import { getAuthedUser } from '@/server/auth';
import { getServiceClient } from '@/server/db/client';
import { checkReactionCooldown } from '@/server/rateLimits';
import { broadcastEvent } from '@/server/realtime/broadcast';

const VALID_KINDS = new Set(['gasp', 'gavel', 'objection', 'laugh', 'boo', 'order']);

// POST /api/cases/:id/react — stores a reaction and broadcasts it. Enforces
// limits.reactionCooldownMs per person.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ error: 'not signed in' }, { status: 401 });

  const body = (await req.json()) as ReactRequest;
  if (!VALID_KINDS.has(body.kind)) {
    return NextResponse.json<ApiErrorBody>({ error: 'invalid reaction kind' }, { status: 400 });
  }

  const allowed = await checkReactionCooldown(id, user.id);
  if (!allowed) {
    return NextResponse.json<ApiErrorBody>({ error: 'reaction cooldown active' }, { status: 429 });
  }

  const db = getServiceClient();
  const { error } = await db.from('reactions').insert({ case_id: id, user_id: user.id, kind: body.kind });
  if (error) return NextResponse.json<ApiErrorBody>({ error: 'failed to record reaction' }, { status: 500 });

  await broadcastEvent(id, { type: 'reaction', kind: body.kind, fromHandle: user.handle });

  return NextResponse.json<ReactResponse>({ recorded: true });
}

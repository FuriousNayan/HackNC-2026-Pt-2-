import { NextRequest, NextResponse } from 'next/server';
import type { ApiErrorBody, VoteRequest, VoteResponse } from '@/contracts/api';
import { getAuthedUser } from '@/server/auth';
import { getServiceClient } from '@/server/db/client';
import { broadcastEvent } from '@/server/realtime/broadcast';

// POST /api/cases/:id/vote — writes to votes only, then broadcasts a jury
// event. Only participants with the juror role can write a vote.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ error: 'not signed in' }, { status: 401 });

  const body = (await req.json()) as VoteRequest;
  if (body.vote !== 'guilty' && body.vote !== 'not_guilty') {
    return NextResponse.json<ApiErrorBody>({ error: 'vote must be guilty or not_guilty' }, { status: 400 });
  }

  const db = getServiceClient();
  const { data: participant } = await db
    .from('participants')
    .select('role')
    .eq('case_id', id)
    .eq('user_id', user.id)
    .eq('role', 'juror')
    .maybeSingle();
  if (!participant) {
    return NextResponse.json<ApiErrorBody>({ error: 'only jurors can vote' }, { status: 403 });
  }

  const { error: upsertErr } = await db
    .from('votes')
    .upsert({ case_id: id, user_id: user.id, vote: body.vote }, { onConflict: 'case_id,user_id' });
  if (upsertErr) {
    return NextResponse.json<ApiErrorBody>({ error: 'failed to record vote' }, { status: 500 });
  }

  const { data: tally } = await db.from('votes').select('vote').eq('case_id', id);
  const total = tally?.length ?? 0;
  const guilty = (tally ?? []).filter((v) => v.vote === 'guilty').length;
  const guiltyPct = total > 0 ? Math.round((guilty / total) * 100) : 0;

  const { count: viewers } = await db
    .from('participants')
    .select('user_id', { count: 'exact', head: true })
    .eq('case_id', id)
    .eq('role', 'juror');

  await broadcastEvent(id, {
    type: 'jury',
    guiltyPct,
    notGuiltyPct: 100 - guiltyPct,
    viewers: viewers ?? 0,
    jurors: [],
  });

  return NextResponse.json<VoteResponse>({ recorded: true });
}

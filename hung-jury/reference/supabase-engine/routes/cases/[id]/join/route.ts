import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/contracts/config';
import type { ApiErrorBody, JoinCaseResponse } from '@/contracts/api';
import { getAuthedUser } from '@/server/auth';
import { getServiceClient } from '@/server/db/client';
import { broadcastEvent } from '@/server/realtime/broadcast';

// POST /api/cases/:id/join — a spectator becomes a juror and gets a seat, up
// to limits.jurySeats, then counts as a viewer.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ error: 'not signed in' }, { status: 401 });

  const db = getServiceClient();
  const { data: caseRow, error } = await db.from('cases').select('id, listed, safety_closed').eq('id', id).single();
  if (error || !caseRow || !caseRow.listed || caseRow.safety_closed) {
    return NextResponse.json<ApiErrorBody>({ error: 'case is not open to spectators' }, { status: 404 });
  }

  const { data: existing } = await db
    .from('participants')
    .select('role')
    .eq('case_id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json<JoinCaseResponse>({ role: existing.role, seatTaken: existing.role === 'juror' });
  }

  const { count: jurorCount } = await db
    .from('participants')
    .select('user_id', { count: 'exact', head: true })
    .eq('case_id', id)
    .eq('role', 'juror');

  const seatTaken = (jurorCount ?? 0) < CONFIG.limits.jurySeats;
  if (seatTaken) {
    await db.from('participants').insert({ case_id: id, user_id: user.id, role: 'juror' });
  }

  const { count: viewers } = await db
    .from('participants')
    .select('user_id', { count: 'exact', head: true })
    .eq('case_id', id)
    .eq('role', 'juror');

  const { data: jurors } = await db
    .from('participants')
    .select('profiles:user_id(handle), head_image_ref')
    .eq('case_id', id)
    .eq('role', 'juror');

  await broadcastEvent(id, {
    type: 'jury',
    guiltyPct: 0,
    notGuiltyPct: 0,
    viewers: viewers ?? 0,
    jurors: (jurors ?? []).map((j: any) => ({
      handle: j.profiles?.handle ?? 'unknown',
      headImageUrl: j.head_image_ref ?? '',
    })),
  });

  return NextResponse.json<JoinCaseResponse>({ role: 'juror', seatTaken });
}

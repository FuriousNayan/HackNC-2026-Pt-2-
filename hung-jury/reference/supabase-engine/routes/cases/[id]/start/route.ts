import { NextRequest, NextResponse } from 'next/server';
import type { ApiErrorBody, StartCaseResponse } from '@/contracts/api';
import { getAuthedUser } from '@/server/auth';
import { getServiceClient } from '@/server/db/client';
import { startTrial, timerSecondsFor } from '@/server/caseEngine';
import { broadcastEvent } from '@/server/realtime/broadcast';

// POST /api/cases/:id/start — both arguers present. Runs the opening judge
// turn and starts the timer. "Both present" must pass before this works.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ error: 'not signed in' }, { status: 401 });

  const db = getServiceClient();
  const { data: caseRow, error } = await db.from('cases').select('*').eq('id', id).single();
  if (error || !caseRow) return NextResponse.json<ApiErrorBody>({ error: 'case not found' }, { status: 404 });
  if (caseRow.filer_id !== user.id) {
    return NextResponse.json<ApiErrorBody>({ error: 'only the filer can start the trial' }, { status: 403 });
  }
  if (caseRow.status !== 'accepted') {
    return NextResponse.json<ApiErrorBody>({ error: `case is ${caseRow.status}, not accepted` }, { status: 409 });
  }

  const { data: participants } = await db
    .from('participants')
    .select('role')
    .eq('case_id', id)
    .in('role', ['plaintiff', 'defendant']);
  const roles = new Set((participants ?? []).map((p) => p.role));
  if (!roles.has('plaintiff') || !roles.has('defendant')) {
    return NextResponse.json<ApiErrorBody>({ error: 'both arguers must be present to start' }, { status: 409 });
  }

  const seconds = timerSecondsFor('opening');
  const timerEndsAt = new Date(Date.now() + seconds * 1000).toISOString();
  await db
    .from('cases')
    .update({ status: 'live', phase: 'opening', started_at: new Date().toISOString(), timer_ends_at: timerEndsAt })
    .eq('id', id);
  await broadcastEvent(id, { type: 'state', phase: 'opening', activeRole: 'judge', timerEndsAt });

  const { data: updatedCase } = await db.from('cases').select('*').eq('id', id).single();
  await startTrial(updatedCase as any);

  return NextResponse.json<StartCaseResponse>({ caseId: id, phase: 'opening', timerEndsAt });
}

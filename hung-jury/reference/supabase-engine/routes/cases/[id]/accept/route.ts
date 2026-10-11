import { NextRequest, NextResponse } from 'next/server';
import type { AcceptCaseResponse, ApiErrorBody } from '@/contracts/api';
import { getAuthedUser } from '@/server/auth';
import { getServiceClient } from '@/server/db/client';

// POST /api/cases/:id/accept — defendant accepts and the case is listed on
// the docket.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ error: 'not signed in' }, { status: 401 });

  const db = getServiceClient();
  const { data: caseRow, error } = await db.from('cases').select('*').eq('id', id).single();
  if (error || !caseRow) return NextResponse.json<ApiErrorBody>({ error: 'case not found' }, { status: 404 });
  if (caseRow.defendant_id !== user.id) {
    return NextResponse.json<ApiErrorBody>({ error: 'only the named defendant can accept' }, { status: 403 });
  }
  if (caseRow.status !== 'filed') {
    return NextResponse.json<ApiErrorBody>({ error: `case is already ${caseRow.status}` }, { status: 409 });
  }

  const { data: updated, error: updateErr } = await db
    .from('cases')
    .update({ status: 'accepted', listed: true })
    .eq('id', id)
    .select('id, status')
    .single();
  if (updateErr || !updated) {
    return NextResponse.json<ApiErrorBody>({ error: 'failed to accept case' }, { status: 500 });
  }

  await db.from('participants').insert({ case_id: id, user_id: user.id, role: 'defendant' });

  return NextResponse.json<AcceptCaseResponse>({ caseId: updated.id, status: updated.status });
}
